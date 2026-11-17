import { Page } from '@playwright/test';

// Playwright runs the most recently registered matching route first, so install the catch-alls
// (blockOutsideRequests, blockWrites) before any stub or patch that should win over them.

export async function blockOutsideRequests(page: Page, allowedOrigins: string[]): Promise<void> {
  await page.route(
    url => !allowedOrigins.includes(url.origin),
    route => route.abort('blockedbyclient'),
  );
}

// Writes to these paths would reach a shared or external service through the backend: a stray click fails instead.
export async function blockWrites(page: Page, urlGlobs: string[]): Promise<void> {
  for (const glob of urlGlobs) {
    await page.route(glob, route =>
      route.request().method() === 'GET' ? route.fallback() : route.abort('blockedbyclient'),
    );
  }
}

// Playwright answers CORS for fulfilled requests itself, preflight included: no headers needed cross-origin.
// Only GETs are stubbed: a stray Save must fall through to blockWrites and fail, not fake a success.
export async function stubJson(page: Page, urlGlob: string, json: unknown, status = 200): Promise<void> {
  await page.route(urlGlob, route =>
    route.request().method() === 'GET' ? route.fulfill({ status, json }) : route.fallback(),
  );
}

export async function patchJson<T>(page: Page, urlGlob: string, patch: (body: T) => T): Promise<void> {
  await page.route(urlGlob, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: patch(await response.json()) });
  });
}
