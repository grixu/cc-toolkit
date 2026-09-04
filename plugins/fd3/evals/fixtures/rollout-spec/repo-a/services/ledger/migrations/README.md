# Ledger migrations

SQL files in this directory are applied by CI in filename order (`NNNN_description.sql`) on merge
to `main`. A migration is irreversible once applied to the shared staging database — expand-only
changes land here; contracting changes wait for their cleanup gate.
