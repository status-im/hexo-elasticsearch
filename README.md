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

# Configuration

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
```

# Usage

Standard usage for indexing:
```bash
hexo elasticsearch
```
Dry Run:
```bash
hexo elasticsearch --dry-run
```
Delete index before upload:
```bash
hexo elasticsearch --delete
```

# Helpers

If you want to start using the search you can use the two included helpers:

* `elasticsearch_config` - Adds neccessary `script` and `meta` tags with configuration from your `_config.yml`.
* `elasticsearch_script` - Adds the JS script which handles the given target tag to execute the query.

## Example

```html
<html>
  <head>
    <meta charset="utf-8">
    <%- elasticsearch_config() %>
  </head>
  <body>
    <input type="text" id="userSearch" placeholder="Search...">
    <%- elasticsearch_script({target: "input#userSearch", size: 6}) %>
  </body>
<html>
```
