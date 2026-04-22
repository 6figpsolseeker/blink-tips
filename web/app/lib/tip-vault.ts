import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash } from "crypto";

// Network is driven by the NETWORK env var; "mainnet" switches defaults for
// USDC mint and (below) RPC URL. Default stays "devnet" so local work is safe.
export const NETWORK = (process.env.NETWORK ?? "devnet").toLowerCase() as
  | "mainnet"
  | "devnet";

const USDC_MINT_DEVNET = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
const USDC_MINT_MAINNET = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);

// USDC_MINT env var is an explicit override; otherwise picked from NETWORK.
export const USDC_MINT = process.env.USDC_MINT
  ? new PublicKey(process.env.USDC_MINT)
  : NETWORK === "mainnet"
    ? USDC_MINT_MAINNET
    : USDC_MINT_DEVNET;

export const KNOWN_TOKENS: Record<string, { mint: PublicKey; decimals: number; symbol: string }> = {
  usdc: { mint: USDC_MINT, decimals: 6, symbol: "USDC" },
};

export function resolveToken(input: string | null | undefined) {
  if (!input) return null;
  const lower = input.toLowerCase();
  if (KNOWN_TOKENS[lower]) return KNOWN_TOKENS[lower];
  try {
    return { mint: new PublicKey(input), decimals: 0, symbol: input.slice(0, 4) + "…" };
  } catch {
    return null;
  }
}

const PLACEHOLDER = "TipV1111111111111111111111111111111111111";
let programIdCache: PublicKey | Error | null = null;

export function getProgramId(): PublicKey {
  if (programIdCache instanceof PublicKey) return programIdCache;
  if (programIdCache instanceof Error) throw programIdCache;
  const raw = process.env.TIP_VAULT_PROGRAM_ID;
  try {
    if (!raw || raw === PLACEHOLDER) {
      throw new ProgramIdNotConfiguredError();
    }
    programIdCache = new PublicKey(raw);
    return programIdCache;
  } catch (err) {
    programIdCache = err instanceof Error ? err : new Error(String(err));
    throw programIdCache;
  }
}

export class ProgramIdNotConfiguredError extends Error {
  constructor() {
    super(
      "TIP_VAULT_PROGRAM_ID is not set. Deploy the Anchor program (`anchor deploy`) and set TIP_VAULT_PROGRAM_ID in web/.env.local.",
    );
    this.name = "ProgramIdNotConfiguredError";
  }
}

export class RpcNotConfiguredError extends Error {
  constructor() {
    super(
      "RPC_URL is required when NETWORK=mainnet — public mainnet endpoints throttle hard. Set RPC_URL to a dedicated provider (Helius, Triton, QuickNode).",
    );
    this.name = "RpcNotConfiguredError";
  }
}

// Returns the RPC URL, failing loudly on mainnet if none was set. Prevents
// the silent footgun of building mainnet-signed txs against devnet blockhashes.
export function getRpcUrl(): string {
  if (process.env.RPC_URL) return process.env.RPC_URL;
  if (NETWORK === "mainnet") throw new RpcNotConfiguredError();
  return "https://api.devnet.solana.com";
}

// Solana target throughput — used to convert a human duration (days) into slots.
export const SLOTS_PER_SECOND = 2.5;

export function anchorDiscriminator(ixName: string): Buffer {
  return createHash("sha256").update(`global:${ixName}`).digest().subarray(0, 8);
}

export function vaultPda(tipper: PublicKey, recipient: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), tipper.toBuffer(), recipient.toBuffer()],
    getProgramId(),
  );
}

export function tokenVaultPda(
  tipper: PublicKey,
  recipient: PublicKey,
  mint: PublicKey,
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("token_vault"),
      tipper.toBuffer(),
      recipient.toBuffer(),
      mint.toBuffer(),
    ],
    getProgramId(),
  );
}

