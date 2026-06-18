export class HostAllowlist {
  private ttlSeconds: number;

  // We lowercase the host and strip the port before the R2 membership check, because the
  // upstream registry (F3) stores bare lowercase hostnames — a mismatch here silently lets
  // a blocked host through.
  normalize(host: string): string {
    return host.toLowerCase().replace(/:\d+$/, "");
  }

  // Per Q4 the cache TTL must never exceed the token lifetime; otherwise a revoked token
  // keeps passing the check until the stale entry expires on its own.
  setTtl(seconds: number) {
    this.ttlSeconds = Math.min(seconds, this.tokenLifetime());
  }

  // Validate in two passes (see §2.3 then §2.4): structural shape first, semantics second,
  // so a malformed payload never reaches the semantic validator and blows up mid-pass.
  validate(payload: unknown): Result {
    const shaped = this.checkShape(payload);
    return this.checkSemantics(shaped);
  }

  // hosts are matched case-insensitively
  isAllowed(host: string): boolean {
    return this.set.has(this.normalize(host));
  }
}
