import {
  ACTIONS_CORS_HEADERS,
  type ActionGetResponse,
  type ActionPostRequest,
  createPostResponse,
} from "@solana/actions";
import {
  clusterApiUrl,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  initializeVaultIx,
  ProgramIdNotConfiguredError,
  SLOTS_PER_SECOND,
} from "@/app/lib/tip-vault";

type Params = { params: Promise<{ recipient: string }> };

function jsonError(message: string, status = 400) {
  return Response.json({ message }, { status, headers: ACTIONS_CORS_HEADERS });
}

function parseRecipient(raw: string): PublicKey | null {
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: Params) {
  const { recipient: raw } = await params;
  const recipient = parseRecipient(raw);
  if (!recipient) return jsonError("Invalid recipient pubkey");

  const origin = new URL(req.url).origin;
  const short = `${raw.slice(0, 4)}…${raw.slice(-4)}`;

  const payload: ActionGetResponse = {
    type: "action",
    icon: `${origin}/tip-icon.png`,
    label: "Subscribe",
    title: `Tip ${short}`,
    description:
      "Open a recurring tip vault. Funds stream per-slot; the recipient can claim anytime. Close the vault to reclaim any unvested balance.",
    links: {
      actions: [
        {
          type: "transaction",
          label: "0.1 SOL / 7 days",
          href: `/api/actions/subscribe/${raw}?amount=0.1&days=7`,
        },
        {
          type: "transaction",
          label: "0.5 SOL / 30 days",
          href: `/api/actions/subscribe/${raw}?amount=0.5&days=30`,
        },
        {
          type: "transaction",
          label: "Custom",
          href: `/api/actions/subscribe/${raw}?amount={amount}&days={days}`,
          parameters: [
            { name: "amount", label: "SOL to deposit", type: "number", required: true },
            { name: "days", label: "Stream over (days)", type: "number", required: true },
          ],
        },
      ],
    },
  };

  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(req: Request, { params }: Params) {
  const { recipient: raw } = await params;
  const recipient = parseRecipient(raw);
  if (!recipient) return jsonError("Invalid recipient pubkey");

  const url = new URL(req.url);
  const amountSol = Number(url.searchParams.get("amount"));
  const days = Number(url.searchParams.get("days"));
  if (!Number.isFinite(amountSol) || amountSol <= 0) return jsonError("Invalid amount");
  if (!Number.isFinite(days) || days <= 0) return jsonError("Invalid duration");

  const body: ActionPostRequest = await req.json();
  const tipper = parseRecipient(body.account);
  if (!tipper) return jsonError("Invalid account");
  if (tipper.equals(recipient)) return jsonError("Cannot tip yourself");

  const lamports = BigInt(Math.floor(amountSol * LAMPORTS_PER_SOL));
  const totalSlots = BigInt(Math.floor(days * 86_400 * SLOTS_PER_SECOND));
  // Round down, but never below 1 lamport/slot — a zero rate is rejected on-chain.
  const ratePerSlot = lamports / totalSlots || 1n;

  let ix;
  try {
    ix = initializeVaultIx({
      tipper,
      recipient,
      ratePerSlot,
      initialDeposit: lamports,
    });
  } catch (err) {
    if (err instanceof ProgramIdNotConfiguredError) {
      return jsonError(err.message, 503);
    }
    throw err;
  }

  const rpcUrl = process.env.RPC_URL ?? clusterApiUrl("devnet");
  const conn = new Connection(rpcUrl, "confirmed");
  const { blockhash } = await conn.getLatestBlockhash();

  const tx = new Transaction({ feePayer: tipper, recentBlockhash: blockhash }).add(ix);

  const response = await createPostResponse({
    fields: {
      transaction: tx,
      message: `Subscribed: ${amountSol} SOL streaming over ${days} days`,
    },
  });

  return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
}

export async function OPTIONS() {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}
