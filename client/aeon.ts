/**
 * AEON TypeScript Agent SDK — high-level client over the Anchor program.
 *
 * Covers all 16 instructions with PDA wiring, next-id helpers, and typed params.
 */

import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionSignature,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  AEON_PROGRAM_ID,
  CONDITION,
} from "./constants";
import { zeroCategory } from "./category";
import { pdas } from "./pdas";
import type {
  ConfigAccount,
  AgentIdentityAccount,
  CriAccount,
  AuthorityAccount,
  EscrowAccount,
  OrganizationAccount,
  OrgMemberAccount,
  IssueAuthorityParams,
  PayParams,
  CreateEscrowParams,
  CreateOrgParams,
  OrgSplitParams,
  DissolveOrgParams,
  AtomicSplitParams,
  TxOpts,
} from "./types";
import {
  planRevokeTree,
  nodesFromAuthorities,
  filterByAgent,
  type AuthorityNode,
  type RevokeBatch,
} from "./revokeTree";

import idlJson from "./idl/aeon.json";

export type AeonIdl = Idl;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAccounts = any;

function toBn(v: number | BN | bigint | string | undefined, fallback = 0): BN {
  if (v === undefined) return new BN(fallback);
  if (BN.isBN(v)) return v as BN;
  return new BN(v.toString());
}

function toNumArr16(cat?: number[]): number[] {
  if (!cat) return zeroCategory();
  if (cat.length !== 16) {
    const out = zeroCategory();
    for (let i = 0; i < Math.min(16, cat.length); i++) out[i] = cat[i];
    return out;
  }
  return cat;
}

function toNumArr64(w?: number[]): number[] {
  const out = new Array(64).fill(0);
  if (!w) return out;
  for (let i = 0; i < Math.min(64, w.length); i++) out[i] = w[i];
  return out;
}

export interface AeonClientOptions {
  provider: AnchorProvider;
  programId?: PublicKey;
  idl?: Idl;
  /** Default token program (classic SPL). Override for Token-2022. */
  tokenProgram?: PublicKey;
}

/**
 * High-level AEON agent client.
 */
export class AeonClient {
  readonly program: Program;
  readonly provider: AnchorProvider;
  readonly programId: PublicKey;
  readonly tokenProgram: PublicKey;

  constructor(opts: AeonClientOptions) {
    this.provider = opts.provider;
    this.programId = opts.programId ?? AEON_PROGRAM_ID;
    this.tokenProgram = opts.tokenProgram ?? TOKEN_PROGRAM_ID;
    const idl = (opts.idl ?? (idlJson as unknown as Idl)) as Idl;
    const idlWithAddr = {
      ...idl,
      address: this.programId.toBase58(),
    };
    this.program = new Program(idlWithAddr as Idl, this.provider);
  }

  static fromProvider(
    provider: AnchorProvider,
    programId?: PublicKey,
    tokenProgram?: PublicKey
  ): AeonClient {
    return new AeonClient({ provider, programId, tokenProgram });
  }

  static fromWorkspace(
    program: Program,
    provider?: AnchorProvider,
    tokenProgram?: PublicKey
  ): AeonClient {
    const p = provider ?? (program.provider as AnchorProvider);
    return new AeonClient({
      provider: p,
      programId: program.programId,
      idl: program.idl,
      tokenProgram,
    });
  }

  get methods() {
    return this.program.methods;
  }

  get accounts(): AnyAccounts {
    return this.program.account as AnyAccounts;
  }

  get walletPubkey(): PublicKey {
    return this.provider.wallet.publicKey;
  }

  // ─── PDAs (address-only) ───────────────────────────────────────────────────

