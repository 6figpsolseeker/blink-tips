import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash } from "crypto";

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
