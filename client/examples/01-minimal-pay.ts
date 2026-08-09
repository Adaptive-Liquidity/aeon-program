/**
 * Example 01 — Minimal pay under a root authority
 *
 * Prerequisites (not shown): config initialized, agents registered, ATAs funded.
 * Full localnet narrative: `npm run demo:economy`
 *
 * Usage sketch:
 *   import { runMinimalPay } from "./client/examples/01-minimal-pay";
 *   await runMinimalPay(aeon, { payee, payerToken, payeeToken });
 */

import type { PublicKey, TransactionSignature } from "@solana/web3.js";
import type { AeonClient } from "../aeon";
import { categoryFromLabel } from "../category";

export interface MinimalPayInput {
  payee: PublicKey;
  payerToken: PublicKey;
  payeeToken: PublicKey;
  /** Base units of config.aeonMint */
  budget?: number;
  maxPerTx?: number;
  amount?: number;
  categoryLabel?: string;
}

export interface MinimalPayResult {
  authorityId: number;
  issueSig: TransactionSignature;
  paySig: TransactionSignature;
}

/**
 * Issue a root authority and pay once under it.
 * Caller wallet must be a registered agent with enough token balance.
 */
export async function runMinimalPay(
  aeon: AeonClient,
  input: MinimalPayInput
): Promise<MinimalPayResult> {
  const category = categoryFromLabel(input.categoryLabel ?? "compute");
  const budget = input.budget ?? 1_000_000;
  const maxPerTx = input.maxPerTx ?? 100_000;
  const amount = input.amount ?? 1_000;

  const { authorityId, signature: issueSig } = await aeon.issueAuthority({
    budget,
    maxPerTx,
    categories: [category],
  });

  const paySig = await aeon.pay({
    amount,
    payee: input.payee,
    payerToken: input.payerToken,
    payeeToken: input.payeeToken,
    authorityId,
    category,
  });

  return { authorityId, issueSig, paySig };
}