  configAddress(): PublicKey {
    return pdas.config(this.programId);
  }
  agentAddress(agent: PublicKey = this.walletPubkey): PublicKey {
    return pdas.agent(agent, this.programId);
  }
  criAddress(agent: PublicKey = this.walletPubkey): PublicKey {
    return pdas.cri(agent, this.programId);
  }
  authorityAddress(id: number | BN): PublicKey {
    return pdas.authority(id, this.programId);
  }
  escrowAddress(id: number | BN): PublicKey {
    return pdas.escrow(id, this.programId);
  }
  escrowVaultAddress(id: number | BN): PublicKey {
    return pdas.escrowVault(id, this.programId);
  }
  orgAddress(id: number | BN): PublicKey {
    return pdas.org(id, this.programId);
  }
  orgTreasuryAddress(id: number | BN): PublicKey {
    return pdas.orgTreasury(id, this.programId);
  }
  orgMemberAddress(orgId: number | BN, agent: PublicKey): PublicKey {
    return pdas.orgMember(orgId, agent, this.programId);
  }

  // ─── Fetches ───────────────────────────────────────────────────────────────

  async fetchConfig(): Promise<ConfigAccount> {
    return this.accounts.config.fetch(this.configAddress());
  }

  async fetchAgent(
    agent: PublicKey = this.walletPubkey
  ): Promise<AgentIdentityAccount> {
    return this.accounts.agentIdentity.fetch(this.agentAddress(agent));
  }

  async fetchCri(agent: PublicKey = this.walletPubkey): Promise<CriAccount> {
    return this.accounts.cri.fetch(this.criAddress(agent));
  }

  async fetchAuthority(id: number | BN): Promise<AuthorityAccount> {
    return this.accounts.authority.fetch(this.authorityAddress(id));
  }

  async fetchEscrow(id: number | BN): Promise<EscrowAccount> {
    return this.accounts.escrow.fetch(this.escrowAddress(id));
  }

  async fetchOrg(id: number | BN): Promise<OrganizationAccount> {
    return this.accounts.organization.fetch(this.orgAddress(id));
  }

  async fetchOrgMember(
    orgId: number | BN,
    agent: PublicKey
  ): Promise<OrgMemberAccount> {
    return this.accounts.orgMember.fetch(this.orgMemberAddress(orgId, agent));
  }

  async nextIds(): Promise<{
    authorityId: number;
    escrowId: number;
    orgId: number;
  }> {
    const cfg = await this.fetchConfig();
    return {
      authorityId: cfg.authorityCounter.toNumber() + 1,
      escrowId: cfg.escrowCounter.toNumber() + 1,
      orgId: cfg.orgCounter.toNumber() + 1,
    };
  }

  async mintAddress(): Promise<PublicKey> {
    const cfg = await this.fetchConfig();
    return cfg.aeonMint;
  }

  // ─── Instructions ──────────────────────────────────────────────────────────

  async initializeConfig(
    aeonMint: PublicKey,
    opts: TxOpts = {}
  ): Promise<TransactionSignature> {
    return this.methods
      .initializeConfig(aeonMint)
      .accounts({
        admin: this.walletPubkey,
        config: this.configAddress(),
        systemProgram: SystemProgram.programId,
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });
  }

  async registerAgent(
    agent?: PublicKey,
    opts: TxOpts = {}
  ): Promise<TransactionSignature> {
    const agentKey = agent ?? this.walletPubkey;
    return this.methods
      .registerAgent()
      .accounts({
        agent: agentKey,
        config: this.configAddress(),
        agentIdentity: this.agentAddress(agentKey),
        cri: this.criAddress(agentKey),
        systemProgram: SystemProgram.programId,
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });
  }

  async issueAuthority(
    params: IssueAuthorityParams,
    opts: TxOpts = {}
  ): Promise<{ authorityId: number; signature: TransactionSignature }> {
    const parentId = toBn(params.parentId, 0);
    let authorityId = params.authorityId;
    if (authorityId === undefined) {
      const next = await this.nextIds();
      authorityId = next.authorityId;
    }
    const id = toBn(authorityId);
    const budget = toBn(params.budget);
    const maxPerTx = toBn(params.maxPerTx);
    const maxTotal = toBn(params.maxTotal, budget.toNumber());
    const categories = params.categories ?? [];
    const expirySlot = toBn(params.expirySlot, 0);

    const parentAuthority =
      parentId.toNumber() === 0 ? null : this.authorityAddress(parentId);

    const sig = await this.methods
      .issueAuthority(
        id,
        budget,
        maxPerTx,
        maxTotal,
        categories,
        parentId,
        expirySlot
      )
      .accounts({
        agent: this.walletPubkey,
        config: this.configAddress(),
        agentIdentity: this.agentAddress(),
        parentAuthority,
        authority: this.authorityAddress(id),
        systemProgram: SystemProgram.programId,
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });

    return { authorityId: id.toNumber(), signature: sig };
  }

