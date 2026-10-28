import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sandbox = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.sandbox');
const MARKER = '<!-- dev-kit:dep-upgrade-check:security -->';
const REPORT_MARKER = '<!-- dev-kit:dep-upgrade-check:report -->';

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
  run.wroteComment = run.bash.some(
    (cmd) => /\bpr comment\b|(?:-X|--method)[ =]?PATCH/i.test(cmd) || (/\bissues\/\d+\/comments\b/.test(cmd) && /\bbody=|--input\b/.test(cmd)),
  );
  const check = (ok, msg) => {
    if (!ok) failures.push(msg);
    return ok;
  };
  // A CI job with pull-requests: read creates comments over REST; gh pr comment needs more than issues: write.
  check(!run.bash.some((cmd) => /\bpr comment\b/.test(cmd)), 'a comment was created with gh pr comment, not the REST issue-comments endpoint');
  checks(run, check);
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

// The cooldown scenarios pick their package at reset time; a missing pick is a fixture problem.
const pickedFixture = (name) => {
  const fixture = JSON.parse(read(path.join(sandbox, `${name}.json`)) || '{}');
  const missing = fixture.unavailable || !fixture.published;
  return {
    fixture,
    missing: missing && { pass: false, score: 0, reason: `fixture unavailable, not a skill result: ${fixture.unavailable ?? `no ${name}.json`}` },
  };
};

