export interface Alias {
  name: string;
  target: string;
  /** Epoch ms, never more than 90 days after the record was created or last renewed. */
  expiresAt: number;
}

export interface Route {
  name: string;
  target: string;
  /** Epoch ms, never more than 90 days after the record was created or last renewed. */
  expiresAt: number;
}

/** The key has no record. */
export class NotFoundError extends Error {}

/** The store did not answer in time; the record may or may not exist. */
export class StoreUnavailableError extends Error {}

export interface Table<T> {
  /** Resolves `undefined` when the key has no record. */
  get(name: string): Promise<T | undefined>;
  /** Rejects with `NotFoundError` when the key has no record, `StoreUnavailableError` on a timeout. */
  fetch(name: string): Promise<T>;
  put(record: T): Promise<void>;
  update(name: string, patch: Partial<T>): Promise<void>;
  delete(name: string): Promise<void>;
}

export declare const db: { aliases: Table<Alias>; routes: Table<Route> };

export declare const audit: { record(event: string, subject: string): Promise<void> };
