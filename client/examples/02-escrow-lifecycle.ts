/**
 * Example 02 — Escrow create → release (and optional cancel path)
 *
 * Full localnet narrative: `npm run demo:economy` (Act 5)
 * Live devnet path: `npm run demo:devnet`
 */

import type { PublicKey, TransactionSignature } from "@solana/web3.js";
import type { AeonClient } from "../aeon";
import { CONDITION } from "../constants";
import { categoryFromLabel } from "../category";

export interface EscrowLifecycleInput {
  payee: PublicKey;
  payerToken: PublicKey;
  payeeToken: PublicKey;
  /** Authority that debits on create (fail-closed spent). */
  authorityId: number;
  amount?: number;
  categoryLabel?: string;
  /** If true, cancel instead of release (net-zero to payer). */
  cancelInstead?: boolean;
}

export interface EscrowLifecycleResult {
  escrowId: number;
  createSig: TransactionSignature;
  settleSig: TransactionSignature;
  mode: "release" | "cancel";
}

/**
 * Lock funds into escrow under an authority, then release to payee
 * (or cancel back to payer).
 */
export async function runEscrowLifecycle(
  aeon: AeonClient,
  input: EscrowLifecycleInput
): Promise<EscrowLifecycleResult> {
  const category = categoryFromLabel(input.categoryLabel ?? "compute");
  const amount = input.amount ?? 25_000;

  const { escrowId, signature: createSig } = await aeon.createEscrow({
    amount,
    payee: input.payee,
    payerToken: input.payerToken,
    authorityId: input.authorityId,
    category,
    conditionType: CONDITION.IMMEDIATE,
  });

  if (input.cancelInstead) {
    const settleSig = await aeon.cancelEscrow(escrowId, input.payerToken);
    return { escrowId, createSig, settleSig, mode: "cancel" };
  }

  const settleSig = await aeon.releaseEscrow(escrowId, input.payeeToken);
  return { escrowId, createSig, settleSig, mode: "release" };
}
