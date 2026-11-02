// Copied as <slug>.walk.ts: fill the scenes into the test body, keep the tested beats below it, but swap their
// selectors and URLs for the target app's: they come from the app these templates were tested on.
import { expect, Locator, Page, test } from '@playwright/test';
import { click, highlight, narrate, pace, setupRecast, typeText } from 'playwright-recast';
import { blockOutsideRequests, blockWrites, patchJson, stubJson } from './mocks';

// RECAST_FAST=1 shrinks every wait for selector debugging; recordings run without it.
const FAST = process.env.RECAST_FAST === '1';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5005';
const API_URL = process.env.API_URL ?? 'http://localhost:3000';

setupRecast(test, {
  typingDelayMs: FAST ? 10 : 140,
  hoverDwellMs: FAST ? 0 : 500,
  clickSettleMs: FAST ? 0 : 400,
  narrateAutoWait: FAST ? false : { charactersPerSecond: 12, minMs: 2500, maxMs: 6000 },
});

const HIGHLIGHT_MS = 2500;
const TOAST_BEAT_MS = 2000;
// Longer prose types a little faster than the 140 ms default, or a paragraph drags.
const PROSE_TYPING = { delayMs: FAST ? 10 : 110 };
const OVERLAY_MOUNT_TIMEOUT_MS = FAST ? 3_000 : 15_000;

test('<Feature> walkthrough', async ({ page }) => {
  // The render cuts this step: nothing in it is on camera.
  await test.step('prepare', async () => {
    await blockOutsideRequests(page, [new URL(FRONTEND_URL).origin, new URL(API_URL).origin]);
    await blockWrites(page, [/* globs of local endpoints whose writes reach a shared service */]);
    // stubJson / patchJson calls go after the blocks
    await hideDevTooling(page);
    await page.goto('/');
    await dismissOverlays(page);
    await hold(page, 1000);
  });

  // Example scene; replace.
  // await narrate('Short caption, at most sixty characters.');
  // await pointAt(page, page.getByTestId('…'));
  // await typeText(page.getByTestId('…'), 'text', PROSE_TYPING);
  // await click(page.getByTestId('…'));
  // await expectToast(page, '…');
  // await hold(page, TOAST_BEAT_MS);
  // await expectNoErrorToast(page);
});

async function pointAt(page: Page, target: Locator, durationMs = HIGHLIGHT_MS): Promise<void> {
  await expect(target).toBeVisible();
  await highlight(target, { duration: durationMs });
  await hold(page, durationMs);
}

async function hold(page: Page, ms: number): Promise<void> {
  await pace(page, FAST ? 50 : ms);
}

async function expectToast(page: Page, text: string): Promise<void> {
  await expect(page.getByTestId('notification').filter({ hasText: text })).toBeVisible({ timeout: 20_000 });
}

// Error toasts fade within seconds, so check after every scene, not once at the end.
async function expectNoErrorToast(page: Page): Promise<void> {
  await expect(page.getByTestId('notification').filter({ hasText: /error|failed|went wrong/i })).toHaveCount(0);
}

async function dismissOverlays(page: Page): Promise<void> {
  // Consent banners mount seconds after load, so an immediate visibility check misses them.
  const consent = page.getByRole('button', { name: 'Got it!' });
  const appeared = await consent.click({ timeout: OVERLAY_MOUNT_TIMEOUT_MS }).then(() => true, () => false);
  if (appeared) {
    await expect(consent).toBeHidden();
  }
}

async function hideDevTooling(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '#__vue-devtools-container__ { display: none !important; }';
      document.head.appendChild(style);
    });
  });
}
