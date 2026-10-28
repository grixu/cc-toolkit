# @acme/fetchkit

A small promise-based HTTP client.

```js
const { request } = require('@acme/fetchkit');

const res = await request('https://api.example.com/items', {
  headers: { Accept: 'application/json' },
});
const items = await res.json();
```

## Options

- `method` — defaults to `GET`.
- `headers` — request headers, sent with the request.
- `body` — a string or a `Buffer`.
- `redirect` — `'follow'` (default) follows up to 10 redirects; `'manual'` returns the 3xx
  response with its `location` header; `'error'` rejects on a redirect.
- `timeoutMs` — aborts a request that has not received its response headers in time.

A response never rejects on its status: check `res.status` yourself.
