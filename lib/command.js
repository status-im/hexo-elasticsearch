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

const INDEXED_PROPERTIES = [
  'title',
  'excerpt',
  'raw',
  'author',
  //'date',
  //'updated',
  //'layout'
];

function bulkCallback(err, resp) {
  /* if there's an error show it */
  if (err) {
    error(`%s`, err);
    error('>> ElasticSearch request failed.');
  }
  /* if there are errors in specific operations show them */
  if (resp.errors) {
    each(resp.items, (item) => {
      if (item.status != 200) {
        error(item);
      }
    })
  } else {
    info('Successful indexing of %d posts.', resp.items.length);
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
  const info = (msg, ...args) => this.log.info(`${prefix} ${msg}`, ...args);
  const error = (msg, ...args) => this.log.error(`${prefix} ${msg}`, ...args);
  /* merge defaults with config from _config.yml */
  const conf = Object.assign({}, CONFIG_DEFAULTS, hexo.config.elasticsearch);
  /* for global access to ElasticSearch client */
  var es;

  Promise.resolve(conf.esUser)
    .then(() => {
      if (!conf.esUser || !conf.esPass) {
        error('Please set the necessary env variables to gain access to API:');
        error('* `HEXO_ES_USER` - HTTP Auth user to access API.');
        error('* `HEXO_ES_PASS` - HTTP Auth pass to access API.');
        process.exit(1);
      }
      if (!conf.index) {
        error('Please provide an ElasticSearch index name in your hexo _config.yml file.');
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
          error('%s', err.message);
          error('>> ElasticSearch might be unavilable.');
          process.exit(1);
        })
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

        /* simpler property names */
        post.url = data.permalink;

        /* dates by default are stored as objects */
        post.created = data.date.toISOString();
        post.updated = data.updated.toISOString();

        if (Array.isArray(data.categories)) {
          post.categories = data.categories.map(function(item) {
            return pick(item, ['name', 'path']);
          });
        }

        if (Array.isArray(data.tags)) {
          post.tags = data.tags.map(function(item) {
            return pick(item, ['name', 'path']);
          });
        }
        
        post.author = data.author || conf.author;

        /* generate operation objects for batch call */
        return [
          /* all docs in ElasticSearch need a unique _id */
          {index:{_index: conf.index, _type: 'post', _id: sha1(data.path)}},
          post,
        ];
      });
    })
    .then((actionsAndPosts) => { /* flatten arrays of arrays into single array */
      info('%d pages and posts to index.', actionsAndPosts.length);
      return [].concat.apply([], actionsAndPosts);
    })
    .then((postsBatch) => { /* batch upload posts to ElasticSearch */
      es.bulk({body: postsBatch}, bulkCallback)
    })
    .then(() => {
      info('Indexing done.');
    })
    .catch(callback);
};
