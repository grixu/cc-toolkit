export interface InterceptedRequest {
  url(): string;
  method(): string;
  headers(): Record<string, string>;
}

export interface AuditOptions {
  headers?: Record<string, string>;
  onRequest?: (request: InterceptedRequest) => Record<string, string> | void;
  timeoutMs?: number;
}

export interface AuditIssue {
  code: string;
  message: string;
  selector: string;
}

export interface AuditResult {
  url: string;
  issues: AuditIssue[];
}

export interface Session {
  audit(url: string, options?: AuditOptions): Promise<AuditResult>;
  close(): Promise<void>;
}

export declare function createSession(): Promise<Session>;
