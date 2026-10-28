export interface Account {
  verified: boolean;
  points: number;
}

export type Tier = 'gold' | 'silver';

const GOLD_MIN_POINTS = 1_000;
const REDEEM_MIN_POINTS = 500;

export function tierFor(points: number): Tier {
  if (!Number.isInteger(points) || points < 0) throw new RangeError(`invalid points balance ${points}`);
  return points >= GOLD_MIN_POINTS ? 'gold' : 'silver';
}

export function canRedeem(account: Account): boolean {
  return account.verified && account.points >= REDEEM_MIN_POINTS;
}
