# Org-scoped project access — specification

A small multi-tenant service. Users belong to an organisation and may hold memberships in
other organisations. Every guarded resource decision is delegated to an external policy
decision point (PDP); the service itself owns authentication, the membership lifecycle, and
what happens when the PDP cannot be reached.

## Domain

- **Users** carry a global `role` (`admin` or `member`) and a home `orgId`.
- **Projects** belong to exactly one organisation.
- **Memberships** bind a user to an organisation with a `status` of `pending` or `active`.
  A `pending` membership grants nothing until its holder accepts it.
- **Audit events** record administrative activity.

## API contract

Base path `/api`. Every response is enveloped as `{"ok": true, "data": …}` on success and
`{"ok": false, "error": "<code>"}` on failure. Sessions are carried by the `tsid` cookie.
The current-user route is `GET /api/user`.

Resource ids are 1 to 64 characters drawn from `[A-Za-z0-9_-]`. The PDP refuses to evaluate a
check that carries a longer id, answering 400 `invalid_resource_id` — an explicit answer from a
healthy PDP, not an outage.

## Acceptance criteria

**AC-1 — project list is org-scoped.** `GET /api/projects` returns exactly the projects the
caller may read: every project for an `admin`, and for a `member` only those in an
organisation where they hold an `active` membership.

**AC-2 — project deletion is admin-only.** `DELETE /api/projects/{id}` succeeds with 200 for
an `admin`. For a `member` it is denied with 403 and the project remains in the store.

**AC-3 — a member accepts their own invitation.** `PATCH /api/memberships/{id}` with
`{"status": "active"}` succeeds with 200 when the caller owns that membership and it is
currently `pending`. Accepting is consequential: after it succeeds, a project in that
organisation which previously returned 403 for the caller returns 200. Patching a membership
belonging to another user is denied with 403; patching one that is not `pending` returns 409;
an unsupported status returns 422.

**AC-4 — the audit log is admin-only.** `GET /api/admin/audit` returns 200 with audit
events for an `admin`, and is denied with 403 for a `member`.

**AC-5 — authorization failures are fail-closed.** When the PDP cannot be reached, every
guarded route responds 503 with error `authorization_unavailable`. No guarded resource is
served while the authorization decision is unavailable — an outage must never widen access.
This applies to reads and writes alike, including `GET /api/projects`.

**AC-6 — unauthenticated access is rejected.** Any guarded route called without a valid
session returns 401 with error `unauthenticated`, and does so regardless of whether the PDP
is reachable.

**AC-9 — PDP errors are classified, not collapsed.** A reachable PDP that answers a check
with an explicit error — 400 `invalid_resource_id` for an over-long resource id — has made a
decision: the route denies with 403 `forbidden`. Only a PDP that cannot be reached at all
(connection failure, timeout, 5xx) is an outage, answered with 503 `authorization_unavailable`
per AC-5. The two shapes must not collapse into one on any route that forwards a resource id
(`GET`/`DELETE /api/projects/{id}`).

**AC-10 — the audit read window.** `GET /api/admin/audit` returns the most recent audit
events, newest first, windowed to `?limit=` (default 20). The window is a presentation
default, not a completeness guarantee: raising `limit` returns older entries, and the store —
read with `db-query.mjs auditEvents` — is the authoritative full log. An entry outside the
default window has not been lost.

## UI acceptance criteria

**AC-7 — administrative navigation is role-gated.** On `/dashboard`, the navigation entry
`nav-admin` is visible for an `admin` and absent for a `member`.

**AC-8 — a rejected sign-in is reported.** Submitting the form on `/login` with credentials
that do not match any user returns the user to the sign-in page showing `login-error`, and
establishes no session.

## Error paths

| Condition | Status | Error code |
|---|---|---|
| No/!valid session on a guarded route | 401 | `unauthenticated` |
| Authenticated but not permitted | 403 | `forbidden` |
| Unknown resource id | 404 | `not_found` |
| Membership transition from a non-`pending` state | 409 | `not_pending` |
| Unsupported membership status | 422 | `unsupported_status` |
| PDP reachable but refuses the check (explicit 4xx) | 403 | `forbidden` |
| PDP unreachable | 503 | `authorization_unavailable` |
