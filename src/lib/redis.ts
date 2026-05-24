// src/lib/redis.ts
// Redis is used ONLY for idempotency key caching (bonus feature).
// The core concurrency safety is handled via PostgreSQL SELECT FOR UPDATE — no Redis lock needed.

import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

export async function getIdempotencyCache(key: string): Promise<string | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    return await client.get<string>(key);
  } catch {
    return null;
  }
}

export async function setIdempotencyCache(key: string, value: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(key, value, { ex: IDEMPOTENCY_TTL_SECONDS });
  } catch {
    // Non-fatal: idempotency is a best-effort bonus feature
  }
}
