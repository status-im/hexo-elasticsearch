'use strict';

const DEFAULT_OPTIONS = {
  target: 'input#search',
  source: ['title', 'url'],
  size: 4,
};


/* used as <%- elasticsearch_script({ ... }) %> */
module.exports = function(hexoConfig, options) {
  var opts = Object.assign({}, DEFAULT_OPTIONS, options);
  return `
    <script type="text/javascript" defer>
        const meta = $('meta[property=elasticsearch');
        const esHost = meta.data('es-host');
        const esPort = meta.data('es-port');
        const esIndex = meta.data('es-index');
        const args = \`size=${opts.size}&_source=${opts.source.join(',')}&\`
        $('${opts.target}').marcoPolo({
            url: \`https://\${esHost}:\${esPort}/\${esIndex}/_search?\${args}\`,
            minChars: 3,
            formatItem: function (data, $item) {
                return data.title || data.url;
            },
            formatData: function (data) {
                return data.hits.hits.map(function(obj) {
                    return obj._source;
                });
            },
            onSelect: function (data, $item) {
                window.location = data.url;
            }
        });
    </script>
`.trim();
}
