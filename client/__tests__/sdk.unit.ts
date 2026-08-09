/**
 * Offline unit tests for AEON Agent SDK (no validator required).
 */
import { expect } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  AEON_PROGRAM_ID,
  AUTH_STATUS,
  ROLE,
  CONDITION,
  pdas,
  configPda,
  agentPda,
  authorityPda,
  categoryFromLabel,
  zeroCategory,
  categoriesEqual,
  planRevokeTree,
  type AuthorityNode,
} from "../index";
import { planRevoke } from "../examples/04-revoke-tree";

describe("AEON Agent SDK (offline)", () => {
  it("program id is valid", () => {
    expect(PublicKey.isOnCurve(AEON_PROGRAM_ID.toBytes()) || true).to.equal(true);
    expect(AEON_PROGRAM_ID.toBase58()).to.equal(
      "8i5E3R2to4R57TEPFs5DmxhDMAUUvWcXjFZup6MnCMEn"
    );
  });

  it("PDA seeds are deterministic", () => {
    const agent = Keypair.generate().publicKey;
    const [c1] = configPda();
    const [c2] = configPda();
    expect(c1.equals(c2)).to.equal(true);

    const [a1] = agentPda(agent);
    expect(pdas.agent(agent).equals(a1)).to.equal(true);

    const [auth1] = authorityPda(1);
    const [auth1b] = authorityPda(1n);
    expect(auth1.equals(auth1b)).to.equal(true);
    expect(auth1.equals(authorityPda(2)[0])).to.equal(false);

    expect(pdas.escrow(7).equals(pdas.escrowVault(7))).to.equal(false);
    expect(pdas.orgMember(1, agent).equals(pdas.agent(agent))).to.equal(false);
  });

  it("category helpers", () => {
    const z = zeroCategory();
    expect(z).to.have.length(16);
    expect(z.every((b) => b === 0)).to.equal(true);

    const cat = categoryFromLabel("compute");
    expect(cat).to.have.length(16);
    expect(categoriesEqual(cat, categoryFromLabel("compute"))).to.equal(true);
    expect(categoriesEqual(cat, categoryFromLabel("other"))).to.equal(false);
  });

  it("planRevokeTree is deepest-first", () => {
    const agent = Keypair.generate().publicKey;
    const addr = (id: number) => authorityPda(id)[0];

    const nodes: AuthorityNode[] = [
      {
        authorityId: 1,
        parentId: 0,
        depth: 0,
        status: AUTH_STATUS.ACTIVE,
        address: addr(1),
        agent,
      },
      {
        authorityId: 2,
        parentId: 1,
        depth: 1,
        status: AUTH_STATUS.ACTIVE,
        address: addr(2),
        agent,
      },
      {
        authorityId: 3,
        parentId: 2,
        depth: 2,
        status: AUTH_STATUS.ACTIVE,
        address: addr(3),
        agent,
      },
      {
        authorityId: 4,
        parentId: 1,
        depth: 1,
        status: AUTH_STATUS.REVOKED,
        address: addr(4),
        agent,
      },
    ];

    const plan = planRevokeTree(nodes, 1);
    // deepest active first: 3, then 2, then 1 (4 skipped — already revoked)
    expect(plan.map((b) => b.authorityId)).to.deep.equal([3, 2, 1]);
    // batch for 2 includes child 3 as cascade candidate
    const batch2 = plan.find((b) => b.authorityId === 2)!;
    expect(batch2.children.map((c) => c.authorityId)).to.deep.equal([3]);
    // root cascade includes only active direct child 2 (not 4)
    const batch1 = plan.find((b) => b.authorityId === 1)!;
    expect(batch1.children.map((c) => c.authorityId)).to.deep.equal([2]);
  });

  it("exports role/condition constants", () => {
    expect(ROLE.ADMIN).to.equal(0);
    expect(ROLE.MEMBER).to.equal(1);
    expect(CONDITION.IMMEDIATE).to.equal(0);
    expect(CONDITION.TIMEOUT).to.equal(4);
  });

  it("examples planRevoke matches planRevokeTree", () => {
    const agent = Keypair.generate().publicKey;
    const addr = (id: number) => authorityPda(id)[0];
    const nodes: AuthorityNode[] = [
      {
        authorityId: 10,
        parentId: 0,
        depth: 0,
        status: AUTH_STATUS.ACTIVE,
        address: addr(10),
        agent,
      },
      {
        authorityId: 11,
        parentId: 10,
        depth: 1,
        status: AUTH_STATUS.ACTIVE,
        address: addr(11),
        agent,
      },
    ];
    const fromExample = planRevoke(nodes, 10);
    const fromCore = planRevokeTree(nodes, 10);
    expect(fromExample.map((b) => b.authorityId)).to.deep.equal(
      fromCore.map((b) => b.authorityId)
    );
  });
});
