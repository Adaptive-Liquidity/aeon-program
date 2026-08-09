/**
 * Minimal Solana devnet Proof-of-Work faucet miner (TypeScript-free .mjs).
 * Mines keypairs with leading base58 'A' prefixes and claims from PoW faucet.
 *
 * Program: PoWSNH2hEZogtCg1Zgm51FnkmJperzYDgPK4fvs8taL
 *
 * Usage:
 *   node scripts/pow-mine.mjs [--target-sol 4] [--difficulty 3] [--reward 0.02]
 *
 * Needs a few thousand lamports for fees first (one successful airdrop dust).
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";
import bs58 from "bs58";

const POW_PROGRAM = new PublicKey(
  "PoWSNH2hEZogtCg1Zgm51FnkmJperzYDgPK4fvs8taL"
);
// Anchor discriminator for `airdrop` = sha256("global:airdrop")[0..8]
// Precomputed: 8c 5c 3f 3e 5d 1b 8f 2a  — compute at runtime via simple hash if needed
import { createHash } from "crypto";

function anchorDisc(name) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

const DISC_AIRDROP = anchorDisc("airdrop");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { targetSol: 4, difficulty: null, reward: null, url: "https://api.devnet.solana.com" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--target-sol") out.targetSol = parseFloat(args[++i]);
    else if (args[i] === "--difficulty") out.difficulty = parseInt(args[++i], 10);
    else if (args[i] === "--reward") out.reward = parseFloat(args[++i]);
    else if (args[i] === "--url") out.url = args[++i];
  }
  return out;
}

function loadKeypair() {
  const p = path.join(os.homedir(), ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(p, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function leadingACount(pubkey) {
  const s = bs58.encode(pubkey.toBytes());
  let n = 0;
  for (const ch of s) {
    if (ch === "A") n++;
    else break;
  }
  return n;
}

function u64le(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

function findSpecPda(difficulty, amount) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("spec"), Buffer.from([difficulty]), u64le(amount)],
    POW_PROGRAM
  )[0];
}

function findSourcePda(spec) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("source"), spec.toBuffer()],
    POW_PROGRAM
  )[0];
}

function findReceiptPda(signer, difficulty) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("receipt"), signer.toBuffer(), Buffer.from([difficulty])],
    POW_PROGRAM
  )[0];
}

async function getFaucets(connection, minDifficulty, minAmount) {
  // DataSize 17 = 8 disc + 1 difficulty + 8 amount
  const accounts = await connection.getProgramAccounts(POW_PROGRAM, {
    filters: [{ dataSize: 17 }],
  });
  const faucets = [];
  for (const { pubkey, account } of accounts) {
    const difficulty = account.data[8];
    const amount = Number(account.data.readBigUInt64LE(9));
    if (minDifficulty != null && difficulty < minDifficulty) continue;
    if (minAmount != null && amount < minAmount) continue;
    if (amount < 895_880) continue; // unprofitable
    const source = findSourcePda(pubkey);
    const bal = await connection.getBalance(source);
    if (bal < amount) continue;
    faucets.push({
      spec: pubkey,
      source,
      difficulty,
      amount,
      rewardSol: amount / LAMPORTS_PER_SOL,
    });
  }
  faucets.sort((a, b) => b.amount - a.amount || a.difficulty - b.difficulty);
  return faucets;
}

async function claim(connection, payer, mined, faucet) {
  const receipt = findReceiptPda(mined.publicKey, faucet.difficulty);
  const keys = [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: mined.publicKey, isSigner: true, isWritable: false },
    { pubkey: receipt, isSigner: false, isWritable: true },
    { pubkey: faucet.spec, isSigner: false, isWritable: false },
    { pubkey: faucet.source, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  const ix = new TransactionInstruction({
    programId: POW_PROGRAM,
    keys,
    data: Buffer.from(DISC_AIRDROP),
  });
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, mined], {
    commitment: "confirmed",
  });
  return sig;
}

async function main() {
  const opts = parseArgs();
  const payer = loadKeypair();
  const connection = new Connection(opts.url, "confirmed");
  console.log("payer:", payer.publicKey.toBase58());
  console.log("rpc:", opts.url);

  let bal = await connection.getBalance(payer.publicKey);
  console.log("balance:", bal / LAMPORTS_PER_SOL, "SOL");

  if (bal < 10_000) {
    console.log("balance too low for fees — requesting airdrop dust…");
    try {
      const sig = await connection.requestAirdrop(
        payer.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(sig, "confirmed");
      bal = await connection.getBalance(payer.publicKey);
      console.log("after airdrop:", bal / LAMPORTS_PER_SOL, "SOL");
    } catch (e) {
      console.error(
        "Airdrop failed. Fund the wallet with a tiny amount of devnet SOL first, then re-run."
      );
      console.error(String(e.message || e).slice(0, 200));
      process.exit(1);
    }
  }

  const minAmount =
    opts.reward != null ? Math.floor(opts.reward * LAMPORTS_PER_SOL) : null;
  let faucets = await getFaucets(connection, opts.difficulty, minAmount);
  if (!faucets.length) {
    console.error("No funded PoW faucets found on devnet.");
    process.exit(1);
  }
  console.log(
    "faucets:",
    faucets
      .slice(0, 8)
      .map((f) => `d=${f.difficulty} r=${f.rewardSol}`)
      .join(", ")
  );

  const minDiff = Math.min(...faucets.map((f) => f.difficulty));
  console.log("min difficulty:", minDiff);
  console.log("mining until", opts.targetSol, "SOL…");

  const target = Math.floor(opts.targetSol * LAMPORTS_PER_SOL);
  let earned = 0;
  let attempts = 0;
  const start = Date.now();

  while (earned < target) {
    attempts++;
    const mined = Keypair.generate();
    const prefix = leadingACount(mined.publicKey);
    if (prefix < minDiff) {
      if (attempts % 500_000 === 0) {
        const rate = attempts / ((Date.now() - start) / 1000);
        process.stdout.write(
          `\r  ground ${attempts.toLocaleString()} keys (${rate.toFixed(0)}/s)…`
        );
      }
      continue;
    }

    console.log(
      `\nmined ${mined.publicKey.toBase58()} (prefix A's=${prefix})`
    );
    const candidates = faucets
      .filter((f) => f.difficulty <= prefix)
      .sort((a, b) => b.amount - a.amount);

    for (const f of candidates) {
      try {
        const sig = await claim(connection, payer, mined, f);
        earned += f.amount;
        console.log(
          `  claimed ${f.rewardSol} SOL (total ${(
            earned / LAMPORTS_PER_SOL
          ).toFixed(4)}) sig=${sig.slice(0, 16)}…`
        );
        break; // one claim per mined key (receipt is per difficulty)
      } catch (e) {
        console.log("  claim failed:", String(e.message || e).slice(0, 120));
      }
    }

    bal = await connection.getBalance(payer.publicKey);
    if (bal >= target) break;
    // refresh faucets occasionally
    if (attempts % 2_000_000 === 0) {
      faucets = await getFaucets(connection, opts.difficulty, minAmount);
    }
  }

  bal = await connection.getBalance(payer.publicKey);
  console.log("\n✓ done. balance:", bal / LAMPORTS_PER_SOL, "SOL");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
