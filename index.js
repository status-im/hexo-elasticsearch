/* globals hexo:false, console:false*/
'use strict';

const fs = require('hexo-fs');
const path = require('path');
const command = require('./lib/command');
const searchConfig = require('./lib/helpers/search_config.js');
const searchScript = require('./lib/helpers/search_script.js');

hexo.extend.console.register(
  'elasticsearch',
  'Index your content in ElasticSearch API',
  {
    options: [
      { name: '--dry-run',
        desc: 'Does not push content to ElasticSearch' },
      { name: '--delete',
        desc: 'Deletes the ElasticSearch index before starting the indexation' },
    ],
  },
  command
);

hexo.extend.helper.register('elasticsearch_config', searchConfig.bind(null, hexo.config));
hexo.extend.helper.register('elasticsearch_script', searchScript.bind(null, hexo.config));

hexo.extend.generator.register('jquery', function(locals) {
  const sourceFile = require.resolve('jquery/dist/jquery.min.js')
  return {
    path: path.join('js', 'jquery.min.js'),
    data: function() { return fs.createReadStream(sourceFile); }
  };
});

hexo.extend.generator.register('marcopolo', function(locals) {
  const sourceFile = require.resolve('jquery-marcopolo/src/jquery.marcopolo.js')
  return {
    path: path.join('js', 'jquery.marcopolo.js'),
    data: function() { return fs.createReadStream(sourceFile); }
  };
});
