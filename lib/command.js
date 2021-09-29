'use strict'
const each = require('p-each-series')
const esearch = require('elasticsearch')
const crypto = require('crypto')

const prefix = '[hexo-elasticsearch]'

const CONFIG_DEFAULTS = {
  esProt: String(process.env.HEXO_ES_PROT || 'https'),
  esHost: String(process.env.HEXO_ES_HOST || 'localhost'),
  esPort: String(process.env.HEXO_ES_PORT || 9200),
  esUser: String(process.env.HEXO_ES_USER || ''),
  esPass: String(process.env.HEXO_ES_PASS || ''),
}
const CONSOLE_DEFAULTS = {
  dryRun: false,
  flush: false,
  chunkSize: 50
}

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
}

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
}

const INDEXED_PROPERTIES = [
  'title',
  'excerpt',
  'author',
]

function bulkCallback(err, resp) {
  /* if there's an error show it */
  if (err) {
    this.log.error(`${prefix} Status: %s Error: %s`, err.status, err.message)
    this.log.error(`${prefix} >> ElasticSearch request failed.`)
    process.exit(1)
  }
  /* if there are errors in specific operations show them */
  if (resp.errors) {
    each(resp.items, (item) => {
      if (item.status != 200) {
        this.log.error('Error: %s', item)
        console.dir(item)
      }
    })
  } else {
    this.log.info(`${prefix} Successful indexing of %d posts.`, resp.items.length)
  }
}

function sha1(text) {
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex')
}

function pick(object, properties) {
  return properties.reduce(function(filteredObj, prop) {
    filteredObj[prop] = object[prop]
    return filteredObj
  }, {})
}

function extractTags(objects) {
  /* if objects are not an array just skip this */
  if (!Array.isArray(objects)) {
    return null
  }
  return objects.map(function(item) {
    return pick(item, ['name', 'path'])
  })
}

function chunk(array, chunkSize) {
  let batches = []

  while (array.length > 0) {
    batches.push(array.splice(0, chunkSize))
  }

  return batches
}

/* just some helpers for logging */
const setLogPrefix = (log) => ({
  info: (msg, ...args) => log.info(`${prefix} ${msg}`, ...args),
  warn: (msg, ...args) => log.warn(`${prefix} ${msg}`, ...args),
  err:  (msg, ...args) => log.error(`${prefix} ${msg}`, ...args),
  dbg:  (msg, ...args) => log.debug(`${prefix} ${msg}`, ...args),
})

const esTestConnection = async (log, es) => {
  log.info('Testing ElasticSearch access.')
  try {
    let data = await es.cluster.health()
    log.info('Status: %s, Nodes: %d', data[`status`], data['number_of_nodes'])
  } catch (err) {
    log.err('%s', err.message)
    log.err('>> ElasticSearch might be unavilable.')
    process.exit(1)
  }
}

const esDeleteIndex = async (log, es, index) => {
  try {
    await es.indices.getMapping({index: index})
    log.warn('Deleting index: %s', index)
    await es.indices.delete({index: index})
  } catch (err) {
    log.err('Failed to delete index: %', err.message)
    log.dbg(err)
  }
}

const esCreateIndex = async (log, es, index) => {
  try {
    /* check if index exists */
    await es.indices.getMapping({index: index})
  } catch(e) { /* index doesn't exist */
    log.info('Creating index: %s', index)
    await es.indices.create({index: index})
  }
}

const esUpdateIndexSettings = async (log, es, index) => {
  log.info('Updating index: %s', index)
  await es.indices.close({index: index})
  try {
    await es.indices.putSettings({
      index: index,
      body: INDEX_SETTINGS,
    })
  } catch (error) {
    log.err('%s', error)
    log.err('>> Unable to configure index settings!')
    process.exit(1)
  }
}