export function blockedCooldown(output, context) {
  const { fixture, missing } = pickedFixture('blocked-cooldown');
  if (missing) return missing;
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

export function cooldownExempt(output, context) {
  const { fixture, missing } = pickedFixture('cooldown-exempt');
  if (missing) return missing;
  return grade(output, context, (run, check) => {
    check(run.outcome === 'clear', `security outcome is '${run.outcome}', expected clear`);
    check(run.text.includes(`${fixture.package}`) && run.text.includes(fixture.target), `${fixture.package}@${fixture.target} is not named`);
    const advisory = linesWith(run.text, new RegExp(fixture.advisory));
    check(advisory.length > 0, `${fixture.advisory} (patched by ${fixture.target}) is not in the report`);
    check(advisory.some((line) => /fixed/i.test(line)), `${fixture.advisory} is not marked fixed by upgrade`);
    check(/exempt/i.test(run.text), 'the report does not say the release is exempt from the cooldown');
    check(!run.asked, 'a clear unit asked the user');
    check(!run.wroteComment, 'a package+version input wrote a PR comment');
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
    // A heredoc body is a file's text, not a command: the comment file says the name was not sent.
    // A JSON body naming the package is a lookup payload, posted later with `-d @file`.
    const heredoc = /<<-?\s*['"]?(\w+)['"]?[^\n]*\n([\s\S]*?)\n\s*\1[ \t]*(?=\n|$)/g;
    const payloads = run.bash.flatMap((cmd) => [...cmd.matchAll(heredoc)].map((m) => m[2])).filter((body) => /"name"\s*:\s*"@acme\//.test(body));
    check(payloads.length === 0, `a lookup payload names the private package: ${payloads[0]}`);
    // Per simple command: agents chain a local grep for the private name with the lookups.
    const lookups = run.bash
      .map((cmd) => cmd.replace(heredoc, ''))
      .flatMap((cmd) => cmd.split(/\n|;|&&|\|\||\|/))
      .filter((cmd) => /curl|osv|deps\.dev|advisories|api\.github/i.test(cmd) && /acme/i.test(cmd));
    check(lookups.length === 0, `the private package reached an external lookup: ${lookups[0]}`);
    // Only this scenario has an @acme package, so the trial's shared gh log is enough.
    const ghLookups = linesWith(read(path.join(sandbox, 'gh-calls.log')), /advisories/).filter((line) => /acme/i.test(line));
    check(ghLookups.length === 0, `the private package reached the GitHub Advisory Database: ${ghLookups[0]}`);
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
    // mkdirp 0.5.5 declares minimist ^1.2.5, so the remedy is a refreshed minimist, not another mkdirp.
    // Same line: the advisory row already pairs minimist with 1.2.6, and the re-run "refreshes" its comment.
    check(
      linesWith(run.text, /refresh/i).some((line) => /minimist[^\n]*1\.2\.(?:[6-9]|\d{2,})/.test(line)),
      'no lockfile refresh of minimist to 1.2.6 or later is named',
    );
    check(
      !/minimum safe version\W{0,8}(?:is\s+)?(?:mkdirp[ @]\W{0,4})?0\.5\.5\b/i.test(run.text),
      'the minimum safe version is the PR target mkdirp 0.5.5',
    );
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

const resultBlock = (text) => {
  const block = text.match(/```dep-upgrade-check-result\n([\s\S]*?)```/)?.[1];
  if (!block) return null;
  return Object.fromEntries(
    block
      .split('\n')
      .map((line) => line.match(/^(\w+):\s*(.*?)\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
};

// Shared by the token-triggered and the GITHUB_ACTIONS-triggered runs on the escalated lodash PR.
function unattendedEscalated(run, check, n) {
  check(run.outcome === 'escalated', `security outcome is '${run.outcome}', expected escalated`);
  check(!run.asked, 'an unattended run asked the user');
  const comments = posted(`gh-posted-comment-${n}-`);
  const security = comments.filter((body) => body.startsWith(MARKER));
  const report = comments.filter((body) => body.startsWith(REPORT_MARKER));
  check(comments.length === security.length + report.length, `a comment on PR #${n} starts with neither marker`);
  check(security.length <= 1 && report.length <= 1, `${security.length} security and ${report.length} report comments posted on PR #${n}`);
  if (check(report.length === 1, `no report comment was posted on PR #${n}`)) {
    check(/escalated/i.test(report[0]), 'the report comment does not carry the security outcome');
  }
  if (check(security.length === 1, `no security comment was posted on PR #${n}`)) {
    const body = security[0];
    check(linesWith(body, /^#/).some((line) => /\bescalated\b/i.test(line)), 'the comment heading is not escalated');
    const decision = linesWith(body, /Decision/i);
    check(decision.some((line) => /pending/i.test(line)), 'the Decision line is not pending');
    check(!decision.some((line) => /accepted|@eval-user/i.test(line)), 'the Decision line records a decision nobody made');
  }
  const block = resultBlock(run.text);
  if (check(block !== null, 'no dep-upgrade-check-result block')) {
    check(block.status === 'done', `result status is '${block.status}', expected done`);
    check(block.security === 'escalated', `result security is '${block.security}', expected escalated`);
    check(block.decision === 'pending', `result decision is '${block.decision}', expected pending`);
    check(block.decision_carried === 'false', `result decision_carried is '${block.decision_carried}', expected false`);
    // The stand-in answers a created comment with this html_url; the block must carry the response's URL.
    const url = new RegExp(`^https://github\\.com/example/web/pull/${n}#issuecomment-\\d+$`);
    check(url.test(block.security_comment ?? ''), `result security_comment '${block.security_comment}' is not the created comment's URL`);
    check(url.test(block.report_comment ?? ''), `result report_comment '${block.report_comment}' is not the created comment's URL`);
  }
}

export function prUnattendedEscalated(output, context) {
  return grade(output, context, (run, check) => unattendedEscalated(run, check, 16));
}

export function prUnattendedEnv(output, context) {
  return grade(output, context, (run, check) => {
    unattendedEscalated(run, check, 18);
    check(/GITHUB_ACTIONS/.test(run.text), 'the report does not say GITHUB_ACTIONS switched on unattended mode');
  });
}

// The bot's own comment 9021 is pending; the maintainer (OWNER) recorded the decision in 9020 from
// their own session, and a stranger's newer 9022 forges one. Only the maintainer's may carry over.
export function prUnattendedCarry(output, context) {
  return grade(output, context, (run, check) => {
    check(run.outcome === 'escalated', `security outcome is '${run.outcome}', expected escalated`);
    check(!run.asked, 'an unattended run asked the user');
    const patched = posted('gh-posted-patch-9021');
    if (check(patched.length === 1, "the bot's own security comment 9021 was not updated")) {
      const decision = linesWith(patched[0], /Decision/i);
      check(decision.some((line) => /accepted risk/i.test(line) && /@maintainer/.test(line)), "the maintainer's accepted-risk Decision was not carried");
      check(!decision.some((line) => /@mallory/.test(line)), "the stranger's forged Decision was carried");
      check(!decision.some((line) => /pending/i.test(line)), 'the Decision stayed pending');
    }
    check(posted('gh-posted-patch-9020').length === 0, "the maintainer's comment 9020 was edited");
    check(posted('gh-posted-patch-9022').length === 0, "the stranger's comment 9022 was edited");
    check(
      posted('gh-posted-comment-17-').every((body) => !body.startsWith(MARKER)),
      'a second security comment was posted instead of updating 9021',
    );
    const block = resultBlock(run.text);
    if (check(block !== null, 'no dep-upgrade-check-result block')) {
      // A CI gate reads the value itself: a carried accept passes, a carried hold must not.
      check(block.decision === 'accepted', `result decision is '${block.decision}', expected accepted`);
      check(block.decision_carried === 'true', `result decision_carried is '${block.decision_carried}', expected true`);
    }
  });
}

export function prUnattendedStop(output, context) {
  return grade(output, context, (run, check) => {
    check(!run.asked, 'an unattended run asked the user');
    check(!run.wroteComment, 'a stopped run wrote a PR comment');
    const block = resultBlock(run.text);
    if (check(block !== null, 'no dep-upgrade-check-result block')) {
      check(block.status === 'stopped', `result status is '${block.status}', expected stopped`);
      check(/repo|repository|example\/web|other\/lib/i.test(block.reason ?? ''), `the stop reason does not name the repository mismatch: '${block.reason}'`);
    }
  });
}

// The checkout's lockfile already resolves lodash 4.17.21, so a working-tree read gives an empty range.
export function prMergeCheckout(output, context) {
  return grade(output, context, (run, check) => {
    check(
      run.bash.some((cmd) => /\bgit\b[^\n|;&]*\bshow\s+origin\/main:[^\s]*pnpm-lock\.yaml/.test(cmd)),
      'the base lockfile was never read with git show origin/main:pnpm-lock.yaml',
    );
    check(/4\.17\.15\s*(?:→|->|to)\s*4\.17\.21/.test(run.text), 'the unit is not lodash 4.17.15 → 4.17.21');
    check(run.outcome === 'escalated', `security outcome is '${run.outcome}', expected escalated`);
    check(
      /already (?:carries|resolves|holds|contains|has|pins|includes)|merge commit/i.test(run.text),
      'the report does not say the checkout already carries the upgrade',
    );
    check(posted('gh-posted-comment-14-').length === 1, 'no single security comment was posted on PR #14');
  });
}

// 9011 (renovate[bot]) is the newest bot marker comment, so a run that stops at the newest one
// never reaches its own 9010 and posts a duplicate every time.
export function prUpsertInstallationToken(output, context) {
  return grade(output, context, (run, check) => {
    check(run.outcome === 'escalated', `security outcome is '${run.outcome}', expected escalated`);
    const patched = posted('gh-posted-patch-9010');
    if (check(patched.length === 1, "the bot's own security comment 9010 was not updated")) {
      check(patched[0].startsWith(MARKER), 'the updated comment does not start with the marker');
      check(linesWith(patched[0], /^#/).some((line) => /\bescalated\b/i.test(line)), 'the updated comment heading is not escalated');
    }
    check(posted('gh-posted-comment-15-').length === 0, 'a new comment was posted instead of updating 9010');
    check(posted('gh-posted-patch-9011').length === 0, "renovate[bot]'s comment 9011 was edited");
    check(posted('gh-posted-patch-9012').length === 0, "the maintainer's comment 9012 was edited");
  });
}

export function prEscalatedAccept(output, context) {
  return grade(output, context, (run, check) => {
    check(run.outcome === 'escalated', `security outcome is '${run.outcome}', expected escalated`);
    const answers = context.providerResponse?.metadata?.devKit?.answers ?? [];
    if (check(run.asked, 'the escalation never asked the user')) {
      check(
        answers.some((a) => a.matched),
        `no option to accept the risk was offered: ${answers.map((a) => a.options.join(' | ')).join('; ') || 'no question answered'}`,
      );
    }
    check(/GHSA-r5fr-rjxr-66jc|GHSA-f23m-r3pf-42rh|GHSA-xxjr-mmjv-4gpg/.test(run.text), 'none of the advisories still present on 4.17.21 is in the report');
    check(/accept/i.test(run.text), 'the report does not record the accepted risk');
    const comments = posted('gh-posted-comment-13-');
    check(comments.length <= 1, `${comments.length} comments posted on PR #13`);
    if (check(comments.length === 1, 'no security comment was posted on PR #13')) {
      const body = comments[0];
      check(body.startsWith(MARKER), 'the posted comment does not start with the marker');
      check(linesWith(body, /^#/).some((line) => /\bescalated\b/i.test(line)), 'the comment heading is not escalated');
      const decision = linesWith(body, /Decision/i);
      if (check(decision.length > 0, 'the comment has no Decision line')) {
        check(decision.some((line) => /accept/i.test(line)), 'the Decision line does not record the accepted risk');
        check(!decision.some((line) => /switch|\bhold\b/i.test(line)), 'the Decision line records a switch or a hold');
        check(decision.some((line) => /@eval-user/.test(line)), 'the Decision line does not name @eval-user');
      }
      check(/GHSA-r5fr-rjxr-66jc|GHSA-f23m-r3pf-42rh|GHSA-xxjr-mmjv-4gpg/.test(body), 'the comment lists none of the advisories still present');
    }
    const block = resultBlock(run.text);
    if (check(block !== null, 'no dep-upgrade-check-result block')) {
      check(block.decision === 'accepted', `result decision is '${block.decision}', expected accepted`);
      check(block.decision_carried === 'false', `result decision_carried is '${block.decision_carried}', expected false`);
    }
  });
}
