import { expect, test as setup } from '@playwright/test';
import { credentials, loggedInContext, STORAGE_STATE, writeRunState } from './api';

setup('prepare the starting state', async () => {
  const admin = await loggedInContext(credentials.USER_EMAIL, credentials.PASSWORD);

  // Example; replace. Prefer seeded data read-only. Create only what the stack itself owns (nothing that
  // reaches a shared service), with a per-run suffix so a re-run never collides:
  // const name = `Demo role ${Date.now().toString(36)}`;
  // const created = await admin.post('/roles', { data: { name } });
  // expect(created.status()).toBe(201);
  const start = await admin.get('/<what the first scene reads>');
  expect(start.ok()).toBeTruthy();
  // …assert the starting state the first scene relies on…

  await admin.storageState({ path: STORAGE_STATE });
  writeRunState({ /* ids the walkthrough and teardown read, never credentials */ });
  await admin.dispose();
});
