import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// Lazy-initialize so local `next build` (where env may be unset) doesn't
// throw during page-data collection. First real use still throws loudly
// with a readable error — much better than Upstash's silent console.warn.

let _redis: Redis | null = null;
let _ratelimit: Ratelimit | null = null;

function init() {
  if (_redis && _ratelimit) return { redis: _redis, ratelimit: _ratelimit };
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set. " +
        "Provision a free Upstash Redis DB and populate both env vars in Vercel.",
    );
  }
  _redis = new Redis({ url, token });
  _ratelimit = new Ratelimit({
    redis: _redis,
    limiter: Ratelimit.slidingWindow(10, "60 s"),
    analytics: false,
    prefix: "rl:msg",
  });
  return { redis: _redis, ratelimit: _ratelimit };
}

export function getRedis(): Redis {
  return init().redis;
}

export function getMessageRatelimit(): Ratelimit {
  return init().ratelimit;
}
