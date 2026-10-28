import { request } from '@acme/fetchkit';

const PARTNER_API = 'https://api.partner.example.com';

// The partner answers the document route with a 302 to a signed URL on its file-storage host.
export async function fetchInvoiceDocument(invoiceId: string, apiKey: string): Promise<unknown> {
  const res = await request(`${PARTNER_API}/v2/invoices/${encodeURIComponent(invoiceId)}/document`, {
    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
  });
  if (res.status !== 200) throw new Error(`invoice ${invoiceId}: partner answered ${res.status}`);
  return res.json();
}
