# grilling-summary — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.
The fixture is shared by write-template-conformance and (copied whole) by the e2e chain's
`.sandbox/e2e-chain/`;
`no-rollout-order` is derived from it.

`notes/research/` holds the session's lookup reports and is the `research-dir` argument every
write-spec scenario passes; write-spec stops on an input path that does not resolve, so the
directory must exist and be non-empty. `dispatch-path-lookup.md` cites the same
`src/notify/dispatch.ts` lines the summary does, and names no environment (see the note at the
bottom).

The summary in `notes/grilling-summary.md` is a CONFIRMED closing summary: decisions with
rationales and accepted costs, elements, rollout, verification, two declared gaps with owner and
placement, the "decisions I took that you never answered" section, and the user's confirmation
line. It contains everything write-spec needs so the skill never has to invent or re-derive.

Sentinel strings the write-template-conformance assertions look for in the produced `spec/out.md`:

- `platform team` and `OPS-77` — the two declared gaps must survive into the spec as gaps with
  owner and placement, not as confident prose.
- A `D1` decision-table row, element codes with valid prefixes, and the
  `Claim | How it was verified` evidence table are required by the template-conformance asserts.

Load-bearing line numbers in `src/notify/dispatch.ts`: subscriber list at line 6, send loop at
lines 9-11, `sendEmail` at line 14. The summary cites them; the spec's evidence appendix is
expected to carry them forward.

Environment names: the summary deliberately uses only `sandbox` and `live` — never `staging` or
`canary` — because the write-no-invented-decisions sentinel asserts the ABSENCE of `staging`/`canary` in the
spec, and the shared wording must keep that sentinel meaningful in both fixtures. The research
reports name no environment at all, so they carry into `no-rollout-order` unchanged.
