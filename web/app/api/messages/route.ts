import { PublicKey } from "@solana/web3.js";
import { messageRatelimit, redis } from "@/app/lib/redis";

type Stored = {
  id: string;
  tipper: string;
  recipient: string;
  text: string;
  displayName: string | null;
  anonymous: boolean;
  txSignature: string | null;
  amount: string | null;
  mint: string | null; // "SOL" or mint base58
  createdAt: number;
};

const MAX_TEXT = 280;
const MAX_NAME = 40;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonError(message: string, status = 400) {
  return Response.json({ message }, { status, headers: corsHeaders });
}

function parsePubkey(raw: unknown): PublicKey | null {
  if (typeof raw !== "string") return null;
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

function keyFor(recipient: string) {
  return `msgs:${recipient}`;
}

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    // Per-IP rate limit first — cheap guard before touching body.
    const ip = clientIp(req);
    const { success } = await messageRatelimit.limit(ip);
    if (!success) return jsonError("Too many messages. Try again in a minute.", 429);

    const body = (await req.json()) as Partial<Stored>;
    const tipper = parsePubkey(body.tipper);
    const recipient = parsePubkey(body.recipient);
    if (!tipper) return jsonError("Invalid tipper pubkey");
    if (!recipient) return jsonError("Invalid recipient pubkey");

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return jsonError("Empty message");
    if (text.length > MAX_TEXT) {
      return jsonError(`Message must be ${MAX_TEXT} characters or fewer`);
    }

    let displayName: string | null = null;
    if (typeof body.displayName === "string" && body.displayName.trim()) {
      displayName = body.displayName.trim().slice(0, MAX_NAME);
    }
    const anonymous = body.anonymous === true;
    // If they chose anonymous we strip any displayName so the client can't
    // smuggle a name in under an "anonymous" flag.
    if (anonymous) displayName = null;

    const txSignature =
      typeof body.txSignature === "string" && body.txSignature.length > 0
        ? body.txSignature.slice(0, 128)
        : null;

    const amount =
      typeof body.amount === "string" && body.amount.length <= 32
        ? body.amount
        : null;
    const mint =
      typeof body.mint === "string" && body.mint.length <= 64 ? body.mint : null;

    const now = Date.now();
    const id = crypto.randomUUID();
    const stored: Stored = {
      id,
      tipper: tipper.toBase58(),
      recipient: recipient.toBase58(),
      text,
      displayName,
      anonymous,
      txSignature,
      amount,
      mint,
      createdAt: now,
    };

    await redis.zadd(keyFor(stored.recipient), {
      score: now,
      member: JSON.stringify(stored),
    });

    return Response.json({ message: stored }, { headers: corsHeaders });
  } catch (err) {
    console.error("[messages POST] unhandled", err);
    return jsonError("Server error", 500);
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const recipientRaw = url.searchParams.get("recipient");
    const tipperRaw = url.searchParams.get("tipper");
    const recipient = parsePubkey(recipientRaw);
    if (!recipient) return jsonError("Invalid recipient pubkey");
    const tipperFilter = tipperRaw ? parsePubkey(tipperRaw) : null;
    if (tipperRaw && !tipperFilter) return jsonError("Invalid tipper pubkey");

    // Newest first, cap at 200 per request — pagination can come later if we
    // ever approach that volume per recipient.
    const raws = await redis.zrange<string[]>(
      keyFor(recipient.toBase58()),
      0,
      199,
      { rev: true },
    );

    const messages: Stored[] = [];
    for (const raw of raws ?? []) {
      try {
        const m: Stored = typeof raw === "string" ? JSON.parse(raw) : (raw as Stored);
        if (tipperFilter && m.tipper !== tipperFilter.toBase58()) continue;
        messages.push(m);
      } catch {
        // Skip corrupt entries; shouldn't happen but don't fail the whole read.
      }
    }

    return Response.json(
      { messages },
      {
        headers: {
          ...corsHeaders,
          "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    console.error("[messages GET] unhandled", err);
    return jsonError("Server error", 500);
  }
}
