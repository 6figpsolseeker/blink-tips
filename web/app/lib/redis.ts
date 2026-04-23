import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// Upstash's `Redis.fromEnv()` only `console.warn`s on missing credentials
// and returns a broken client, so the real failure shows up deep inside the
// first request as an opaque error. Fail fast + loud at module load instead.
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  throw new Error(
    "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set. " +
      "Provision a free Upstash Redis DB and populate both env vars in Vercel.",
  );
}

export const redis = new Redis({ url, token });

// Cap message-post abuse: 10 writes per minute per IP is plenty for honest
// use and brutal enough to stop spammers.
export const messageRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  analytics: false,
  prefix: "rl:msg",
});
