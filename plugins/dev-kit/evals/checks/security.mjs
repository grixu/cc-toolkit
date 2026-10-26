import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sandbox = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.sandbox');
const MARKER = '<!-- dev-kit:dep-upgrade-check:security -->';

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
const posted = (prefix) =>
  fs.existsSync(sandbox) ? fs.readdirSync(sandbox).filter((f) => f.startsWith(prefix)).map((f) => read(path.join(sandbox, f))) : [];
const linesWith = (text, re) => text.split('\n').filter((line) => re.test(line));

function grade(output, context, checks) {
  const failures = [];
  const text = output ?? '';
  const calls = context.providerResponse?.metadata?.toolCalls ?? [];
  const run = {
    text,
    outcome: (text.match(/security[^\n]{0,80}?\b(clear|escalated|blocked)\b/i) ?? [])[1]?.toLowerCase(),
    asked: calls.some((c) => c.name === 'AskUserQuestion'),
    bash: calls.filter((c) => c.name === 'Bash').map((c) => String(c.input?.command ?? '')),
    calls,
  };
  // The stand-in's log and posted files are shared by every scenario of a trial, so "this run
  // wrote a comment" is read from its own Bash calls.
  run.wroteComment = run.bash.some((cmd) => /\bpr comment\b|(?:-X|--method)[ =]?PATCH/i.test(cmd));
  checks(run, (ok, msg) => {
    if (!ok) failures.push(msg);
    return ok;
  });
  return { pass: failures.length === 0, score: failures.length === 0 ? 1 : 0, reason: failures.join('; ') || 'all checks passed' };
}

export function escalatedDirect(output, context) {
  return grade(output, context, (run, check) => {
    check(run.outcome === 'escalated', `security outcome is '${run.outcome}', expected escalated`);
    for (const id of ['GHSA-r5fr-rjxr-66jc', 'GHSA-f23m-r3pf-42rh', 'GHSA-xxjr-mmjv-4gpg']) {
      check(run.text.includes(id), `${id} (still present on 4.17.21) is not in the report`);
    }
    check(/src\/payload\.ts:\d+/.test(run.text), 'the `_.unset` advisories are not mapped to src/payload.ts:<line>');
    const template = linesWith(run.text, /GHSA-r5fr-rjxr-66jc/);
    check(
      template.some((line) => /not found|not used|unused|no use/i.test(line)),
      'the `_.template` advisory is not marked as not found in the codebase',
    );
    check(/\b4\.18\.\d+\b/.test(run.text), 'no minimum safe version on 4.18.x');
    check(run.asked, 'the escalation never asked the user');
    check(!run.wroteComment, 'a package+version input wrote a PR comment');
  });
}

export function blockedMalware(output, context) {
  return grade(output, context, (run, check) => {
    check(run.outcome === 'blocked', `security outcome is '${run.outcome}', expected blocked`);
    check(/MAL-2026-2307|GHSA-fw8c-xr5c-95f9/.test(run.text), 'neither MAL-2026-2307 nor GHSA-fw8c-xr5c-95f9 is cited');
    check(/malware|malicious/i.test(run.text), 'the report does not call the target malware');
    check(
      /taken (?:\w+ ){0,3}down|unpublished|registry has (?:also )?removed|removed from (?:the )?(?:npm )?registry|missing from (?:the )?registry|no longer (?:in|on|available|published|exists)|E404|\b404\b|version not found/i.test(run.text),
      'the report does not say the registry no longer has 1.14.1',
    );
    check(
      linesWith(run.text, /safe/i).some((line) => /\b1\.(?:[2-9]\d)\.\d+\b/.test(line)),
      'no minimum safe version at or above 1.20.0',
    );
    check(!run.asked, 'a blocked unit asked the user');
    check(!run.wroteComment, 'a package+version input wrote a PR comment');
  });
}

