# @acme/pagekit

Accessibility audits of web pages in a headless browser.

```js
const { createSession } = require('@acme/pagekit');

const session = await createSession();
const result = await session.audit('https://example.com', { headers: { Cookie: 'lang=en' } });
console.log(result.issues);
await session.close();
```

## Audit options

- `headers` — extra HTTP headers for the page.
- `onRequest(request)` — called for each request the page makes; return an object of headers to
  add to that request, or nothing.
- `timeoutMs` — navigation timeout, 30 s by default.

## Sessions

A session owns one browser. Close it with `session.close()` when you are done.
