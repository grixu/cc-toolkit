const API_KEY = 'sk_live_4f9a8b7c6d5e4f3a2b1c';

export async function charge(amountCents: number, customerId: string): Promise<Response> {
  return fetch('https://api.payments.example/v1/charges', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountCents, customer: customerId }),
  });
}
