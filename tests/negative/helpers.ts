/**
 * Shared harness for AEON negative e2e tests.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createMint,
  mintTo,
  getAccount,
  createAssociatedTokenAccountIdempotent,
  createAccount,
  freezeAccount,
  thawAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import {
  AeonClient,
  categoryFromLabel,
  ROLE,
  CONDITION,
  AUTH_STATUS,
} from "../../client";

export const ONE = 1_000_000;
export const DECIMALS = 6;

export type AeonProgram = Program;

export interface Fixture {
  provider: anchor.AnchorProvider;
  program: AeonProgram;
  connection: anchor.web3.Connection;
  aeon: AeonClient;
  admin: anchor.Wallet;
  mint: PublicKey;
  tokenProgram: PublicKey;
  /** Set when mint was created with freeze authority (admin). */
  freezeAuthority: PublicKey | null;
  agentA: Keypair;
  agentB: Keypair;
  agentC: Keypair;
  ataA: PublicKey;
  ataB: PublicKey;
  ataC: PublicKey;
}

export function cat(label: string): number[] {
  return categoryFromLabel(label);
}

export function zeroCat(): number[] {
  return new Array(16).fill(0);
}

export async function expectAeonError(
  p: Promise<unknown>,
  code: string
): Promise<void> {
  let threw = false;
  let detail = "";
  try {
    await p;
  } catch (e: any) {
    threw = true;
    const logs: string[] = e.logs ?? e.error?.logs ?? [];
    detail = [e.toString(), e.message, ...logs].filter(Boolean).join("\n");
    const hit =
      detail.includes(`Error Code: ${code}`) ||
      detail.includes(`"${code}"`) ||
      e.error?.errorCode?.code === code ||
      e.error?.errorCode?.name === code;
    if (!hit) {
      throw new Error(
        `expected AeonError.${code}, got:\n${detail.slice(0, 800)}`
      );
    }
    return;
  }
  if (!threw) {
    expect.fail(`expected AeonError.${code} but transaction succeeded`);
  }
}

/** Expect any failure (CPI / token program / Anchor). */
export async function expectTxFail(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e: any) {
    const logs: string[] = e.logs ?? e.error?.logs ?? [];
    return [e.toString(), e.message, ...logs].filter(Boolean).join("\n");
  }
  expect.fail("expected transaction to fail");
  return "";
}

export async function tokenBal(
  connection: anchor.web3.Connection,
  ata: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
): Promise<bigint> {
  return (await getAccount(connection, ata, undefined, tokenProgram)).amount;
}

export async function airdrop(
  connection: anchor.web3.Connection,
  pk: PublicKey,
  sol = 2
) {
  const sig = await connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

export async function waitPastSlot(
  connection: anchor.web3.Connection,
  targetSlot: number,
  timeoutMs = 45_000
): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const slot = await connection.getSlot("confirmed");
    if (slot > targetSlot) return slot;
    await new Promise((r) => setTimeout(r, 250));
  }
  const slot = await connection.getSlot("confirmed");
  throw new Error(
    `timeout waiting for slot > ${targetSlot} (now ${slot}, waited ${timeoutMs}ms)`
  );
}

export interface BootstrapOpts {
  token2022?: boolean;
  force?: boolean;
  /** When true, mint freeze authority = admin (for CPI-fail freeze tests). */
  withFreeze?: boolean;
}

let _fixture: Fixture | null = null;