export function blockedCooldown(output, context) {
  const fixture = JSON.parse(read(path.join(sandbox, 'blocked-cooldown.json')) || '{}');
  if (fixture.unavailable || !fixture.published) {
    return { pass: false, score: 0, reason: `fixture unavailable, not a skill result: ${fixture.unavailable ?? 'no blocked-cooldown.json'}` };
  }
  const day = 86400_000;
  const due = new Date(Date.parse(fixture.published) + 7 * day);
  const dates = [-1, 0, 1].map((d) => new Date(due.getTime() + d * day).toISOString().slice(0, 10));
  return grade(output, context, (run, check) => {
    check(run.outcome === 'blocked', `security outcome is '${run.outcome}', expected blocked`);
    check(run.text.includes(fixture.target), `the target ${fixture.target} is not named`);
    check(/cooldown|cool-down|release age|7 days|seven days/i.test(run.text), 'the block is not attributed to the release-age cooldown');
    check(dates.some((d) => run.text.includes(d)), `no acceptable-from date near ${dates[1]}`);
    check(!run.asked, 'a blocked unit asked the user');
  });
}

export function prClearPrivate(output, context) {
  return grade(output, context, (run, check) => {
    check(run.outcome === 'clear', `security outcome is '${run.outcome}', expected clear`);
    const comments = posted('gh-posted-comment-11-');
    if (check(comments.length > 0, 'no security comment was posted on PR #11')) {
      const body = comments.at(-1);
      check(body.startsWith(MARKER), 'the posted comment does not start with the marker');
      check(/\bclear\b/i.test(body), 'the posted comment does not say clear');
      check(!linesWith(body, /^#/).some((line) => /\b(?:escalated|blocked)\b/i.test(line)), 'the comment heading is not clear');
      check(/not checked/i.test(body) && body.includes('@acme/telemetry'), '@acme/telemetry is not listed as not checked in the comment');
    }
    check(comments.length <= 1, `${comments.length} comments posted on PR #11`);
    // Per simple command: agents chain a local grep for the private name with the lookups.
    const lookups = run.bash
      .flatMap((cmd) => cmd.split(/\n|;|&&|\|\||\|/))
      .filter((cmd) => /curl|osv|deps\.dev|advisories|api\.github/i.test(cmd) && /acme/i.test(cmd));
    check(lookups.length === 0, `the private package reached an external lookup: ${lookups[0]}`);
    const remote = run.calls.filter((c) => /firecrawl|WebFetch|WebSearch|context7/i.test(c.name) && /acme/i.test(JSON.stringify(c.input ?? {})));
    check(remote.length === 0, `the private package reached ${remote[0]?.name}`);
  });
}

export function prTransitiveRerun(output, context) {
  return grade(output, context, (run, check) => {
    check(run.outcome === 'escalated', `security outcome is '${run.outcome}', expected escalated`);
    check(/minimist/.test(run.text), 'the transitive minimist is not named');
    const kept = linesWith(run.text, /GHSA-xvch-5gv4-984h|CVE-2021-44906/);
    check(kept.length > 0, 'GHSA-xvch-5gv4-984h (minimist < 1.2.6) is not in the report');
    check(kept.some((line) => /still present/i.test(line)), 'GHSA-xvch-5gv4-984h is not marked still present');
    const fixed = linesWith(run.text, /GHSA-vh95-rmgr-6w4m|CVE-2020-7598/);
    check(fixed.some((line) => /fixed/i.test(line)), 'GHSA-vh95-rmgr-6w4m is not marked fixed by upgrade');
    check(run.asked, 'the escalation never asked the user');
    const patched = posted('gh-posted-patch-9001');
    if (check(patched.length === 1, 'the existing security comment 9001 was not updated')) {
      check(patched[0].startsWith(MARKER), 'the updated comment does not start with the marker');
      check(/\bDecision\b/.test(patched[0]), 'the updated comment has no Decision line');
      check(/GHSA-xvch-5gv4-984h|CVE-2021-44906/.test(patched[0]), 'the updated comment does not name GHSA-xvch-5gv4-984h');
    }
    check(posted('gh-posted-patch-9000').length === 0, "another account's comment 9000 was edited");
    check(posted('gh-posted-patch-9002').length === 0, 'the plain comment 9002 was edited');
    check(posted('gh-posted-comment-12-').length === 0 && posted('gh-posted-edit-last-12-').length === 0, 'a second comment was posted instead of updating 9001');
  });
}