const esUpdateIndexMappings = async (log, es, index) => {
  try {
    await es.indices.open({index: index})
    await es.indices.putMapping({
      index: index,
      body: INDEX_MAPPINGS,
      type: '_doc',
      include_type_name: true,
    })
  } catch (error) {
    log.err('%s', error)
    log.err('>> Unable to configure index mappings!')
    process.exit(1)
  }
}

const loadPostsAndPages = async (hexo) => {
  /* load published posts */
  let pubPosts = await hexo.database.model('Post').find({ published: true }).toArray()
  /* load all pages */
  var pages = hexo.database.model('Page').find({
    layout: {'$in': ['page']}
  })
  /* combine both lists */
  return pubPosts.concat(pages.toArray())
}

const prepareEsFields = (posts, conf) => {
  return posts.map(function(data) {
    let post = pick(data, INDEXED_PROPERTIES)
    /* give a better name to whole article */
    post.content = data.raw
    /* simpler property names */
    post.url = data.permalink
    /* dates by default are stored as objects */
    post.created = data.date.toISOString()
    post.updated = data.updated.toISOString()
    /* reduce tags and categories to simple lists */
    post.categories = extractTags(data.categories)
    post.tags = extractTags(data.tags)
    /* fallback to page author if missing from page */
    post.author = data.author || conf.author

    return post
  })
}

const prepareEsBatche = (esDocs, index) => {
  /**
   * Generate operation objects for batch call.
   * See: https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/api-reference-6-5.html#api-bulk-6-5
   * All docs in ElasticSearch need a unique _id.
   **/
  let actionsAndPosts = esDocs.map((post) => [
    { index: { _index: index, _type: '_doc', _id: sha1(post.url)} },
    post, /* first object in array is the action, second is the doc */
  ])
  /* flatten arrays of arrays into single array */
  return [].concat.apply([], actionsAndPosts)
}

module.exports = async function(args, callback) {
  const hexo = this
  const log = setLogPrefix(hexo.log)
  /* merge defaults with config from _config.yml */
  const conf = Object.assign({}, CONFIG_DEFAULTS, hexo.config.elasticsearch)
  const opts = Object.assign({}, CONSOLE_DEFAULTS, args || {})

  if (!conf.esUser || !conf.esPass) {
    log.err('Please set the necessary env variables to gain access to API:')
    log.err('* `HEXO_ES_USER` - HTTP Auth user to access API.')
    log.err('* `HEXO_ES_PASS` - HTTP Auth pass to access API.')
    process.exit(1)
  }

  if (!conf.index) {
    log.err('Please provide an ElasticSearch index name in your hexo _config.yml file.')
    process.exit(1)
  }

  /* load all hexo documents */
  await hexo.load()

  /* create the ElasticSearch client */
  const es = new esearch.Client({
    host: `${conf.esProt}://${conf.esUser}:${conf.esPass}@${conf.esHost}:${conf.esPort}`,
    ssl: { rejectUnauthorized: false, pfx: [] },
  })

  /* verify ES cluster is reachable */
  await esTestConnection(log, es)

  /* delete the index if --delete specified */
  if (opts.delete) {
    await esDeleteIndex(log, es, conf.index)
  }

  /* create index if missing, set mappings */
  await esCreateIndex(log, es, conf.index)

  /* update index field mappings & settings */
  await esUpdateIndexSettings(log, es, conf.index)
  await esUpdateIndexMappings(log, es, conf.index)

  /* load all posts and pages */
  let posts = await loadPostsAndPages(hexo)
  log.info('%d pages and posts to index.', posts.length)

  /* extract fields to index */
  let esDocs = prepareEsFields(posts, conf)
  let postsBatch = prepareEsBatche(esDocs, conf.index)

  /* stop here if just a dry-run */
  if (opts.dryRun) {
    log.warn('Skipping indexing due to --dry-run option.')
    return
  }

  /* batch upload posts to ElasticSearch */
  await es.bulk({body: postsBatch}, bulkCallback.bind(hexo))
  log.info('Indexing done.')
  callback()
}