export async function bootstrapFixture(
  opts: BootstrapOpts = {}
): Promise<Fixture> {
  if (_fixture && !opts.force) return _fixture;

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Aeon as AeonProgram;
  const connection = provider.connection;
  const admin = provider.wallet as anchor.Wallet;

  const tokenProgram = opts.token2022
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;

  const aeon = AeonClient.fromWorkspace(program, provider, tokenProgram);

  const agentA = admin.payer;
  const agentB = Keypair.generate();
  const agentC = Keypair.generate();
  await airdrop(connection, agentB.publicKey);
  await airdrop(connection, agentC.publicKey);

  const freezeAuthority = opts.withFreeze ? admin.publicKey : null;
  const mint = await createMint(
    connection,
    admin.payer,
    admin.publicKey,
    freezeAuthority,
    DECIMALS,
    undefined,
    undefined,
    tokenProgram
  );
  await aeon.initializeConfig(mint);

  const ataA = await createAssociatedTokenAccountIdempotent(
    connection,
    admin.payer,
    mint,
    agentA.publicKey,
    undefined,
    tokenProgram
  );
  const ataB = await createAssociatedTokenAccountIdempotent(
    connection,
    admin.payer,
    mint,
    agentB.publicKey,
    undefined,
    tokenProgram
  );
  const ataC = await createAssociatedTokenAccountIdempotent(
    connection,
    admin.payer,
    mint,
    agentC.publicKey,
    undefined,
    tokenProgram
  );

  await mintTo(
    connection,
    admin.payer,
    mint,
    ataA,
    admin.publicKey,
    100_000 * ONE,
    [],
    undefined,
    tokenProgram
  );
  await mintTo(
    connection,
    admin.payer,
    mint,
    ataB,
    admin.publicKey,
    100 * ONE,
    [],
    undefined,
    tokenProgram
  );

  await aeon.registerAgent();
  await aeon.registerAgent(agentB.publicKey, { signers: [agentB] });
  await aeon.registerAgent(agentC.publicKey, { signers: [agentC] });

  _fixture = {
    provider,
    program,
    connection,
    aeon,
    admin,
    mint,
    tokenProgram,
    freezeAuthority,
    agentA,
    agentB,
    agentC,
    ataA,
    ataB,
    ataC,
  };
  return _fixture;
}

export async function getFixture(): Promise<Fixture> {
  return bootstrapFixture();
}

export async function freezeAta(
  fx: Fixture,
  ata: PublicKey
): Promise<void> {
  if (!fx.freezeAuthority) {
    throw new Error("fixture mint has no freeze authority — bootstrap with withFreeze: true");
  }
  await freezeAccount(
    fx.connection,
    fx.admin.payer,
    ata,
    fx.mint,
    fx.admin.payer,
    [],
    undefined,
    fx.tokenProgram
  );
}

export async function thawAta(fx: Fixture, ata: PublicKey): Promise<void> {
  if (!fx.freezeAuthority) {
    throw new Error("fixture mint has no freeze authority");
  }
  await thawAccount(
    fx.connection,
    fx.admin.payer,
    ata,
    fx.mint,
    fx.admin.payer,
    [],
    undefined,
    fx.tokenProgram
  );
}

export async function issueRoot(
  aeon: AeonClient,
  opts: {
    budget?: number;
    maxPerTx?: number;
    categories?: number[][];
    expirySlot?: number;
  } = {}
): Promise<number> {
  const { authorityId } = await aeon.issueAuthority({
    budget: opts.budget ?? 1_000 * ONE,
    maxPerTx: opts.maxPerTx ?? 100 * ONE,
    maxTotal: opts.budget ?? 1_000 * ONE,
    categories: opts.categories ?? [],
    expirySlot: opts.expirySlot ?? 0,
  });
  return authorityId;
}

export async function issueChild(
  aeon: AeonClient,
  parentId: number,
  opts: {
    budget?: number;
    maxPerTx?: number;
    categories?: number[][];
  } = {}
): Promise<number> {
  const { authorityId } = await aeon.issueAuthority({
    budget: opts.budget ?? 50 * ONE,
    maxPerTx: opts.maxPerTx ?? 50 * ONE,
    parentId,
    categories: opts.categories ?? [],
  });
  return authorityId;
}

export {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  BN,
  PublicKey,
  Keypair,
  ROLE,
  CONDITION,
  AUTH_STATUS,
  createAccount,
  createMint,
  mintTo,
  freezeAccount,
  thawAccount,
};
