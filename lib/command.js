'use strict';

var each = require('p-each-series');
var esearch = require('elasticsearch');

var CONFIG_DEFAULTS = {
  esProt: String(process.env.HEXO_ELASTICSEARCH_HOST || 'https'),
  esHost: String(process.env.HEXO_ELASTICSEARCH_HOST || 'localhost'),
  esPort: String(process.env.HEXO_ELASTICSEARCH_PORT || 9200),
  esUser: String(process.env.HEXO_ELASTICSEARCH_USER || ''),
  esPass: String(process.env.HEXO_ELASTICSEARCH_PASS || ''),
};
var CONSOLE_DEFAULTS = {
  dryRun: false,
  flush: false,
  chunkSize: 50
};

var INDEXED_PROPERTIES = [
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
  var hexo = this;
  var conf = Object.assign({}, CONFIG_DEFAULTS, hexo.config.elasticsearch);
  var es;

  Promise.resolve(conf.esUser)
    .then(function(){
      if (!conf.esUser || !conf.esPass) {
        hexo.log.error('[hexo-elasticsearch] Please set the necessary env variables to gain access to API:');
        hexo.log.error('[hexo-elasticsearch] * `HEXO_ELASTICSEARCH_USER` - HTTP Auth user to access API.');
        hexo.log.error('[hexo-elasticsearch] * `HEXO_ELASTICSEARCH_PASS` - HTTP Auth pass to access API.');
        process.exit(1);
      }

      if (!conf.index) {
        hexo.log.error('[hexo-elasticsearch] Please provide an ElasticSearch index name in your hexo _config.yml file.');
        process.exit(1);
      }

      es = new esearch.Client({
          host: `${conf.esProt}://${conf.esUser}:${conf.esPass}@${conf.esHost}:${conf.esPort}`
      })
    })
    .then(function(){
      hexo.log.info('[hexo-elasticsearch] Testing ElasticSearch access.');

      return es.cluster.health()
        .then((data) => {
          hexo.log.info(`[hexo-elasticsearch] Status: ${data['status']}, Nodes: ${data['number_of_nodes']}`);
        })
        .catch(function(err){
          hexo.log.error('[hexo-elasticsearch] %s', err.message);
          hexo.log.error('>> ElasticSearch might be unavilable.');
          process.exit(1);
        })
    })
};
