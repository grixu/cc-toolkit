export type Route = { method: 'GET' | 'POST'; path: string; handler: () => Promise<unknown> };

export const routes: Route[] = [
  { method: 'GET', path: '/health', handler: async () => ({ ok: true }) },
];
