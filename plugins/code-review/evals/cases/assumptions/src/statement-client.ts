import { request } from '@acme/fetchkit';

const LEDGER_API = 'https://ledger.internal.example.com';

export async function fetchStatement(statementId: string, apiKey: string): Promise<unknown> {
  const url = new URL(`/v1/statements/${encodeURIComponent(statementId)}`, LEDGER_API);
  let res = await request(url.href, { headers: { 'X-Api-Key': apiKey }, redirect: 'manual' });

  if (res.status >= 300 && res.status < 400) {
    const next = new URL(res.headers.location, url);
    if (next.origin !== url.origin) throw new Error(`statement ${statementId}: redirected off-origin to ${next.origin}`);
    res = await request(next.href, { headers: { 'X-Api-Key': apiKey }, redirect: 'manual' });
  }

  if (res.status !== 200) throw new Error(`statement ${statementId}: ledger answered ${res.status}`);
  return res.json();
}
