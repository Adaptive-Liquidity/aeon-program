/**
 * AEON Devnet smoke
 * ─────────────────
 * mint → initialize_config → register_agent ×2 → issue_authority → pay
 *
 * Uses the Solana CLI wallet (~/.config/solana/id.json) against public devnet.
 *
 *   npm run smoke:devnet
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getAccount,
  createAssociatedTokenAccountIdempotent,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "fs";
import os from "os";
import path from "path";
import {
  AeonClient,
  categoryFromLabel,
  AEON_PROGRAM_ID,
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

function log(step: string, msg: string) {
  console.log(`\n  ▸ [${step}] ${msg}`);
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
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: Math.floor(sol * LAMPORTS_PER_SOL),
    })
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [from], {
    commitment: "confirmed",
  });
  ok(`funded ${to.toBase58().slice(0, 8)}… with ${sol} SOL (${sig.slice(0, 12)}…)`);
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║            AEON — Devnet Smoke (public)                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const payer = loadKeypair();
  const connection = new Connection(RPC, "confirmed");
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  const bal = await connection.getBalance(payer.publicKey);
  console.log(`  RPC     : ${RPC}`);
  console.log(`  Program : ${AEON_PROGRAM_ID.toBase58()}`);
  console.log(`  Admin   : ${payer.publicKey.toBase58()}`);
  console.log(`  Balance : ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (bal < 0.5 * LAMPORTS_PER_SOL) {
    fail("admin needs ≥ 0.5 SOL for smoke (rent + fees)");
  }

  // Confirm program executable
  const prog = await connection.getAccountInfo(AEON_PROGRAM_ID);
  if (!prog?.executable) fail("program not executable on this cluster");
  ok("program executable on-chain");

  const aeon = AeonClient.fromProvider(provider);
  const payee = Keypair.generate();
  const cat = categoryFromLabel("compute");

  // ─── 1. Mint + config ────────────────────────────────────────────────────
  log("1", "mint + initialize_config");

  let mint: PublicKey;
  try {
    const cfg = await aeon.fetchConfig();
    mint = cfg.aeonMint;
    ok(`reusing config mint ${mint.toBase58()}`);
    ok(`admin=${cfg.admin.toBase58().slice(0, 8)}… paused=${cfg.paused}`);
  } catch {
    mint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      DECIMALS,
      undefined,
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID
    );
    ok(`mint ${mint.toBase58()}`);
    const sig = await aeon.initializeConfig(mint);
    ok(`initialize_config ${sig}`);
    const cfg = await aeon.fetchConfig();
    if (!cfg.aeonMint.equals(mint)) fail("config mint mismatch");
    if (cfg.paused) fail("config unexpectedly paused");
    ok(`config PDA live (counter auth=${cfg.authorityCounter.toNumber()})`);
  }

  // ─── 2. ATAs + mint tokens ───────────────────────────────────────────────
  log("2", "create ATAs and mint AEON to admin");

  const ataAdmin = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    payer.publicKey
  );
  const ataPayee = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    payee.publicKey
  );
  ok(`admin ATA ${ataAdmin.toBase58().slice(0, 8)}…`);
  ok(`payee ATA ${ataPayee.toBase58().slice(0, 8)}…`);

  const mintAmount = 1_000n * BigInt(ONE);
  await mintTo(connection, payer, mint, ataAdmin, payer, mintAmount);
  const adminBal = (await getAccount(connection, ataAdmin)).amount;
  ok(`admin token balance ${Number(adminBal) / ONE}`);

  // ─── 3. Register agents ──────────────────────────────────────────────────
  log("3", "register_agent (admin + payee)");

  await fundIfNeeded(connection, payer, payee.publicKey, 0.05);

  try {
    await aeon.fetchAgent(payer.publicKey);
    ok("admin already registered");
  } catch {
    const sig = await aeon.registerAgent();
    ok(`admin register_agent ${sig}`);
  }

  try {
    await aeon.fetchAgent(payee.publicKey);
    ok("payee already registered");
  } catch {
    const sig = await aeon.registerAgent(payee.publicKey, { signers: [payee] });
    ok(`payee register_agent ${sig}`);
  }

  // second register must fail
  let doubleFail = false;
  try {
    await aeon.registerAgent();
  } catch {
    doubleFail = true;
  }
  if (!doubleFail) fail("second register_agent should fail");
  ok("second register_agent correctly rejected");

  // ─── 4. Issue root authority ─────────────────────────────────────────────
  log("4", "issue_authority (root, compute category)");

  const budget = 100 * ONE;
  const maxPerTx = 50 * ONE;
  const { authorityId, signature: authSig } = await aeon.issueAuthority({
    budget,
    maxPerTx,
    maxTotal: budget,
    categories: [cat],
  });
  ok(`authority #${authorityId} ${authSig}`);

  const auth = await aeon.fetchAuthority(authorityId);
  if (auth.depth !== 0) fail(`expected depth 0, got ${auth.depth}`);
  if (auth.budget.toNumber() !== budget) fail("budget mismatch");
  if (auth.spent.toNumber() !== 0) fail("spent should be 0");
  ok(
    `depth=${auth.depth} budget=${auth.budget.toNumber() / ONE} spent=${auth.spent.toNumber()}`
  );

  // ─── 5. Pay under authority ──────────────────────────────────────────────
  log("5", "pay under authority");

  const payAmount = 10 * ONE;
  const beforePayee = (await getAccount(connection, ataPayee)).amount;
  const beforeAdmin = (await getAccount(connection, ataAdmin)).amount;

  const paySig = await aeon.pay({
    amount: payAmount,
    payee: payee.publicKey,
    payerToken: ataAdmin,
    payeeToken: ataPayee,
    authorityId,
    category: cat,
    aeonMint: mint,
  });
  ok(`pay ${payAmount / ONE} AEON ${paySig}`);

  const afterPayee = (await getAccount(connection, ataPayee)).amount;
  const afterAdmin = (await getAccount(connection, ataAdmin)).amount;
  const authAfter = await aeon.fetchAuthority(authorityId);

  if (afterPayee - beforePayee !== BigInt(payAmount)) {
    fail(
      `payee delta expected ${payAmount}, got ${afterPayee - beforePayee}`
    );
  }
  if (beforeAdmin - afterAdmin !== BigInt(payAmount)) {
    fail(
      `admin delta expected ${payAmount}, got ${beforeAdmin - afterAdmin}`
    );
  }
  if (authAfter.spent.toNumber() !== payAmount) {
    fail(
      `authority spent expected ${payAmount}, got ${authAfter.spent.toNumber()}`
    );
  }
  ok(
    `balances ok — payee +${Number(afterPayee - beforePayee) / ONE}, spent=${
      authAfter.spent.toNumber() / ONE
    }`
  );

  // ─── Summary ─────────────────────────────────────────────────────────────
  const cfgFinal = await aeon.fetchConfig();
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                   DEVNET SMOKE PASS                      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Program     ${AEON_PROGRAM_ID.toBase58()}`);
  console.log(`  Config      ${aeon.configAddress().toBase58()}`);
  console.log(`  Mint        ${mint.toBase58()}`);
  console.log(`  Authority   #${authorityId}`);
  console.log(`  Auth counter ${cfgFinal.authorityCounter.toNumber()}`);
  console.log(
    `  Explorer    https://explorer.solana.com/tx/${paySig}?cluster=devnet`
  );
  console.log("");

  // Persist smoke artifact
  const outDir = path.join(__dirname, "..", "target", "devnet");
  fs.mkdirSync(outDir, { recursive: true });
  const artifact = {
    cluster: "devnet",
    rpc: RPC,
    programId: AEON_PROGRAM_ID.toBase58(),
    config: aeon.configAddress().toBase58(),
    mint: mint.toBase58(),
    admin: payer.publicKey.toBase58(),
    payee: payee.publicKey.toBase58(),
    authorityId,
    paySig,
    authSig,
    smokedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(outDir, "smoke.json"),
    JSON.stringify(artifact, null, 2)
  );
  console.log(`  Artifact   target/devnet/smoke.json\n`);
}

main().catch((e) => {
  console.error("\nDEVNET SMOKE FAILED\n");
  console.error(e);
  process.exit(1);
});
