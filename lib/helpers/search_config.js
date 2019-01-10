'use strict';

module.exports = function(hexoConfig) {
  const es = hexoConfig.elasticsearch;
  return (
    '<script src="/js/jquery.min.js"></script>\n'+
    '<script src="/js/jquery.marcopolo.js" type="text/javascript"></script>\n'+
    '<meta property="elasticsearch" data-es-host="' +
    es.esHost +
    '" data-es-port="' +
    es.esPort +
    '" data-es-index="' +
    es.index +
    '">'
  );
};
