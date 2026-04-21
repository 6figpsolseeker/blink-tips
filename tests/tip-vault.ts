import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { assert } from "chai";
import type { TipVault } from "../target/types/tip_vault";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForSlots(conn: Connection, n: number) {
  const start = await conn.getSlot();
  while ((await conn.getSlot()) < start + n) await sleep(150);
}

async function fund(conn: Connection, pubkey: PublicKey, sol: number) {
  const sig = await conn.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig, "confirmed");
}

describe("tip-vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.TipVault as Program<TipVault>;
  const conn = provider.connection;

  const vaultPda = (tipper: PublicKey, recipient: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), tipper.toBuffer(), recipient.toBuffer()],
      program.programId,
    )[0];

  const makePair = async (sol = 2) => {
    const tipper = Keypair.generate();
    const recipient = Keypair.generate();
    await fund(conn, tipper.publicKey, sol);
    return { tipper, recipient, vault: vaultPda(tipper.publicKey, recipient.publicKey) };
  };

  it("initializes a vault and records correct state", async () => {
    const { tipper, recipient, vault } = await makePair();
    const deposit = new BN(0.5 * LAMPORTS_PER_SOL);
    const rate = new BN(1_000_000);

    await program.methods
      .initializeVault(rate, deposit)
      .accounts({
        tipper: tipper.publicKey,
        recipient: recipient.publicKey,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([tipper])
      .rpc();

    const state = await program.account.vault.fetch(vault);
    assert.ok(state.tipper.equals(tipper.publicKey));
    assert.ok(state.recipient.equals(recipient.publicKey));
    assert.strictEqual(state.ratePerSlot.toString(), rate.toString());
    assert.strictEqual(state.totalClaimed.toString(), "0");
  });

  it("vests per slot and pays the recipient on claim", async () => {
    const { tipper, recipient, vault } = await makePair();
    const rate = new BN(1_000_000);
    const deposit = new BN(0.1 * LAMPORTS_PER_SOL);

    await program.methods
      .initializeVault(rate, deposit)
      .accounts({
        tipper: tipper.publicKey,
        recipient: recipient.publicKey,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([tipper])
      .rpc();

    const before = await conn.getBalance(recipient.publicKey);
    await waitForSlots(conn, 5);

    await program.methods
      .claim()
      .accounts({ tipper: tipper.publicKey, recipient: recipient.publicKey, vault })
      .rpc();

    const delta = (await conn.getBalance(recipient.publicKey)) - before;
    assert.isAtLeast(delta, 5 * rate.toNumber(), "at least N*rate paid out");
    assert.isBelow(delta, deposit.toNumber(), "never exceeds deposit");
  });

  it("rejects a second claim in the same slot (NothingToClaim)", async () => {
    // Bundle two claims in one tx — the second sees last_claim_slot already
    // advanced to the current slot by the first, so nothing has vested.
    const { tipper, recipient, vault } = await makePair();
    const rate = new BN(1_000_000);
    const deposit = new BN(0.05 * LAMPORTS_PER_SOL);

    await program.methods
      .initializeVault(rate, deposit)
      .accounts({
        tipper: tipper.publicKey,
        recipient: recipient.publicKey,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([tipper])
      .rpc();

    await waitForSlots(conn, 2);

    const claimAccounts = {
      tipper: tipper.publicKey,
      recipient: recipient.publicKey,
      vault,
    };
    const ix1 = await program.methods.claim().accounts(claimAccounts).instruction();
    const ix2 = await program.methods.claim().accounts(claimAccounts).instruction();
    const tx = new Transaction().add(ix1, ix2);

    try {
      await provider.sendAndConfirm(tx);
      assert.fail("expected NothingToClaim");
    } catch (err: unknown) {
      assert.match(String(err), /NothingToClaim/);
    }
  });

  it("top-up after drain resets the vesting clock (no back-pay)", async () => {
    const { tipper, recipient, vault } = await makePair();
    const rate = new BN(1_000_000);
    const smallDeposit = new BN(3_000_000); // drains in ~3 slots

    await program.methods
      .initializeVault(rate, smallDeposit)
      .accounts({
        tipper: tipper.publicKey,
        recipient: recipient.publicKey,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([tipper])
      .rpc();

    // Let it over-vest, then drain
    await waitForSlots(conn, 10);
    await program.methods
      .claim()
      .accounts({ tipper: tipper.publicKey, recipient: recipient.publicKey, vault })
      .rpc();

    // Sit empty for several slots — without the reset these would accrue as back-pay
    await waitForSlots(conn, 8);

    const topUp = new BN(5_000_000);
    await program.methods
      .topUp(topUp)
      .accounts({
        tipper: tipper.publicKey,
        recipient: recipient.publicKey,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([tipper])
      .rpc();

    await waitForSlots(conn, 2);

    const before = await conn.getBalance(recipient.publicKey);
    await program.methods
      .claim()
      .accounts({ tipper: tipper.publicKey, recipient: recipient.publicKey, vault })
      .rpc();
    const delta = (await conn.getBalance(recipient.publicKey)) - before;

    // Without reset, back-pay would cap at the 5M top-up (drains it all).
    // With reset, only the ~few slots since top-up have vested.
    assert.isBelow(delta, 4_500_000, "claim must not back-pay the empty interval");
    assert.isAbove(delta, 0, "but some slots have vested since top-up");
  });

  it("close settles vested to recipient and returns remainder to tipper", async () => {
    const { tipper, recipient, vault } = await makePair();
    const rate = new BN(500_000);
    const deposit = new BN(0.05 * LAMPORTS_PER_SOL);

    await program.methods
      .initializeVault(rate, deposit)
      .accounts({
        tipper: tipper.publicKey,
        recipient: recipient.publicKey,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([tipper])
      .rpc();

    await waitForSlots(conn, 3);

    const tipperBefore = await conn.getBalance(tipper.publicKey);
    const recipientBefore = await conn.getBalance(recipient.publicKey);

    await program.methods
      .closeVault()
      .accounts({ tipper: tipper.publicKey, recipient: recipient.publicKey, vault })
      .signers([tipper])
      .rpc();

    const recipientDelta = (await conn.getBalance(recipient.publicKey)) - recipientBefore;
    const tipperDelta = (await conn.getBalance(tipper.publicKey)) - tipperBefore;

    assert.isAbove(recipientDelta, 0, "recipient received vested amount");
    assert.isAbove(tipperDelta, 0.04 * LAMPORTS_PER_SOL, "tipper reclaimed most of deposit");

    const info = await conn.getAccountInfo(vault);
    assert.isNull(info, "vault account closed");
  });
});
