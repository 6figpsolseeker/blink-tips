import {
  ACTIONS_CORS_HEADERS,
  type ActionGetResponse,
  type ActionPostRequest,
  createPostResponse,
} from "@solana/actions";
import {
  ComputeBudgetProgram,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getRpcUrl,
  initializeTokenVaultIx,
  initializeVaultIx,
  ProgramIdNotConfiguredError,
  resolveToken,
  RpcNotConfiguredError,
  SLOTS_PER_SECOND,
  tokenVaultPda,
  topUpIx,
  topUpTokenIx,
  vaultPda,
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

// Preset tiers per asset. Keeping SOL's units in lamports-derived logic and
// USDC in human units keeps the query strings readable in the Blink card.
type Preset = { label: string; amount: number; days: number };

const SOL_PRESETS: Preset[] = [
  { label: "0.1 SOL / 7 days", amount: 0.1, days: 7 },
  { label: "0.5 SOL / 30 days", amount: 0.5, days: 30 },
];

const USDC_PRESETS: Preset[] = [
  { label: "5 USDC / 7 days", amount: 5, days: 7 },
  { label: "20 USDC / 30 days", amount: 20, days: 30 },
];

export async function GET(req: Request, { params }: Params) {
  const { recipient: raw } = await params;
  const recipient = parseRecipient(raw);
  if (!recipient) return jsonError("Invalid recipient pubkey");

  const url = new URL(req.url);
  const tokenParam = url.searchParams.get("token");
  const token = resolveToken(tokenParam);
  if (tokenParam && !token) return jsonError("Unknown token");

  const origin = new URL(req.url).origin;
  const short = `${raw.slice(0, 4)}…${raw.slice(-4)}`;
  const asset = token?.symbol ?? "SOL";
  const presets = token ? USDC_PRESETS : SOL_PRESETS;
  const tokenSuffix = tokenParam ? `&token=${tokenParam}` : "";
  const tokenOnly = tokenParam ? `?token=${tokenParam}` : "";

  const payload: ActionGetResponse = {
    type: "action",
    icon: `${origin}/api/icon`,
    label: "Subscribe",
    title: `Tip ${short} in ${asset}`,
    description:
      "Open a recurring tip vault. Funds stream per-slot; the recipient can claim anytime. Close the vault to reclaim any unvested balance.",
    links: {
      actions: [
        ...presets.map((p) => ({
          type: "transaction" as const,
          label: p.label,
          href: `/api/actions/subscribe/${raw}?amount=${p.amount}&days=${p.days}${tokenSuffix}`,
        })),
        {
          type: "transaction",
          label: "Custom",
          href: `/api/actions/subscribe/${raw}${tokenOnly}${tokenOnly ? "&" : "?"}amount={amount}&days={days}`,
          parameters: [
            { name: "amount", label: `${asset} to deposit`, type: "number", required: true },
            { name: "days", label: "Stream over (days)", type: "number", required: true },
          ],
        },
      ],
    },
  };

  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(req: Request, { params }: Params) {
  try {
    return await postImpl(req, params);
  } catch (err) {
    console.error("[subscribe POST] unhandled", err);
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError(`Server error: ${msg.slice(0, 300)}`, 500);
  }
}

async function postImpl(
  req: Request,
  params: Params["params"],
): Promise<Response> {
  const { recipient: raw } = await params;
  const recipient = parseRecipient(raw);
  if (!recipient) return jsonError("Invalid recipient pubkey");

  const url = new URL(req.url);
  const amountHuman = Number(url.searchParams.get("amount"));
  const days = Number(url.searchParams.get("days"));
  const tokenParam = url.searchParams.get("token");
  const token = resolveToken(tokenParam);
  if (tokenParam && !token) return jsonError("Unknown token");
  // Caps are well below u64 overflow for any realistic token, and days ≥ 1
  // protects tippers from footgun sub-day streams where a typo drains funds.
  const MAX_AMOUNT = 1_000_000_000; // 1B tokens, hard cap against overflow
  const MIN_DAYS = 1;
  const MAX_DAYS = 3650; // 10 years
  if (!Number.isFinite(amountHuman) || amountHuman <= 0 || amountHuman > MAX_AMOUNT) {
    return jsonError(`Amount must be between 0 and ${MAX_AMOUNT}`);
  }
  if (!Number.isFinite(days) || days < MIN_DAYS || days > MAX_DAYS) {
    return jsonError(`Duration must be between ${MIN_DAYS} and ${MAX_DAYS} days`);
  }

  const body: ActionPostRequest = await req.json();
  const tipper = parseRecipient(body.account);
  if (!tipper) return jsonError("Invalid account");
  if (tipper.equals(recipient)) return jsonError("Cannot tip yourself");

  const totalSlots = BigInt(Math.floor(days * 86_400 * SLOTS_PER_SECOND));

  let rpcUrl: string;
  try {
    rpcUrl = getRpcUrl();
  } catch (err) {
    if (err instanceof RpcNotConfiguredError) return jsonError(err.message, 503);
    throw err;
  }
  const conn = new Connection(rpcUrl, "confirmed");

  // Branch on whether the vault already exists: init the first time, top_up
  // after. Prevents the System Program "account already in use" failure when
  // a tipper subscribes to the same recipient twice.
  const vaultAddress = token
    ? tokenVaultPda(tipper, recipient, token.mint)[0]
    : vaultPda(tipper, recipient)[0];

  // If the RPC lookup fails we must fail loudly — silently defaulting to
  // "doesn't exist" would rebuild an init tx that then fails on-chain with
  // "account already in use" for real re-subscribers.
  let vaultExists: boolean;
  try {
    vaultExists = (await conn.getAccountInfo(vaultAddress)) !== null;
  } catch (err) {
    console.error("[subscribe] vault existence check failed", err);
    return jsonError(
      "Couldn't verify vault state via the RPC. Please try again in a moment.",
      503,
    );
  }

  let ix;
  let message: string;
  try {
    if (token) {
      const base = BigInt(Math.floor(amountHuman * 10 ** token.decimals));
      if (vaultExists) {
        ix = topUpTokenIx({
          tipper,
          recipient,
          mint: token.mint,
          amount: base,
        });
        message = `Topped up your ${token.symbol} vault with ${amountHuman} (existing rate kept)`;
      } else {
        const ratePerSlot = base / totalSlots || 1n;
        ix = initializeTokenVaultIx({
          tipper,
          recipient,
          mint: token.mint,
          ratePerSlot,
          initialDeposit: base,
        });
        message = `Subscribed: ${amountHuman} ${token.symbol} streaming over ${days} days`;
      }
    } else {
      const lamports = BigInt(Math.floor(amountHuman * LAMPORTS_PER_SOL));
      if (vaultExists) {
        ix = topUpIx({
          tipper,
          recipient,
          amount: lamports,
        });
        message = `Topped up your SOL vault with ${amountHuman} (existing rate kept)`;
      } else {
        const ratePerSlot = lamports / totalSlots || 1n;
        ix = initializeVaultIx({
          tipper,
          recipient,
          ratePerSlot,
          initialDeposit: lamports,
        });
        message = `Subscribed: ${amountHuman} SOL streaming over ${days} days`;
      }
    }
  } catch (err) {
    if (err instanceof ProgramIdNotConfiguredError) {
      return jsonError(err.message, 503);
    }
    throw err;
  }

  const { blockhash } = await conn.getLatestBlockhash();

  const tx = new Transaction({ feePayer: tipper, recentBlockhash: blockhash });
  // SPL init creates up to two ATAs + allocates the TokenVault PDA + does a
  // token transfer — that can crowd the default 200k CU limit. Bump to 400k
  // for the token path; the SOL path is comfortably under 200k.
  if (token && !vaultExists) {
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  }
  tx.add(ix);

  const response = await createPostResponse({
    fields: {
      type: "transaction",
      transaction: tx,
      message,
    },
  });

  return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
}

export async function OPTIONS() {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}
