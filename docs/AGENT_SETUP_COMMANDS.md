# AEON Agent Setup — Exact Commands (for Gemini/Benna to run on WSL2)

**Who runs this:** Gemini (or Benna) on the WSL2 host that already has the AEON toolchain.
**Why:** Ollama's shell is the Open WebUI container (no toolchain, no host access) — it cannot
run these. This doc is the hand-off so the setup is executed on the right machine.

**Status:** Approved 2026-08-21. Execute in order.

---

## Step 0 — Verify the host toolchain (do this first)

```bash
# Confirm the exact AEON pins are present on the WSL2 host
cargo --version
anchor --version          # expect 0.30.1
solana --version          # expect Agave/Solana 4.1.x
node --version            # expect 20.x
npm --version
cargo-build-sbf --version # or: which cargo-build-sbf

# Smoke: confirm the build + demo actually work on this host
cd ~/aeon-program
npm run build:sbf
npm run demo:economy
```

If any of these fail, fix the toolchain FIRST — Computer/Open Terminal just exposes whatever
is already on the host; it does not install anything.

---

## Step 1 — Install & run Open WebUI Computer (`cptr`) on the WSL2 host

```bash
# Option A: uvx (recommended)
uvx cptr@latest run

# Option B: pip
pip install cptr
cptr run
```

Then:
1. Open the `aeon-program` folder as the workspace in the Computer UI.
2. Enable the **git panel**, **terminals**, and **worktrees**.
3. Confirm the terminal starts in the workspace folder and `cargo`/`anchor`/`node` resolve.

**Caveat:** sessions end if `cptr` stops or the host sleeps. For long builds use `tmux`/`nohup`,
and set the host to stay awake ("keep it running").

---

## Step 2 — Connect Computer to Open WebUI (so it appears as a model/backend)

Follow the Computer → Open WebUI connection steps (Settings → Admin → Agents, or the gateway
integration). The goal: the coder agent can reach the WSL2 toolchain through Computer.

---

## Step 3 — Approval + plan mode (safety, before autonomous work)

- Set **approval mode = auto** (reads free, writes/commands gated) for everyday work.
- Use **plan mode** for any change touching the hard invariants (H1–H7).
- Human gate (Benna) as final sign-off on authority/spend/escrow/org/mint changes.

---

## Step 4 — Knowledge Bases + Skills (grounding)

### 4a. Knowledge Bases (Open WebUI → Workspace → Knowledge)
Create KBs for:
- `docs/SECURITY_MODEL.md` + `docs/stoa/CASE_CATALOG.md`
- `docs/OVERVIEW.md`, `docs/QUICKSTART.md`, `docs/CI.md`, `docs/DEVNET.md`
- `programs/aeon/src/state.rs`, `constants.rs`, `errors.rs`, `events.rs`
- `client/README.md` + `client/examples/`

Enable **hybrid search** + `ENABLE_KB_EXEC=True`. Attach to the coding model/preset.

Optional continuous sync:
```bash
oikb sync github:Adaptive-Liquidity/aeon-program --kb-id <KB_ID>
```

### 4b. Skills (create in `.cptr/skills/` or `.agents/skills/`)
- `aeon-invariants` — H1–H7 + soft ACCEPTED cases
- `anchor-fail-closed` — CPI order (validate → transfer_checked → commit)
- `pda-and-revoke-tree` — PDA construction + deepest-first cascade
- `sdk-frozen-api` — frozen client export surface
- `toolchain-commands` — exact `npm run …` + version pins
- `trident-and-negative` — how to run negative/HEAVY/fuzz suites

---

## Step 5 — Model preset (bundle everything)

Create a preset that binds: AEON Knowledge Bases + key skills + required tools + the honest
system prompt (see `TEAM/system_prompt_ollama.md`). One selector, everything wired.

---

## Step 6 — (Optional) Native coding-agent backend

If you want a frontier coding model (Claude Code/Codex/etc.), install + log in to its CLI on
the WSL2 host, then add a profile in Settings → Admin → Agents. Models appear as
`agent:<profile>/<model>`.

---

## Step 7 — (Optional) Git worktrees for independent tasks

Only for genuinely-independent tasks (not the serial `programs/`→IDL→`client/`→`tests/` chain):
```bash
git worktree add ../repo-<task> <branch>
```
One workspace per worktree, one agent per workspace.

---

## What NOT to do (reminder)

- Do NOT add `cargo`/`anchor`/`node` to the system prompt (they don't exist in the container).
- Do NOT build a 5-model swarm on the core program (serial chain → conflicts).
- Do NOT custom-image the main Open WebUI container.

---

## Verification checklist (after setup)

- [ ] `cargo`/`anchor`/`solana`/`node` resolve in the Computer terminal
- [ ] `npm run build:sbf` succeeds from the Computer terminal
- [ ] `npm run test:negative` runs from the Computer terminal
- [ ] Knowledge Bases attached + hybrid search on
- [ ] Skills discovered
- [ ] Approval mode = auto; plan mode for invariant paths
- [ ] Honest system prompt in place (no phantom binaries)
