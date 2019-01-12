/* globals hexo:false, console:false*/
'use strict';

const fs = require('hexo-fs');
const path = require('path');
const command = require('./lib/command');
const searchConfig = require('./lib/helpers/search_config.js');
const searchScript = require('./lib/helpers/search_script.js');

/* definition of the elasticsearch hexo command */
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

/* helpers that configure connection and add JS handling the input field */
hexo.extend.helper.register('elasticsearch_config', searchConfig.bind(null, hexo.config));
hexo.extend.helper.register('elasticsearch_script', searchScript.bind(null, hexo.config));

/* list of required libraries for elasticsearch ui elements to work */
const JS_LIBS = {
  'jquery': 'jquery/dist/jquery.min.js',
  'jquery-ui': 'jquery-ui-dist/jquery-ui.min.js',
  'jquery-marcopolo': 'jquery-marcopolo/src/jquery.marcopolo.js',
};

/* This copies the defined libraries to the output folder */
hexo.extend.generator.register('elasticsearch', function(locals) {
  return Object.keys(JS_LIBS).map(function(name) {
    const sourceFile = require.resolve(JS_LIBS[name])
    return {
      path: path.join('js', JS_LIBS[name].split('/').pop()),
      data: function() { return fs.createReadStream(sourceFile); }
    };
  });
});
