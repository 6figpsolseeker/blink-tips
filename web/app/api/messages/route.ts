import { Connection, PublicKey } from "@solana/web3.js";
import { getMessageRatelimit, getRedis } from "@/app/lib/redis";
import { getProgramId, getRpcUrl } from "@/app/lib/tip-vault";

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
    const { success } = await getMessageRatelimit().limit(ip);
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
    // Solana signatures are 64 bytes → 87–88 base58 chars. Tighten the range
    // so obviously-invalid values bail before we spend an RPC call.
    if (!txSignature || !/^[1-9A-HJ-NP-Za-km-z]{86,90}$/.test(txSignature)) {
      return jsonError("Message must include the tx signature that proves the tip");
    }

    // Verify the signature actually exists on-chain, was signed by the claimed
    // tipper, and references our program. This closes the "anyone can forge a
    // message as anyone else" vector.
    try {
      const conn = new Connection(getRpcUrl(), "confirmed");
      const tx = await conn.getTransaction(txSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (!tx) {
        return jsonError(
          "Transaction not yet confirmed on-chain — try again in a moment.",
          409,
        );
      }
      const message = tx.transaction.message;
      const staticKeys =
        "staticAccountKeys" in message
          ? (message.staticAccountKeys as PublicKey[])
          : (message as { accountKeys: PublicKey[] }).accountKeys;

      // Signers are always static (Solana runtime forbids lookup tables for
      // signer accounts), so slicing static keys is correct for both legacy
      // and v0 txs.
      const numSigners = message.header.numRequiredSignatures;
      const signers = staticKeys.slice(0, numSigners);
      if (!signers.some((k) => k.equals(tipper))) {
        return jsonError(
          "The provided tipper did not sign the referenced transaction.",
          403,
        );
      }

      // Program IDs can come from address-lookup tables on v0 txs, so also
      // include the resolved writable/readonly accounts from tx.meta.
      const allKeys: PublicKey[] = [...staticKeys];
      const loaded = tx.meta?.loadedAddresses;
      if (loaded?.writable) {
        for (const k of loaded.writable) {
          allKeys.push(typeof k === "string" ? new PublicKey(k) : k);
        }
      }
      if (loaded?.readonly) {
        for (const k of loaded.readonly) {
          allKeys.push(typeof k === "string" ? new PublicKey(k) : k);
        }
      }
      if (!allKeys.some((k) => k.equals(getProgramId()))) {
        return jsonError(
          "Referenced transaction is not a blink-tips transaction.",
          403,
        );
      }
    } catch (verifyErr) {
      console.error("[messages POST] on-chain verify failed", verifyErr);
      return jsonError("Could not verify transaction right now.", 502);
    }

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
      // When anonymous we've already verified the tx above but we don't
      // persist the tipper pubkey — the whole point of anonymity is that the
      // recipient can't see who sent the message. Side effect: anonymous
      // messages can't appear on /claim/<tipper>/<recipient> (no tipper to
      // filter on), only in the recipient's inbox.
      tipper: anonymous ? "" : tipper.toBase58(),
      recipient: recipient.toBase58(),
      text,
      displayName,
      anonymous,
      txSignature,
      amount,
      mint,
      createdAt: now,
    };

    await getRedis().zadd(keyFor(stored.recipient), {
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
    const raws = await getRedis().zrange<string[]>(
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
