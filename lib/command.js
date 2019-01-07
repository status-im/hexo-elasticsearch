'use strict';
const each = require('p-each-series');
const esearch = require('elasticsearch');
const crypto = require('crypto');

const prefix = '[hexo-elasticsearch]'

const CONFIG_DEFAULTS = {
  esProt: String(process.env.HEXO_ES_PROT || 'https'),
  esHost: String(process.env.HEXO_ES_HOST || 'localhost'),
  esPort: String(process.env.HEXO_ES_PORT || 9200),
  esUser: String(process.env.HEXO_ES_USER || ''),
  esPass: String(process.env.HEXO_ES_PASS || ''),
};
const CONSOLE_DEFAULTS = {
  dryRun: false,
  flush: false,
  chunkSize: 50
};

const INDEX_SETTINGS = {
  settings: {
    analysis: {
      filter: {
        autocomplete_filter: {
          type: "edge_ngram",
          min_gram: 3,
          max_gram: 15,
        },
      },
      analyzer: {
        autocomplete: { 
          type: "custom",
          tokenizer: "standard",
          filter: [
            "lowercase",
            "autocomplete_filter"
          ],
        },
      },
    },
  },
};

const INDEX_MAPPINGS = {
  properties: {
    content: {
      type: "text",
      /* this ignores english filler words */
      analyzer: "english",
      /* this ignores frequency of word appearing */
      index_options: "docs",
      /* store the not analyzed version separately */
      //fields: {
      //  raw: { 
      //    type: "text",
      //    index: "not_analyzed",
      //  },
      //},
    },
    title: {
      type: "text",
      /* use autocomplete one at index time */
      analyzer: "autocomplete",
      /* use standard at search time */
      search_analyzer: "standard"
    },
    tags: { type: "keyword" },
    categories: { type: "keyword" },
  }
};

const INDEXED_PROPERTIES = [
  'title',
  'excerpt',
  'author',
];

function bulkCallback(err, resp) {
  /* if there's an error show it */
  if (err) {
    this.log.error(`${prefix} Status: %s Error: %s`, err.status, err.message);
    this.log.error(`${prefix} >> ElasticSearch request failed.`);
    process.exit(1);
  }
  /* if there are errors in specific operations show them */
  if (resp.errors) {
    each(resp.items, (item) => {
      if (item.status != 200) {
        this.log.error('Error: %s', item);
        console.dir(item)
      }
    })
  } else {
    this.log.info(`${prefix} Successful indexing of %d posts.`, resp.items.length);
  }
}

function sha1(text) {
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex');
}

function pick(object, properties) {
  return properties.reduce(function(filteredObj, prop) {
    filteredObj[prop] = object[prop];
    return filteredObj;
  }, {});
}

function extractTags(objects) {
  /* if objects are not an array just skip this */
  if (!Array.isArray(objects)) {
    return null;
  }
  return objects.map(function(item) {
    return pick(item, ['name', 'path']);
  });
}

function chunk(array, chunkSize) {
  var batches = [];

  while (array.length > 0) {
    batches.push(array.splice(0, chunkSize));
  }

  return batches;
}

