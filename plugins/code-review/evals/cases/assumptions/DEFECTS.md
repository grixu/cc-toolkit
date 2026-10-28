# Planted beliefs — assumptions

`reset-sandbox.sh` copies this directory, minus this file and `vendor/`, into
`.sandbox/assumptions`, commits it with a `.gitignore` that ignores `node_modules/`, and then
copies `vendor/@acme/*` into `node_modules/@acme/` as the install `package-lock.json` resolves
(`@acme/fetchkit` 2.3.1, `@acme/pagekit` 1.8.0). Both packages are made up, so no model knows
them from training: a finding has to cite the installed source. eval-36 passes the recall files,
eval-37 the calibration files.

## Findings the assumptions lens must raise (eval-36)

| belief | site | contradicting source | rule |
|---|---|---|---|
| a redirect drops the custom key header | `src/invoice-document.ts:L7-L9` sends `X-Api-Key` with the default `redirect: 'follow'`, and the route 302s to another host | `node_modules/@acme/fetchkit/lib/redirect.js:L3, L9-L13` strips only `authorization` on a cross-origin hop | dependency-semantics · high — the key reaches the storage host |
| `headers` apply to every request of the audit | `src/dashboard-audit.ts:L8-L10` passes the token as `headers` for a page whose widgets load from `/api` afterwards | `node_modules/@acme/pagekit/lib/intercept.js:L3-L11` adds them to the first intercepted request only, then turns interception off | dependency-semantics · high — the widget calls go out without the token, so the audit grades an error state |
| shutdown runs once | `src/worker.ts:L11-L17` registers `shutdown` with `process.on` for both `SIGTERM` and `SIGINT`, with no guard | `node_modules/@acme/pagekit/lib/session.js:L33` throws `session already closed` on a second `close()` | dependency- or platform-semantics · high — a second signal during the drain rejects, unhandled, and the process exits 1 |

## Look-alikes the lens must leave alone (eval-37)

- `src/statement-client.ts` sends `X-Api-Key` with `redirect: 'manual'` and re-issues a hop only
  when it stays on the same origin.
- `src/status-audit.ts` adds the token through `onRequest`, which `intercept.js:L13-L19` calls for
  every request, and only for same-origin ones.
- `src/report-worker.ts` registers `shutdown` with `process.once` and guards it with `closing`, so
  `close()` runs once whatever signals arrive.

`src/queue.ts` is support code, passed to neither eval.