function u64LE(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

export function initializeVaultIx(args: {
  tipper: PublicKey;
  recipient: PublicKey;
  ratePerSlot: bigint;
  initialDeposit: bigint;
}): TransactionInstruction {
  const [vault] = vaultPda(args.tipper, args.recipient);
  const data = Buffer.concat([
    anchorDiscriminator("initialize_vault"),
    u64LE(args.ratePerSlot),
    u64LE(args.initialDeposit),
  ]);
  return new TransactionInstruction({
    programId: getProgramId(),
    keys: [
      { pubkey: args.tipper, isSigner: true, isWritable: true },
      { pubkey: args.recipient, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function topUpIx(args: {
  tipper: PublicKey;
  recipient: PublicKey;
  amount: bigint;
}): TransactionInstruction {
  const [vault] = vaultPda(args.tipper, args.recipient);
  const data = Buffer.concat([anchorDiscriminator("top_up"), u64LE(args.amount)]);
  return new TransactionInstruction({
    programId: getProgramId(),
    keys: [
      { pubkey: args.tipper, isSigner: true, isWritable: true },
      { pubkey: args.recipient, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function claimIx(args: {
  tipper: PublicKey;
  recipient: PublicKey;
}): TransactionInstruction {
  const [vault] = vaultPda(args.tipper, args.recipient);
  return new TransactionInstruction({
    programId: getProgramId(),
    keys: [
      { pubkey: args.tipper, isSigner: false, isWritable: false },
      { pubkey: args.recipient, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
    ],
    data: anchorDiscriminator("claim"),
  });
}

// ─── SPL token variants ────────────────────────────────────────────────────

export function initializeTokenVaultIx(args: {
  tipper: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  ratePerSlot: bigint;
  initialDeposit: bigint;
}): TransactionInstruction {
  const [tokenVault] = tokenVaultPda(args.tipper, args.recipient, args.mint);
  const vaultAta = getAssociatedTokenAddressSync(args.mint, tokenVault, true);
  const recipientAta = getAssociatedTokenAddressSync(args.mint, args.recipient);
  const tipperAta = getAssociatedTokenAddressSync(args.mint, args.tipper);
  const data = Buffer.concat([
    anchorDiscriminator("initialize_token_vault"),
    u64LE(args.ratePerSlot),
    u64LE(args.initialDeposit),
  ]);
  return new TransactionInstruction({
    programId: getProgramId(),
    keys: [
      { pubkey: args.tipper, isSigner: true, isWritable: true },
      { pubkey: args.recipient, isSigner: false, isWritable: false },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: tokenVault, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: recipientAta, isSigner: false, isWritable: true },
      { pubkey: tipperAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function claimTokenIx(args: {
  tipper: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
}): TransactionInstruction {
  const [tokenVault] = tokenVaultPda(args.tipper, args.recipient, args.mint);
  const vaultAta = getAssociatedTokenAddressSync(args.mint, tokenVault, true);
  const recipientAta = getAssociatedTokenAddressSync(args.mint, args.recipient);
  return new TransactionInstruction({
    programId: getProgramId(),
    keys: [
      { pubkey: args.tipper, isSigner: false, isWritable: false },
      { pubkey: args.recipient, isSigner: false, isWritable: false },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: tokenVault, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: recipientAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: anchorDiscriminator("claim_token"),
  });
}

export function topUpTokenIx(args: {
  tipper: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  amount: bigint;
}): TransactionInstruction {
  const [tokenVault] = tokenVaultPda(args.tipper, args.recipient, args.mint);
  const vaultAta = getAssociatedTokenAddressSync(args.mint, tokenVault, true);
  const tipperAta = getAssociatedTokenAddressSync(args.mint, args.tipper);
  const data = Buffer.concat([
    anchorDiscriminator("top_up_token"),
    u64LE(args.amount),
  ]);
  return new TransactionInstruction({
    programId: getProgramId(),
    keys: [
      { pubkey: args.tipper, isSigner: true, isWritable: true },
      { pubkey: args.recipient, isSigner: false, isWritable: false },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: tokenVault, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: tipperAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}
