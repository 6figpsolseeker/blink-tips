import { Connection, PublicKey } from "@solana/web3.js";
import {
  getProgramId,
  getRpcUrl,
  ProgramIdNotConfiguredError,
  RpcNotConfiguredError,
} from "@/app/lib/tip-vault";

// Vault account layout (SOL):
//   8  anchor discriminator
//  32  tipper
//  32  recipient
//   8  rate_per_slot
//   8  last_claim_slot
//   8  total_claimed
//   1  bump
// Total: 97 bytes.
const VAULT_SIZE = 97;

// TokenVault has an extra 32-byte mint, so 129 bytes. We leave token vaults
// out of the leaderboard for now — their totals are in mint-specific base
// units and can't be aggregated with SOL lamports without a price oracle.
const TOKEN_VAULT_SIZE = 129;

// Cache the response at the edge for 60s to keep getProgramAccounts calls
// bounded under load.
export const revalidate = 60;

export async function GET() {
  try {
    const conn = new Connection(getRpcUrl(), "confirmed");
    const programId = getProgramId();

    const accounts = await conn.getProgramAccounts(programId, {
      commitment: "confirmed",
      filters: [{ dataSize: VAULT_SIZE }],
    });

    const totals = new Map<string, bigint>();
    for (const { account } of accounts) {
      const data = account.data;
      if (data.length !== VAULT_SIZE) continue;
      // Skip discriminator (8) + tipper (32) = offset 40
      const recipient = new PublicKey(data.subarray(40, 72)).toBase58();
      // total_claimed is at offset 40+32+8+8 = 88
      const totalClaimed = data.readBigUInt64LE(88);
      totals.set(recipient, (totals.get(recipient) ?? 0n) + totalClaimed);
    }

    const top = [...totals.entries()]
      .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
      .slice(0, 10)
      .map(([recipient, lamports]) => ({
        recipient,
        totalClaimedLamports: lamports.toString(),
      }));

    return Response.json(
      {
        top,
        vaultCount: accounts.length,
        // Also count token vaults for a future tab
        tokenVaultCount: 0,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    if (
      err instanceof ProgramIdNotConfiguredError ||
      err instanceof RpcNotConfiguredError
    ) {
      return Response.json({ top: [], error: err.message }, { status: 503 });
    }
    console.error("[leaderboard] unhandled", err);
    // Return 5xx on genuine RPC failures so ops alerting / uptime checks
    // see the outage. Client treats any non-200 as "no data" and falls
    // back to the "Coming soon" placeholder, so UX is unchanged.
    return Response.json(
      { top: [], error: err instanceof Error ? err.message : String(err) },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
