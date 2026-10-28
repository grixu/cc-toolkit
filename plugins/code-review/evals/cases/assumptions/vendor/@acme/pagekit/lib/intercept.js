'use strict';

async function applyExtraHeaders(page, headers) {
  await page.setRequestInterception(true);
  const onFirstRequest = async (request) => {
    page.off('request', onFirstRequest);
    await request.continue({ headers: { ...request.headers(), ...headers } });
    await page.setRequestInterception(false);
  };
  page.on('request', onFirstRequest);
}

async function applyRequestHook(page, hook) {
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const extra = hook(request) ?? {};
    await request.continue({ headers: { ...request.headers(), ...extra } });
  });
}

module.exports = { applyExtraHeaders, applyRequestHook };
