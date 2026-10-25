export interface Request {
  headers: Record<string, string | undefined>;
}

export function requireServiceToken(req: Request): boolean {
  const token = process.env.SERVICE_TOKEN;
  return token !== undefined && req.headers["x-service-token"] === token;
}
