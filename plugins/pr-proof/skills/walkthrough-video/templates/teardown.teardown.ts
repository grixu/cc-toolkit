import fs from 'node:fs';
import { expect, test as teardown } from '@playwright/test';
import { credentials, LEDGER_FILE, loggedInContext, readLedger, readRunState, RUN_FILE } from './api';

type RunState = { createdIds?: string[] };

teardown('restore the starting state', async () => {
  const admin = await loggedInContext(credentials.USER_EMAIL, credentials.PASSWORD);
  // Teardown also runs after a setup that failed before writing run state.
  const run: RunState = fs.existsSync(RUN_FILE) ? readRunState<RunState>() : {};

  // Example; replace with the scenario's resources. A 404 means the take already deleted it: still a clean end.
  for (const id of run.createdIds ?? []) {
    const response = await admin.delete(`/<resource>/${id}`);
    expect([200, 204, 404]).toContain(response.status());
  }

  // Newest first: a later change may depend on an earlier one.
  for (const { change, revert } of readLedger().reverse()) {
    const response = await admin.fetch(revert.path, { method: revert.method, data: revert.data });
    expect(response.ok(), `reverting "${change}" failed with ${response.status()}`).toBeTruthy();
  }
  fs.rmSync(LEDGER_FILE, { force: true });
  // …read the end state back…

  await admin.dispose();
});
