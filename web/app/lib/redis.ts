import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// Both URL + token come from Vercel env (already provisioned).
// Redis.fromEnv() reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
export const redis = Redis.fromEnv();

// Cap message-post abuse: 10 writes per minute per IP is plenty for honest
// use and brutal enough to stop spammers.
export const messageRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  analytics: false,
  prefix: "rl:msg",
});
