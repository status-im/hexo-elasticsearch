'use strict';
const each = require('p-each-series');
const esearch = require('elasticsearch');

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
  'date',
  'updated',
  'slug',
  'excerpt',
  'permalink',
  'layout'
];

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
          info('Status: %s, Nodes: %s', data[`status`], data['number_of_nodes'])
        })
        .catch((err) => {
          error('%s', err.message);
          error('>> ElasticSearch might be unavilable.');
          process.exit(1);
        })
    })
    .then(() => {
      return hexo.load();
    })
    .then(() => {
      return hexo.database.model('Post').find({ published: true }).toArray();
    })
};
