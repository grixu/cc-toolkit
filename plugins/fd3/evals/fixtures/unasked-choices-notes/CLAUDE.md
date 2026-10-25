# shipment-tracker

Node service that tracks parcel shipments for the storefront.

## Protected paths

Everything under `infra/` (`*.tf`) is protected: never create or edit a file there without the
user's explicit consent, and record that consent in the spec or task that does it.

## Layout

- `src/server.ts` — the HTTP API
- `src/shipments.ts` — shipment status store
- `infra/` — Terraform for the service's cloud resources
- `docs/adr/` — architecture decision records
