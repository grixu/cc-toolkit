# Performance — rules for the performance lens

Full rule text for the `performance` scanner (part of the `code-review` plugin). Read
this whole file before judging. When two rules touch the same code, the
most-specific finding wins.

Report what you find; the filter runs after. Judge each site against the rules,
then against that rule's own calibration paragraph — the look-alike that is *not* a
violation. A site the calibration clears is a non-finding. A site you cannot settle
either way belongs in `CANDIDATES`, not in the bin: whoever merges the review
decides it with everything in view, and a rejected candidate costs one line in
`Not flagged` — an unreported one costs the finding.

**A suggested fix is one clause, never a code block.** Name the symbol, the move, or
the API — "batch into `findMany({ where: { id: { in: ids } } })` before the loop",
"add `take` and a cursor to `listOrders`", "hoist `EMPTY_FILTERS` to module scope". The
surface that renders your findings has no room for a rewritten body or a before/after
block.

Each finding gets one **family**, one **rule**, and one **severity**. Grade severity
from the rows below (a finding's severity is the property of its rule, never the
file's overall impression). Severity is exactly one of `high`, `medium`, or `nit` —
never `low`, never a number, even when the rows below happen to show only one of the
three. The orchestrator re-grades centrally against the master table, so your severity
is a first pass.

## Contents
- `performance` — n-plus-one, unbounded-fetch, blocking-in-async, wasted-render

Every rule below carries its **Flag** conditions, a **Suggested fix**, and a
**Calibration** paragraph naming the look-alike that is *not* a violation. This is the
lens most tempted to speculate, so its evidence bar is fixed before the rules:

**A finding names four things, or it is a `CANDIDATE`.** The **multiplier** — the
loop's collection or the endpoint, and where its size comes from (a query result, a
request array, a table that grows); the **call** inside it; the **bound that is
missing** (a batch, a `LIMIT`/`take`, an async form, a stable reference); and the
**API that already exists** to supply it (`findMany({ where: { id: { in } } })`,
`LIMIT`/`take`/a cursor, `Promise.all`, `fs.promises`, `useMemo`). Each is a
`path:line` or an identifier in the diff. A site with three of the four goes to
`CANDIDATES` with the missing one named — never to the report.

**Forbidden.** "Could be slow", "may impact performance", "might not scale", and any
estimate — a count, a latency, a complexity class — not derived from a line in the
diff. The scanner never runs, benchmarks, or profiles code; it reads. A claim that
needs a measurement to stand is `(verify)`, not a finding.

**Files and languages.** This lens receives only `source`-kind files, `.sh` excluded;
tests and IaC are never in its `<files>`. Applicability is per rule: `n-plus-one` and
`unbounded-fetch` apply in every language; `blocking-in-async` applies only to Node and
Python asyncio; `wasted-render` applies only to `.tsx`/`.jsx`. The Step 2 conventions
note names an N/A rule the same way it names an N/A family — clear it in one line,
never invent a counterpart.

**Boundary with `objects · lazy-init`.** An expensive value computed eagerly at
construction is theirs; a per-item call inside a loop is yours. What that lens sends
via `HANDOFF` is graded here under its own row.

**Every fix here is structural.** Batching changes error semantics and ordering (one
failure now fails the batch; results land together, not in sequence); a limit on a
public endpoint is an API contract change; an async form changes when the caller
observes the result; memoising changes dependency semantics. State the fix as one
clause and leave the walk to the apply phase — none of these is a safe edit.

| family | rule | what it catches | severity |
|--------|------|-----------------|----------|
| `performance` | n-plus-one          | per-item DB/HTTP/IO call inside a loop over an unbounded collection where a batch form exists | high |
| `performance` | unbounded-fetch     | a list read with no limit/pagination over data that grows (incl. list endpoints) | medium |
| `performance` | blocking-in-async   | sync blocking call on a request-serving/event-loop path (N/A outside Node & Python asyncio) | medium |
| `performance` | wasted-render       | React: fresh object/array/arrow passed to a memoised child or hook dependency (N/A outside `.tsx/.jsx`) | medium |

### `performance` family

#### `n-plus-one` — one call per item where one call per collection exists

A loop that issues a query, request, or file read per element multiplies the
round-trip by the collection's size, and that size is decided by data, not by code.

- **Flag** when:
  - a loop (`for`, `forEach`, `map`, a sequential `await` chain, a comprehension) over
    a collection sized by data — a query result, a request body array, a directory
    listing — makes a DB/HTTP/filesystem call on every iteration, and the client
    exposes a batch form (`findMany`/`in`, `WHERE id IN`, `mget`, a bulk endpoint);
  - an ORM lazy relation is read inside the loop (`order.customer`, `post.author`)
    where an `include`/`join`/`select_related` exists on the outer query.
- **Suggested fix**: hoist to one batched call before the loop and index the result in
  memory (`usersById`), or move the relation into the outer query's `include`; where
  the client has no batch form but the calls are independent, `Promise.all` them —
  and say that failure and ordering semantics change.