  async revokeAuthority(
    authorityId: number | BN,
    cascadeChildren: PublicKey[] = [],
    opts: TxOpts = {}
  ): Promise<TransactionSignature> {
    return this.methods
      .revokeAuthority(toBn(authorityId))
      .accounts({
        agent: this.walletPubkey,
        config: this.configAddress(),
        authority: this.authorityAddress(authorityId),
      })
      .remainingAccounts(
        cascadeChildren.map((pubkey) => ({
          pubkey,
          isWritable: true,
          isSigner: false,
        }))
      )
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });
  }

  async pay(
    params: PayParams,
    opts: TxOpts = {}
  ): Promise<TransactionSignature> {
    const authorityId = toBn(params.authorityId, 0);
    const tokenProgram = params.tokenProgram ?? this.tokenProgram;
    const authority =
      authorityId.toNumber() === 0 ? null : this.authorityAddress(authorityId);

    return this.methods
      .pay(toBn(params.amount), authorityId, toNumArr16(params.category))
      .accounts({
        payer: this.walletPubkey,
        payee: params.payee,
        config: this.configAddress(),
        authority,
        payerCri: this.criAddress(this.walletPubkey),
        payeeCri: this.criAddress(params.payee),
        payerToken: params.payerToken,
        payeeToken: params.payeeToken,
        aeonMint: params.aeonMint ?? (await this.mintAddress()),
        tokenProgram,
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });
  }

  async createEscrow(
    params: CreateEscrowParams,
    opts: TxOpts = {}
  ): Promise<{ escrowId: number; signature: TransactionSignature }> {
    let escrowId = params.escrowId;
    if (escrowId === undefined) {
      escrowId = (await this.nextIds()).escrowId;
    }
    const id = toBn(escrowId);
    const authorityId = toBn(params.authorityId, 0);
    const tokenProgram = params.tokenProgram ?? this.tokenProgram;
    const authority =
      authorityId.toNumber() === 0 ? null : this.authorityAddress(authorityId);

    const sig = await this.methods
      .createEscrow(
        id,
        toBn(params.amount),
        authorityId,
        toNumArr16(params.category),
        params.conditionType ?? CONDITION.IMMEDIATE,
        toNumArr64(params.conditionData),
        toBn(params.expirySlot, 0)
      )
      .accounts({
        payer: this.walletPubkey,
        payee: params.payee,
        config: this.configAddress(),
        authority,
        escrow: this.escrowAddress(id),
        escrowVault: this.escrowVaultAddress(id),
        payerToken: params.payerToken,
        aeonMint: params.aeonMint ?? (await this.mintAddress()),
        tokenProgram,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });

    return { escrowId: id.toNumber(), signature: sig };
  }

  async releaseEscrow(
    escrowId: number | BN,
    payeeToken: PublicKey,
    witness?: number[],
    opts: TxOpts & { tokenProgram?: PublicKey } = {}
  ): Promise<TransactionSignature> {
    const esc = await this.fetchEscrow(escrowId);
    const mint = await this.mintAddress();
    const tokenProgram = opts.tokenProgram ?? this.tokenProgram;
    return this.methods
      .releaseEscrow(toBn(escrowId), toNumArr64(witness))
      .accounts({
        releaser: this.walletPubkey,
        escrow: this.escrowAddress(escrowId),
        escrowVault: this.escrowVaultAddress(escrowId),
        payeeToken,
        payerCri: this.criAddress(esc.payer),
        payeeCri: this.criAddress(esc.payee),
        aeonMint: mint,
        tokenProgram,
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });
  }

  async cancelEscrow(
    escrowId: number | BN,
    payerToken: PublicKey,
    opts: TxOpts & { tokenProgram?: PublicKey } = {}
  ): Promise<TransactionSignature> {
    const esc = await this.fetchEscrow(escrowId);
    const mint = await this.mintAddress();
    const tokenProgram = opts.tokenProgram ?? this.tokenProgram;
    return this.methods
      .cancelEscrow(toBn(escrowId))
      .accounts({
        canceller: this.walletPubkey,
        escrow: this.escrowAddress(escrowId),
        escrowVault: this.escrowVaultAddress(escrowId),
        payerToken,
        payerCri: this.criAddress(esc.payer),
        aeonMint: mint,
        tokenProgram,
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });
  }

  async atomicSplit(
    params: AtomicSplitParams,
    opts: TxOpts = {}
  ): Promise<TransactionSignature> {
    if (params.payees.length < 1 || params.payees.length > 2) {
      throw new Error("atomicSplit supports 1–2 payees");
    }
    const authorityId = toBn(params.authorityId, 0);
    const tokenProgram = params.tokenProgram ?? this.tokenProgram;
    const authority =
      authorityId.toNumber() === 0 ? null : this.authorityAddress(authorityId);
    const a = params.payees[0];
    const b = params.payees[1];
    return this.methods
      .atomicSplit(
        authorityId,
        [toBn(a.amount), ...(b ? [toBn(b.amount)] : [])],
        toNumArr16(params.category)
      )
      .accounts({
        payer: this.walletPubkey,
        payeeA: a.payee,
        payeeB: b?.payee ?? null,
        config: this.configAddress(),
        authority,
        payerCri: this.criAddress(this.walletPubkey),
        payeeACri: this.criAddress(a.payee),
        payeeBCri: b ? this.criAddress(b.payee) : null,
        payerToken: params.payerToken,
        payeeAToken: a.token,
        payeeBToken: b?.token ?? null,
        aeonMint: params.aeonMint ?? (await this.mintAddress()),
        tokenProgram,
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });
  }

  async createOrg(
    params: CreateOrgParams,
    opts: TxOpts = {}
  ): Promise<{ orgId: number; signature: TransactionSignature }> {
    let orgId = params.orgId;
    if (orgId === undefined) {
      orgId = (await this.nextIds()).orgId;
    }
    const id = toBn(orgId);
    const tokenProgram = params.tokenProgram ?? this.tokenProgram;
    const sig = await this.methods
      .createOrg(id, params.nameHash, params.creatorShareBps ?? 0)
      .accounts({
        creator: this.walletPubkey,
        config: this.configAddress(),
        creatorIdentity: this.agentAddress(),
        organization: this.orgAddress(id),
        creatorMember: this.orgMemberAddress(id, this.walletPubkey),
        orgTreasury: this.orgTreasuryAddress(id),
        aeonMint: params.aeonMint ?? (await this.mintAddress()),
        tokenProgram,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });
    return { orgId: id.toNumber(), signature: sig };
  }

  async joinOrg(
    orgId: number | BN,
    newAgent: PublicKey,
    role: number,
    shareBps: number,
    opts: TxOpts = {}
  ): Promise<TransactionSignature> {
    return this.methods
      .joinOrg(toBn(orgId), role, shareBps)
      .accounts({
        admin: this.walletPubkey,
        newAgent,
        organization: this.orgAddress(orgId),
        adminMember: this.orgMemberAddress(orgId, this.walletPubkey),
        agentIdentity: this.agentAddress(newAgent),
        newMember: this.orgMemberAddress(orgId, newAgent),
        systemProgram: SystemProgram.programId,
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });
  }

  async setMemberShare(
    orgId: number | BN,
    target: PublicKey,
    newShareBps: number,
    opts: TxOpts = {}
  ): Promise<TransactionSignature> {
    return this.methods
      .setMemberShare(toBn(orgId), newShareBps)
      .accounts({
        admin: this.walletPubkey,
        organization: this.orgAddress(orgId),
        adminMember: this.orgMemberAddress(orgId, this.walletPubkey),
        targetMember: this.orgMemberAddress(orgId, target),
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });
  }

  async depositToOrg(
    orgId: number | BN,
    amount: number | BN,
    memberToken: PublicKey,
    opts: TxOpts & { tokenProgram?: PublicKey } = {}
  ): Promise<TransactionSignature> {
    const tokenProgram = opts.tokenProgram ?? this.tokenProgram;
    return this.methods
      .depositToOrg(toBn(orgId), toBn(amount))
      .accounts({
        member: this.walletPubkey,
        organization: this.orgAddress(orgId),
        orgMember: this.orgMemberAddress(orgId, this.walletPubkey),
        orgTreasury: this.orgTreasuryAddress(orgId),
        memberToken,
        aeonMint: await this.mintAddress(),
        tokenProgram,
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });
  }

  async orgSplit(
    params: OrgSplitParams,
    opts: TxOpts = {}
  ): Promise<TransactionSignature> {
    const tokenProgram = params.tokenProgram ?? this.tokenProgram;
    return this.methods
      .orgSplit(toBn(params.orgId), [toBn(params.amount)])
      .accounts({
        admin: this.walletPubkey,
        organization: this.orgAddress(params.orgId),
        adminMember: this.orgMemberAddress(params.orgId, this.walletPubkey),
        recipientMember: this.orgMemberAddress(
          params.orgId,
          params.recipient
        ),
        recipientToken: params.recipientToken,
        orgTreasury: this.orgTreasuryAddress(params.orgId),
        aeonMint: params.aeonMint ?? (await this.mintAddress()),
        tokenProgram,
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });
  }

  async dissolveOrg(
    params: DissolveOrgParams,
    opts: TxOpts = {}
  ): Promise<TransactionSignature> {
    const tokenProgram = params.tokenProgram ?? this.tokenProgram;
    // memberB is agent pubkey → resolve OrgMember PDA
    const memberBAccount = params.memberB
      ? this.orgMemberAddress(params.orgId, params.memberB)
      : null;
    return this.methods
      .dissolveOrg(toBn(params.orgId))
      .accounts({
        admin: this.walletPubkey,
        organization: this.orgAddress(params.orgId),
        adminMember: this.orgMemberAddress(params.orgId, this.walletPubkey),
        adminToken: params.adminToken,
        memberB: memberBAccount,
        memberBToken: params.memberBToken ?? null,
        orgTreasury: this.orgTreasuryAddress(params.orgId),
        aeonMint: params.aeonMint ?? (await this.mintAddress()),
        tokenProgram,
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });
  }

  async reclaimOrgResidual(
    orgId: number | BN,
    destination: PublicKey,
    opts: TxOpts & { tokenProgram?: PublicKey } = {}
  ): Promise<TransactionSignature> {
    const tokenProgram = opts.tokenProgram ?? this.tokenProgram;
    return this.methods
      .reclaimOrgResidual(toBn(orgId))
      .accounts({
        authority: this.walletPubkey,
        organization: this.orgAddress(orgId),
        authorityMember: this.orgMemberAddress(orgId, this.walletPubkey),
        orgTreasury: this.orgTreasuryAddress(orgId),
        destination,
        aeonMint: await this.mintAddress(),
        tokenProgram,
      })
      .signers(opts.signers ?? [])
      .rpc({ skipPreflight: opts.skipPreflight });
  }

  async scanAuthorities(
    maxId: number,
    agent?: PublicKey
  ): Promise<AuthorityAccount[]> {
    const out: AuthorityAccount[] = [];
    for (let i = 1; i <= maxId; i++) {
      try {
        const a = await this.fetchAuthority(i);
        if (!agent || a.agent.equals(agent)) out.push(a);
      } catch {
        /* missing */
      }
    }
    return out;
  }

  async revokeTree(
    rootId: number,
    nodes: AuthorityNode[],
    opts: TxOpts = {}
  ): Promise<TransactionSignature[]> {
    const plan = planRevokeTree(nodes, rootId);
    const sigs: TransactionSignature[] = [];
    for (const batch of plan) {
      const children = batch.children.map((id) => this.authorityAddress(id));
      sigs.push(await this.revokeAuthority(batch.authorityId, children, opts));
    }
    return sigs;
  }
}

export { planRevokeTree, nodesFromAuthorities, filterByAgent };
export type { AuthorityNode, RevokeBatch };
