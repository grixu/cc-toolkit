export interface Session {
  merchantId: string;
}

export function currentSession(): Session | null {
  const merchantId = sessionStorage.getItem("merchantId");
  return merchantId ? { merchantId } : null;
}
