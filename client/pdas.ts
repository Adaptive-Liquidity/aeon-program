/**
 * PDA derivation helpers for all AEON accounts.
 */

import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { AEON_PROGRAM_ID, SEEDS } from "./constants";

export type IdLike = number | bigint | BN | string;

function u64Le(id: IdLike): Buffer {
  const buf = Buffer.alloc(8);
  const n =
    typeof id === "bigint"
      ? id
      : BigInt(id instanceof BN ? id.toString(10) : String(id));
  buf.writeBigUInt64LE(n);
  return buf;
}

export function configPda(
  programId: PublicKey = AEON_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.CONFIG)],
    programId
  );
}

export function agentPda(
  agent: PublicKey,
  programId: PublicKey = AEON_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.AGENT), agent.toBuffer()],
    programId
  );
}

export function criPda(
  agent: PublicKey,
  programId: PublicKey = AEON_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.CRI), agent.toBuffer()],
    programId
  );
}

export function authorityPda(
  authorityId: IdLike,
  programId: PublicKey = AEON_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.AUTHORITY), u64Le(authorityId)],
    programId
  );
}

export function escrowPda(
  escrowId: IdLike,
  programId: PublicKey = AEON_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.ESCROW), u64Le(escrowId)],
    programId
  );
}

export function escrowVaultPda(
  escrowId: IdLike,
  programId: PublicKey = AEON_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.ESCROW_VAULT), u64Le(escrowId)],
    programId
  );
}

export function orgPda(
  orgId: IdLike,
  programId: PublicKey = AEON_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.ORG), u64Le(orgId)],
    programId
  );
}

export function orgTreasuryPda(
  orgId: IdLike,
  programId: PublicKey = AEON_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.ORG_TREASURY), u64Le(orgId)],
    programId
  );
}

export function orgMemberPda(
  orgId: IdLike,
  agent: PublicKey,
  programId: PublicKey = AEON_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.ORG_MEMBER), u64Le(orgId), agent.toBuffer()],
    programId
  );
}

export function receiptPda(
  receiptId: IdLike,
  programId: PublicKey = AEON_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.RECEIPT), u64Le(receiptId)],
    programId
  );
}

/** Convenience: address-only (drop bump). */
export const pdas = {
  config: (programId?: PublicKey) => configPda(programId)[0],
  agent: (agent: PublicKey, programId?: PublicKey) =>
    agentPda(agent, programId)[0],
  cri: (agent: PublicKey, programId?: PublicKey) => criPda(agent, programId)[0],
  authority: (id: IdLike, programId?: PublicKey) =>
    authorityPda(id, programId)[0],
  escrow: (id: IdLike, programId?: PublicKey) => escrowPda(id, programId)[0],
  escrowVault: (id: IdLike, programId?: PublicKey) =>
    escrowVaultPda(id, programId)[0],
  org: (id: IdLike, programId?: PublicKey) => orgPda(id, programId)[0],
  orgTreasury: (id: IdLike, programId?: PublicKey) =>
    orgTreasuryPda(id, programId)[0],
  orgMember: (orgId: IdLike, agent: PublicKey, programId?: PublicKey) =>
    orgMemberPda(orgId, agent, programId)[0],
  receipt: (id: IdLike, programId?: PublicKey) => receiptPda(id, programId)[0],
};