module.exports = function(args, callback) {
  const hexo = this;
  /* just some helpers for loggin */
  const info = (msg, ...args) => hexo.log.info(`${prefix} ${msg}`, ...args);
  const warn = (msg, ...args) => hexo.log.warn(`${prefix} ${msg}`, ...args);
  const err = (msg, ...args) => hexo.log.error(`${prefix} ${msg}`, ...args);
  const dbg = (msg, ...args) => hexo.log.debug(`${prefix} ${msg}`, ...args);
  /* merge defaults with config from _config.yml */
  const conf = Object.assign({}, CONFIG_DEFAULTS, hexo.config.elasticsearch);
  const opts = Object.assign({}, CONSOLE_DEFAULTS, args || {});
  /* for global access to ElasticSearch client */
  var es;

  Promise.resolve(conf.esUser)
    .then(() => {
      if (!conf.esUser || !conf.esPass) {
        err('Please set the necessary env variables to gain access to API:');
        err('* `HEXO_ES_USER` - HTTP Auth user to access API.');
        err('* `HEXO_ES_PASS` - HTTP Auth pass to access API.');
        process.exit(1);
      }
      if (!conf.index) {
        err('Please provide an ElasticSearch index name in your hexo _config.yml file.');
        process.exit(1);
      }

      es = new esearch.Client({
          host: `${conf.esProt}://${conf.esUser}:${conf.esPass}@${conf.esHost}:${conf.esPort}`
      })
    })
    .then(() => {
      info('Testing ElasticSearch access.');
      return es.cluster.health()
        .then((data) => {
          info('Status: %s, Nodes: %d', data[`status`], data['number_of_nodes'])
        })
        .catch((err) => {
          err('%s', err.message);
          err('>> ElasticSearch might be unavilable.');
          process.exit(1);
        })
    })
    .then(async () => { /* delete the index if --delete specified */
      if (opts.delete) {
        try {
          await es.indices.getMapping({index: conf.index});
          warn('Deleting index: %s', conf.index);
          await es.indices.delete({index: conf.index})
            .catch((e) => {
              err('Failed to delete index: %', e.message);
              dbg(e);
            });
        } catch (e) {}
      }
    })
    .then(async () => { /* create index if missing, set mappings */
      /* check if index exists */
      try {
        await es.indices.getMapping({index: conf.index});
      } catch(e) { /* index doesn't exist */
        info('Creating index: %s', conf.index)
        await es.indices.create({index: conf.index});
      }
      info('Updating index: %s', conf.index)
      await es.indices.close({index: conf.index});
      /* update index field mappings & settings */
      await es.indices.putSettings({
        index: conf.index, body: INDEX_SETTINGS,
      })
        .catch((error) => {
          err('%s', error);
          err('>> Unable to configure index settings!')
          process.exit(1)
        });
      await es.indices.open({index: conf.index});
      await es.indices.putMapping({
        index: conf.index, type: '_doc', body: INDEX_MAPPINGS,
      })
        .catch((error) => {
          err('%s', error);
          err('>> Unable to configure index mappings!')
          process.exit(1)
        });
    })
    .then(() => { /* load all hexo documents */
      return hexo.load();
    })
    .then(() => { /* load published posts */
      return hexo.database.model('Post').find({ published: true }).toArray();
    })
    .then((pubPosts) => { /* load all pages */
      var pages = hexo.database.model('Page').find({
        layout: {'$in': ['page']}
      });
      return pubPosts.concat(pages.toArray());
    })
    .then((allPosts) => { /* extract fields to index */
      return allPosts.map(function(data) {
        var post = pick(data, INDEXED_PROPERTIES);
        /* give a better name to whole article */
        post.content = data.raw;
        /* simpler property names */
        post.url = data.permalink;
        /* dates by default are stored as objects */
        post.created = data.date.toISOString();
        post.updated = data.updated.toISOString();
        /* reduce tags and categories to simple lists */
        post.categories = extractTags(data.categories);
        post.tags = extractTags(data.tags);
        /* fallback to page author if missing from page */
        post.author = data.author || conf.author;

        return post;
      });
    })
    .then((cleanedPosts) => { /* prepare for barch upload */
      /**
       * Generate operation objects for batch call.
       * See: https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/api-reference-6-5.html#api-bulk-6-5
       * All docs in ElasticSearch need a unique _id.
       **/
      info('%d pages and posts to index.', cleanedPosts.length);
      return cleanedPosts.map((post) => [
        { index: { _index: conf.index, _type: '_doc', _id: sha1(post.url)} },
        post, /* first object in array is the action, second is the doc */
      ]);
    })
    .then((actionsAndPosts) => { /* flatten arrays of arrays into single array */
      return [].concat.apply([], actionsAndPosts);
    })
    .then(async (postsBatch) => { /* batch upload posts to ElasticSearch */
      if (opts.dryRun) {
        warn('Skipping indexing due to --dry-run option.');
        return;
      }
      await es.bulk({body: postsBatch}, bulkCallback.bind(hexo))
    })
    .then(() => {
      info('Indexing done.');
    })
    .catch(callback);
};
