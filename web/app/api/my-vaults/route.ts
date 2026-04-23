import { Connection, PublicKey } from "@solana/web3.js";
import {
  getProgramId,
  getRpcUrl,
  ProgramIdNotConfiguredError,
  RpcNotConfiguredError,
} from "@/app/lib/tip-vault";

// Layouts (must match programs/tip-vault/src/lib.rs):
//   Vault:      8 disc + 32 tipper + 32 recipient + 8 rate + 8 last + 8 claimed + 1 bump = 97
//   TokenVault: adds 32 mint right after recipient                                        = 129
const VAULT_SIZE = 97;
const TOKEN_VAULT_SIZE = 129;
const RECIPIENT_OFFSET = 8 + 32; // skip discriminator + tipper

type Entry = {
  address: string;
  type: "sol" | "token";
  tipper: string;
  mint?: string;
  ratePerSlot: string;
  lastClaimSlot: string;
  totalClaimed: string;
  currentLamports?: string;
};

function readU64LE(data: Buffer, offset: number): string {
  return data.readBigUInt64LE(offset).toString();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("recipient");
    if (!raw) return Response.json({ vaults: [], error: "Missing recipient" }, { status: 400 });
    let recipient: PublicKey;
    try {
      recipient = new PublicKey(raw);
    } catch {
      return Response.json({ vaults: [], error: "Invalid recipient pubkey" }, { status: 400 });
    }

    const conn = new Connection(getRpcUrl(), "confirmed");
    const programId = getProgramId();

    const accounts = await conn.getProgramAccounts(programId, {
      commitment: "confirmed",
      filters: [
        { memcmp: { offset: RECIPIENT_OFFSET, bytes: recipient.toBase58() } },
      ],
    });

    const vaults: Entry[] = [];
    for (const { pubkey, account } of accounts) {
      const data = account.data as Buffer;
      if (data.length === VAULT_SIZE) {
        const tipper = new PublicKey(data.subarray(8, 40)).toBase58();
        vaults.push({
          address: pubkey.toBase58(),
          type: "sol",
          tipper,
          ratePerSlot: readU64LE(data, 72),
          lastClaimSlot: readU64LE(data, 80),
          totalClaimed: readU64LE(data, 88),
          currentLamports: String(account.lamports),
        });
      } else if (data.length === TOKEN_VAULT_SIZE) {
        const tipper = new PublicKey(data.subarray(8, 40)).toBase58();
        const mint = new PublicKey(data.subarray(72, 104)).toBase58();
        vaults.push({
          address: pubkey.toBase58(),
          type: "token",
          tipper,
          mint,
          ratePerSlot: readU64LE(data, 104),
          lastClaimSlot: readU64LE(data, 112),
          totalClaimed: readU64LE(data, 120),
        });
      }
    }

    return Response.json(
      { vaults },
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    if (
      err instanceof ProgramIdNotConfiguredError ||
      err instanceof RpcNotConfiguredError
    ) {
      return Response.json({ vaults: [], error: err.message }, { status: 503 });
    }
    console.error("[my-vaults] unhandled", err);
    return Response.json(
      { vaults: [], error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
