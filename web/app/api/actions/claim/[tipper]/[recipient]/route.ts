import {
  ACTIONS_CORS_HEADERS,
  type ActionGetResponse,
  type ActionPostRequest,
  createPostResponse,
} from "@solana/actions";
import { clusterApiUrl, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { claimIx, ProgramIdNotConfiguredError } from "@/app/lib/tip-vault";

type Params = { params: Promise<{ tipper: string; recipient: string }> };

function jsonError(message: string, status = 400) {
  return Response.json({ message }, { status, headers: ACTIONS_CORS_HEADERS });
}

function parsePubkey(raw: string): PublicKey | null {
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: Params) {
  const { tipper: rawT, recipient: rawR } = await params;
  const tipper = parsePubkey(rawT);
  const recipient = parsePubkey(rawR);
  if (!tipper || !recipient) return jsonError("Invalid pubkey");

  const origin = new URL(req.url).origin;
  const payload: ActionGetResponse = {
    type: "action",
    icon: `${origin}/tip-icon.png`,
    label: "Claim",
    title: "Claim vested tips",
    description: `Claim whatever has vested from ${rawT.slice(0, 4)}…${rawT.slice(-4)}.`,
    links: {
      actions: [
        {
          type: "transaction",
          label: "Claim",
          href: `/api/actions/claim/${rawT}/${rawR}`,
        },
      ],
    },
  };
  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(req: Request, { params }: Params) {
  const { tipper: rawT, recipient: rawR } = await params;
  const tipper = parsePubkey(rawT);
  const recipient = parsePubkey(rawR);
  if (!tipper || !recipient) return jsonError("Invalid pubkey");

  // Claim is permissionless — any signer can crank, lamports still flow to the
  // vault's recipient. We use body.account as fee payer.
  const body: ActionPostRequest = await req.json();
  const feePayer = parsePubkey(body.account);
  if (!feePayer) return jsonError("Invalid account");

  let ix;
  try {
    ix = claimIx({ tipper, recipient });
  } catch (err) {
    if (err instanceof ProgramIdNotConfiguredError) {
      return jsonError(err.message, 503);
    }
    throw err;
  }

  const rpcUrl = process.env.RPC_URL ?? clusterApiUrl("devnet");
  const conn = new Connection(rpcUrl, "confirmed");
  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer, recentBlockhash: blockhash }).add(ix);

  const response = await createPostResponse({
    fields: { transaction: tx, message: "Claimed vested tips" },
  });
  return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
}

export async function OPTIONS() {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}
