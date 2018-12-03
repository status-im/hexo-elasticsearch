/* globals hexo:false, console:false*/
'use strict';

var command = require('./lib/command');

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
