/**
 * AEON v0.2 Devnet smoke
 * ──────────────────────
 * receipt create → chain · set_paused blocks pay · issue with bond → slash
 *
 *   node -r ts-node/register/transpile-only scripts/devnet-smoke-v02.ts
 */
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotent,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "fs";
import os from "os";
import path from "path";
import {
  AeonClient,
  categoryFromLabel,
  RECEIPT_TYPE,
  BOND_STATUS,
} from "../client";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const DECIMALS = 6;
const ONE = 10 ** DECIMALS;

function loadKeypair(): Keypair {
  const p =
    process.env.SOLANA_WALLET ??
    path.join(os.homedir(), ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(p, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function ok(msg: string) {
  console.log(`    ✓ ${msg}`);
}
function fail(msg: string): never {
  console.error(`    ✗ ${msg}`);
  process.exit(1);
}

async function fundIfNeeded(
  connection: Connection,
  from: Keypair,
  to: PublicKey,
  sol = 0.05
) {
  const bal = await connection.getBalance(to);
  if (bal >= 0.02 * LAMPORTS_PER_SOL) return;
  const { Transaction, SystemProgram, sendAndConfirmTransaction } =
    await import("@solana/web3.js");
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: Math.floor(sol * LAMPORTS_PER_SOL),
    })
  );
  await sendAndConfirmTransaction(connection, tx, [from], {
    commitment: "confirmed",
  });
  ok(`funded ${to.toBase58().slice(0, 8)}… with ${sol} SOL`);
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         AEON — v0.2 Devnet Smoke (receipt/pause/bond)    ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const payer = loadKeypair();
  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  const aeon = AeonClient.fromProvider(provider);

  const bal = await connection.getBalance(payer.publicKey);
  console.log(`  Admin   : ${payer.publicKey.toBase58()}`);
  console.log(`  Balance : ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  const cfg = await aeon.fetchConfig();
  const mint = cfg.aeonMint;
  ok(`config live — mint ${mint.toBase58().slice(0, 8)}… paused=${cfg.paused}`);
  if (!cfg.admin.equals(payer.publicKey)) fail("admin is not this wallet");
  ok("wallet is config admin");

  const ataAdmin = getAssociatedTokenAddressSync(
    mint,
    payer.publicKey,
    true,
    TOKEN_PROGRAM_ID
  );
  const adminBal = (await getAccount(connection, ataAdmin)).amount;
  console.log(`  AEON bal: ${Number(adminBal) / ONE}`);

  // ─── 1. Receipt chain ────────────────────────────────────────────────────
  console.log("\n  ▸ [1] receipt chain");
  const cri0 = await aeon.fetchCri();
  const count0 = cri0.receiptCount.toNumber();
  const r1 = await aeon.createReceipt({
    receiptType: RECEIPT_TYPE.PAY,
    payload: Buffer.from("v02-smoke-receipt-1"),
  });
  ok(`receipt #${r1.receiptId} ${r1.signature}`);
  const cri1 = await aeon.fetchCri();
  if (cri1.receiptCount.toNumber() !== count0 + 1) fail("CRI receipt_count should be +1");
  if (cri1.lastReceiptHash.every((b) => b === 0)) fail("CRI last_receipt_hash not set");
  ok(`CRI updated (count=${count0 + 1}, hash set)`);

  const r2 = await aeon.createReceipt({
    receiptType: RECEIPT_TYPE.ATOMIC_SPLIT,
    payload: Buffer.from("v02-smoke-receipt-2"),
  });
  const rec1 = await aeon.fetchReceipt(r1.receiptId);
  const rec2 = await aeon.fetchReceipt(r2.receiptId);
  const prevMatches =
    Buffer.from(rec2.prevHash).equals(Buffer.from(rec1.hash));
  if (!prevMatches) fail("receipt chain broken: rec2.prevHash != rec1.hash");
  ok(`chain verified — #${r2.receiptId}.prevHash == #${r1.receiptId}.hash`);

  // ─── 2. Pause blocks pay ─────────────────────────────────────────────────
  console.log("\n  ▸ [2] pause blocks pay");
  const budget = 100 * ONE;
  const { authorityId } = await aeon.issueAuthority({
    budget,
    maxPerTx: 50 * ONE,
    maxTotal: budget,
    categories: [categoryFromLabel("compute")],
  });
  ok(`authority #${authorityId} issued`);

  const payee = Keypair.generate();
  const ataPayee = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    payee.publicKey
  );
  await fundIfNeeded(connection, payer, payee.publicKey, 0.05);
  await aeon.registerAgent(payee.publicKey, { signers: [payee] });

  await aeon.setPaused(true);
  ok("paused=true");

  let pauseBlocked = false;
  try {
    await aeon.pay({
      amount: ONE,
      payee: payee.publicKey,
      payerToken: ataAdmin,
      payeeToken: ataPayee,
      authorityId,
      category: categoryFromLabel("compute"),
      aeonMint: mint,
    });
  } catch (e: any) {
    const s = String(e?.message ?? e);
    if (s.includes("Paused")) pauseBlocked = true;
  }
  if (!pauseBlocked) fail("pay should be blocked by Paused");
  ok("pay blocked with Paused");

  await aeon.setPaused(false);
  ok("paused=false");

  const paySig = await aeon.pay({
    amount: ONE,
    payee: payee.publicKey,
    payerToken: ataAdmin,
    payeeToken: ataPayee,
    authorityId,
    category: categoryFromLabel("compute"),
    aeonMint: mint,
  });
  ok(`pay after unpause ok ${paySig}`);

  // ─── 3. Bond: issue → slash ──────────────────────────────────────────────
  console.log("\n  ▸ [3] bond issue → slash");
  const bondAuthId = authorityId + 1;
  const bondPda = aeon.authorityBondAddress(bondAuthId);
  const bondVaultAta = getAssociatedTokenAddressSync(
    mint,
    bondPda,
    true,
    TOKEN_PROGRAM_ID
  );
  await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    bondPda,
    {},
    TOKEN_PROGRAM_ID,
    undefined,
    true
  );
  const BOND = 50 * ONE;
  const { authorityId: bId } = await aeon.issueAuthority({
    authorityId: bondAuthId,
    budget: 100 * ONE,
    maxPerTx: 50 * ONE,
    bondAmount: BOND,
    agentVault: ataAdmin,
    bondVault: bondVaultAta,
  });
  ok(`authority #${bId} issued with bond ${BOND / ONE}`);

  const bond = await aeon.fetchAuthorityBond(bId);
  if (bond.status !== BOND_STATUS.ACTIVE) fail("bond should be ACTIVE");
  if (bond.amount.toNumber() !== BOND) fail("bond amount mismatch");
  const vaultBal = (await getAccount(connection, bondVaultAta)).amount;
  if (vaultBal !== BigInt(BOND)) fail(`bond vault expected ${BOND}, got ${vaultBal}`);
  ok("bond vault funded");

  const dest = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    payer.publicKey
  );
  const slashSig = await aeon.slashBond({
    authorityId: bId,
    bondVault: bondVaultAta,
    destination: dest,
  });
  ok(`slash ${slashSig}`);

  const bondAfter = await aeon.fetchAuthorityBond(bId);
  if (bondAfter.status !== BOND_STATUS.SLASHED) fail("bond should be SLASHED");
  const destBal = (await getAccount(connection, dest)).amount;
  if (destBal < BigInt(BOND)) fail(`destination expected ≥ ${BOND}, got ${destBal}`);
  ok("bond SLASHED, funds moved to destination");

  // ─── Summary ─────────────────────────────────────────────────────────────
  const cfgFinal = await aeon.fetchConfig();
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                  V0.2 DEVNET SMOKE PASS                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Program      ${aeon.programId.toBase58()}`);
  console.log(`  Config       ${aeon.configAddress().toBase58()}`);
  console.log(`  Receipts     #${r1.receiptId}, #${r2.receiptId} (chain ok)`);
  console.log(`  Receipt ctr  ${cfgFinal.receiptCounter.toNumber()}`);
  console.log(`  Pause        blocks pay ✓`);
  console.log(`  Bond         #${bId} slashed ${BOND / ONE} AEON`);

  const outDir = path.join(__dirname, "..", "target", "devnet");
  fs.mkdirSync(outDir, { recursive: true });
  const artifact = {
    cluster: "devnet",
    programId: aeon.programId.toBase58(),
    config: aeon.configAddress().toBase58(),
    mint: mint.toBase58(),
    admin: payer.publicKey.toBase58(),
    receipts: [r1.receiptId, r2.receiptId],
    pauseAuthorityId: authorityId,
    bondAuthorityId: bId,
    slashSig,
    smokedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(outDir, "smoke-v02.json"),
    JSON.stringify(artifact, null, 2)
  );
  console.log(`  Artifact     target/devnet/smoke-v02.json\n`);
}

main().catch((e) => {
  console.error("\nV0.2 DEVNET SMOKE FAILED\n");
  console.error(String(e).slice(0, 800));
  process.exit(1);
});
