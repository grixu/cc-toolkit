export type Account = {
  id: string;
  status: 'active' | 'suspended' | 'closed';
  displayName: string;
  creditLimitMinor: number;
};

const DEFAULT_CREDIT_LIMIT_MINOR = 50_000;

export function activeAccount(account: Account) {
  return account.status === 'active';
}

export function displayName(account: Account) {
  return account.displayName.trim();
}

export function creditLimitMinor(account: Account) {
  return account.creditLimitMinor || DEFAULT_CREDIT_LIMIT_MINOR;
}
