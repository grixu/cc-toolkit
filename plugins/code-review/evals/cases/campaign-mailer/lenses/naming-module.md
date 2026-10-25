Lens: naming-module · files judged: 7 of 7

## FINDINGS (primary)
No primary findings. One-hop: `dispatch.ts` is the only importer of `recipients.ts`, `schedule.ts`, `sender.ts`, `throttle.ts` and `templates/digest.ts`; no new import closes a cycle or points from `templates/` into `campaigns/`.

## FINDINGS (boy-scout)
- `naming` · role-name · nit · `src/campaigns/audience.ts:L4, L7, L10` — `sizeMap` in the untouched `segmentSizes` names the container type instead of what it holds → rename to `sizesBySegment`
