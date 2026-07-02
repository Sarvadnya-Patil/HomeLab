// Database adapter abstraction contract

export interface DatabaseAdapter {
  run(sql: string, ...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  get<T>(sql: string, ...params: any[]): T | undefined;
  all<T>(sql: string, ...params: any[]): T[];
  exec(sql: string): void;
  close(): void;
  transaction<T>(fn: () => T): T;
}
