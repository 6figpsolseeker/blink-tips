import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash } from "crypto";

export const PROGRAM_ID = new PublicKey(
  process.env.TIP_VAULT_PROGRAM_ID ?? "TipV1111111111111111111111111111111111111",
);

// Solana target throughput — used to convert a human duration (days) into slots.
export const SLOTS_PER_SECOND = 2.5;

export function anchorDiscriminator(ixName: string): Buffer {
  return createHash("sha256").update(`global:${ixName}`).digest().subarray(0, 8);
}

export function vaultPda(tipper: PublicKey, recipient: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), tipper.toBuffer(), recipient.toBuffer()],
    PROGRAM_ID,
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
    programId: PROGRAM_ID,
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
    programId: PROGRAM_ID,
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
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.tipper, isSigner: false, isWritable: false },
      { pubkey: args.recipient, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
    ],
    data: anchorDiscriminator("claim"),
  });
}
