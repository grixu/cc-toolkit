export interface Db {
  raw<T>(sql: string, bindings: unknown[]): Promise<T[]>;
}

export declare const db: Db;
