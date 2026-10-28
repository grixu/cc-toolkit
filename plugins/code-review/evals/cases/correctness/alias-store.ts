import { audit, db, NotFoundError, type Alias, type Route } from './store-client';

const DAY_MS = 86_400_000;
const MAX_TTL_MS = 90 * DAY_MS;
const MAX_HOPS = 8;

export async function resolveAlias(name: string): Promise<string> {
  const alias = await db.aliases.get(name);
  if (!alias) return name;
  return resolveAlias(alias.target);
}

export async function resolveRoute(name: string): Promise<string> {
  const seen = new Set<string>();
  let current = name;
  while (!seen.has(current)) {
    if (seen.size > MAX_HOPS) throw new Error(`route chain from ${name} is longer than ${MAX_HOPS} hops`);
    seen.add(current);
    const route = await db.routes.get(current);
    if (!route) return current;
    current = route.target;
  }
  throw new Error(`route chain from ${name} loops back to ${current}`);
}

export async function findAlias(name: string): Promise<Alias | null> {
  try {
    return await db.aliases.fetch(name);
  } catch {
    return null;
  }
}

export async function aliasStatus(name: string): Promise<{ status: 200 | 404; alias?: Alias }> {
  const alias = await findAlias(name);
  return alias ? { status: 200, alias } : { status: 404 };
}

export async function findRoute(name: string): Promise<Route | null> {
  try {
    return await db.routes.fetch(name);
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

export async function routeStatus(name: string): Promise<{ status: 200 | 404; route?: Route }> {
  const route = await findRoute(name);
  return route ? { status: 200, route } : { status: 404 };
}

export async function renewAlias(name: string, requestedExpiry: number, now: number): Promise<void> {
  if (requestedExpiry <= now) throw new RangeError(`expiry ${requestedExpiry} is not in the future`);
  await db.aliases.update(name, { expiresAt: requestedExpiry });
}

export async function renewRoute(name: string, requestedExpiry: number, now: number): Promise<void> {
  if (requestedExpiry <= now) throw new RangeError(`expiry ${requestedExpiry} is not in the future`);
  await db.routes.update(name, { expiresAt: Math.min(requestedExpiry, now + MAX_TTL_MS) });
}

export async function purgeAliases(names: string[]): Promise<number> {
  let purged = 0;
  names.forEach(async (name) => {
    await db.aliases.delete(name);
    await audit.record('alias.purged', name);
    purged++;
  });
  return purged;
}

export async function purgeRoutes(names: string[]): Promise<number> {
  for (const name of names) {
    await db.routes.delete(name);
    await audit.record('route.purged', name);
  }
  return names.length;
}
