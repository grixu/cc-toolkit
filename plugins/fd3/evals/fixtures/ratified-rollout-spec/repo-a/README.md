# commerce-core (repo-a)

Monorepo. Two services, two owning teams:

- `services/checkout/` — owned by team-checkout
- `services/ledger/` — owned by team-ledger

Pull requests must be scoped to one service's subtree; CODEOWNERS requires the owning team's
approval per subtree. Branches follow `feat/<service>-<topic>`.