- **Calibration → not a finding**: a loop over a literal or an enum — bounded by the
  source, not by data; a call the client memoises or caches (read the wrapper before
  claiming a round-trip); a loop that must be sequential by contract (each call feeds
  the next, or the provider rate-limits) — that is a `CANDIDATE`, the doubt being
  whether a batch preserves the contract; a client with no batch form at all — name
  what you looked for and mark `(verify)`.

#### `unbounded-fetch` — a read over growing data with no bound

A read that returns a whole table is correct on the day it is written and grows with
the data forever. The bound is missing at the read, and when the read backs a list
endpoint the missing bound is also a missing page parameter.

- **Flag** when:
  - a query over a table or collection that grows with use (orders, events, users,
    messages) carries no `LIMIT`/`take`/cursor/page — `findMany()`, `SELECT … FROM
    orders`, `collection.find({})`, `.all()`, `listObjects` with no `MaxKeys` — and
    the result is returned or held whole;
  - a list endpoint (a route handler returning an array) accepts no page/limit
    parameter and forwards such a read.
- **Suggested fix**: bound the read (`take` + cursor, `LIMIT` + keyset) and expose
  the page parameters on the endpoint; for a job that needs every row, iterate in
  chunks or stream instead of materialising.
- **Calibration → not a finding**: lookup and config tables (roles, countries,
  feature flags) — data that does not grow with use; a query bounded by a foreign key
  of known small cardinality (`where: { orderId }` — the lines of one order); a
  batch/migration job that intends the whole table and says so; pagination applied
  one layer up — read the caller before flagging; a `where` that is itself a bound
  (`id in [...]` from a list already bounded).

#### `blocking-in-async` — a synchronous block on an event-loop path

On a single-threaded event loop, one synchronous I/O or CPU call stalls every other
request until it returns; the async counterpart lives in the same library.

- **Flag** a synchronous blocking call on a request-serving or event-loop path — a
  route handler, middleware, `async def`, an event or queue consumer:
  - Node: `fs.*Sync`, `execSync`/`spawnSync`, `zlib.*Sync`, `pbkdf2Sync`/`scryptSync`,
    a per-request `require` of a large module, `Atomics.wait`;
  - Python asyncio: `time.sleep`, `requests.*`, `open().read()`, `subprocess.run`, a
    sync DB driver call inside a coroutine with no `asyncio.to_thread`/executor.
  Name the path (the handler or coroutine and what schedules it), the call, and the
  async form that exists.
- **Suggested fix**: swap for the async counterpart (`fs.promises`, promisified
  `execFile`, `httpx.AsyncClient`, `await asyncio.to_thread(fn)`), or hoist a
  one-time read out of the request path to module load.
- **Calibration → not a finding**: startup/config load (module top level, `main()`
  before the server listens); CLI scripts and one-shot tools; code that runs in a
  worker thread or process (`worker_threads`, `multiprocessing`) where blocking is
  the design; a synchronous call on a small in-memory value (`JSON.parse` of a
  request body, a regex) — blocking means I/O or data-sized CPU work, not any
  synchronous statement. **N/A** outside Node and Python asyncio: WSGI views, Go,
  Java, Rust, PHP, Ruby, and threaded runtimes have no single loop to block — clear
  the rule in one line.

#### `wasted-render` — a fresh reference that defeats an existing memo

`React.memo`, `useMemo`, `useCallback`, and `useEffect` compare by reference. An
object, array, or arrow literal created in render is a new reference every time, so
a memoised child re-renders on every parent render and a dependency array re-fires
on every commit — the memo is paid for and does nothing.

- **Flag** in `.tsx`/`.jsx` when:
  - a fresh object/array literal or inline arrow/function created in render is passed
    as a prop to a child wrapped in `React.memo` (or a `PureComponent`);
  - such a literal sits in a `useEffect`/`useMemo`/`useCallback` dependency array
    (directly, or as a value derived from one in the same render), so the hook
    re-runs on every render and the memo never hits.
  Name the child and its memo wrapper line, the prop or hook, and the literal.
- **Suggested fix**: hoist a constant literal to module scope; derive a value from
  props/state under `useMemo`/`useCallback` with its real dependencies; or pass
  primitives and let the child compose the object.
- **Calibration → not a finding**: the child is not memoised — it re-renders with its
  parent regardless, so a fresh prop wastes nothing; the literal is a stable
  module-level constant; a dependency that is a primitive or a stable reference (a
  state setter, a ref, an upstream `useMemo` value); a handler passed to a DOM element
  (`<button onClick={() => …}>`). Wrapping everything in `useMemo`/`useCallback`
  pre-emptively is not the fix — flag only where the memo already exists and is
  defeated. **N/A** outside `.tsx`/`.jsx`: Vue, Svelte, and Solid are separate
  reactivity models with no equivalent — clear the rule in one line.
