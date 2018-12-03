# Description

`hexo-algolia` is an hexo plugin developed for internal use by Status.im.
This is what you get when you install it:

* A new command, `hexo elasticsearch`, to index the content of your website.
* ~~A theme helper to include Algolia search client~~ __TODO__
* ~~another theme helper to configure the Algolia search client~~ __TODO__

The hexo algolia command can be run manually on your computer and on a continuous integration system.

# Install

```bash
npm install --save https://github.com/status-im/hexo-elasticsearch.git
```

# Configuration & Usage

The required configuration in `_config.yml` under `elasticsearch` keys is:
```yaml
elasticsearch:
  index: 'dev.status.im'
  esHost: 'search.status.im'
  esPort: 443
```
And the required HTTP Auth env variables need to be provided to index:
```bash
export HEXO_ES_USER='es-user'
export HEXO_ES_PASS='super-secret-password'
hexo elasticsearch
```
