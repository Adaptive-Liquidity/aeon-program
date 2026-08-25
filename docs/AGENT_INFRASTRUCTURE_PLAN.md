# AEON Agent Infrastructure Plan

**Purpose:** Close the capability gap between the coder agent (Ollama) and the build/test
toolchain, using Open WebUI's *supported* mechanisms — not prompt fiction.

**Status:** Recommendation. Awaiting Benna's go-ahead to execute.
**Last updated:** 2026-08-21

---

## 0. The problem (one paragraph)

The coder agent (Ollama) runs inside the Open WebUI Docker container, which has **no
Rust/Solana/Node toolchain**. It can read/write files and run `ls`/`grep`/`git`/`python`,
but cannot `cargo build`, `anchor test`, or `npm run test:negative`. Those live in Gemini's
WSL2 environment. This forces a serial hand-off: Ollama writes blind → Gemini compiles/tests
→ bounce back for every mechanical error.

**The fix is NOT to claim `cargo`/`anchor`/`node` in the system prompt** (they don't exist in
the container — that produces "command not found" and wasted turns). The fix is to give the
coder agent a **real shell on a machine that already has the toolchain**, via Open WebUI's
supported components.

---

## 1. The recommended fixes (ranked by value-to-effort)

### 🥇 Fix 1 — Open WebUI Computer (`cptr`) on the WSL2 host

**What it is:** Open WebUI Computer runs on the *real machine* and gives the agent a real
filesystem, a persistent PTY terminal, real git, and everything already installed on that host.

**Why it's #1:** If Computer runs on the same WSL2 environment where Gemini already has the
verified AEON toolchain (Agave/Solana, Anchor 0.30.1, Node 20, `cargo-build-sbf`), the coder
agent immediately gains `cargo`, `anchor`, `solana`, `node`, `npm` — and can run the full
suite (`build:sbf`, `test:e2e`, `test:negative`, HEAVY, Trident fuzz) on the exact environment
CI already uses. **Zero custom image, zero prompt fiction, highest fidelity.**

**Setup:**
```bash
uvx cptr@latest run
# or: pip install cptr && cptr run
```
Open the `aeon-program` folder as the workspace. Enable git panel, terminals, worktrees.

**Key properties (from docs):**
- Real PTY shell on the host, starting in the workspace folder.
- Sessions persist across browser/device disconnects (survive until `cptr` stops or host sleeps).
- Real git worktrees, keypair/IDL assertions, everything.

**Caveat:** sessions end if `cptr` stops or the host sleeps. Use `tmux`/`nohup` for long builds,
and "keep it running" for host sleep.

**Doc:** `docs.openwebui.com/ecosystem/computer/` · `.../workspace/terminals`

---

### 🥈 Fix 2 — Open Terminal (action-layer sandbox) with a custom image

**What it is:** Open Terminal is the dedicated "computer substrate" that turns Open WebUI into
a full agent harness (files, shell, package manager, processes, artifacts, previews).

**Why it's #2:** Same capability as Computer, but **isolated** from the host. The `latest`
image already ships Node, git, compilers, Python, Docker CLI. For the full Rust+Solana+Anchor
stack, fork the open-terminal Dockerfile, install the exact AEON toolchain versions, build, and
point Open WebUI at that image.

**Runtime package install (env vars):**
- `OPEN_TERMINAL_PACKAGES` (apt)
- `OPEN_TERMINAL_PIP_PACKAGES`
- `OPEN_TERMINAL_NPM_PACKAGES`

**Modes:**
- **Bare-metal** — runs with host user permissions (real `cargo`/`anchor` if present).
- **Docker** — isolation; can mount the Docker socket (high privilege — trusted envs only).

**Doc:** `docs.openwebui.com/ecosystem/open-terminal`

---

### 🥉 Fix 3 — MCP / OpenAPI tool servers (proxy the toolchain)

**What it is:** Stand up a small server on the WSL2 side that exposes the Solana/Anchor
commands as *tools* (`cargo build-sbf`, `anchor test`, `npm run test:negative`). Connect it in
Open WebUI Admin → Tool Servers.

**Why it's #3:** The coder agent calls a *tool* instead of a raw shell command it can't
execute. No binary fiction, and the toolchain stays where it lives. Cleaner than a full
Computer/Open Terminal setup if you only need a handful of commands proxied.

**Doc:** `docs.openwebui.com/ecosystem/computer/automate/tool-servers`

---

### Fix 4 — Native coding-agent backends (the "frontier models", done right)

**What it is:** Connect Claude Code, Codex, Cursor, Grok, OpenCode, Cline, or Pi as native
chat backends using your existing subscriptions (no API key). They appear in the model
selector as `agent:<profile>/<model>`.

**Why it's #4:** This is the *correct* way to get high-quality coding models — not a
hand-rolled 5-model swarm. Install + log in to the agent's CLI on the host running Computer,
then add a profile in Settings → Admin → Agents.

**Doc:** `docs.openwebui.com/ecosystem/computer/ai/coding-agents`

---

### Fix 5 — Git worktrees (the only safe parallelism)

**What it is:** For genuinely-independent tasks, create one worktree per task, one workspace
per worktree, one agent per workspace.

**Why it's #5:** The docs are explicit that parallel agents on the *same* files produce
conflicts. Worktrees are the supported way to parallelize **independent** tasks without
trampling each other's diffs.

**Doc:** `docs.openwebui.com/ecosystem/computer/use-cases/parallel-agents-on-worktrees`

---

### Fix 6 — Approval mode (auto) + plan mode (the safety layer)

**What it is:** "auto" = reads free, writes/commands gated for human approval. Plan mode =
approve the plan before any action.

**Why it's #6:** For a security-critical Solana program, every change touching the hard
invariants (H1–H7) should go through plan mode + human approval. This is the supervision
model that lets an agent work while you review diffs and allow/deny per action.

**Doc:** `docs.openwebui.com/ecosystem/computer/use-cases/supervise-a-coding-agent`

---

## 2. Knowledge, memory & instruction layers (NEW — from the capability report)

These don't add binaries, but they make the agent *correct* and *grounded* — which is the
other half of "accurate/effective" beyond just having the toolchain.

### 2a. RAG / Knowledge Bases (ground the model in AEON truth)

Create Knowledge Bases for:
- `docs/SECURITY_MODEL.md` + `docs/stoa/CASE_CATALOG.md` (the living law)
- `docs/OVERVIEW.md`, `docs/QUICKSTART.md`, `docs/CI.md`, `docs/DEVNET.md`
- Key `programs/aeon/src/` paths (state.rs, constants.rs, errors.rs, events.rs)
- Frozen client API + examples (`client/README.md`, `client/examples/`)

Enable **hybrid search** (BM25 + vector + reranking) and `ENABLE_KB_EXEC=True` (gives the
model `ls`/`grep`/`cat`-style access over the knowledge). Attach the KBs to the coding
model/preset.

**Optional continuous sync:** `oikb sync github:Adaptive-Liquidity/aeon-program --kb-id ...`

### 2b. Skills (`SKILL.md`) — reusable playbooks

Create skills (auto-discovered from `.cptr/skills/`, `.agents/skills/`, `.claude/skills/`):
- `aeon-invariants` — H1–H7 + soft ACCEPTED cases
- `anchor-fail-closed` — CPI order (validate → transfer_checked → commit)
- `pda-and-revoke-tree` — PDA construction + deepest-first cascade
- `sdk-frozen-api` — the frozen client export surface
- `toolchain-commands` — exact `npm run …` commands + version pins
- `trident-and-negative` — how to run the negative/HEAVY/fuzz suites

### 2c. Memory + auto-loaded files

- **Memory** — durable per-user facts across chats (e.g. the team workflow, role split).
- **Auto-loaded files** — `MEMORY.md`, `AGENTS.md`, `CLAUDE.md` + a compact file tree injected
  every turn, so the agent always has the collaboration contract + repo shape.

### 2d. Model preset (bundle everything)

Create a preset that binds: the AEON Knowledge Bases + key skills + required tools + the
honest system prompt. One selector, everything wired.

### 2e. Context compaction + task model

- **Context compaction** — for long coding sessions that hit context limits.
- **Dedicated cheap task model** — for background/scheduled work (not the main coder).

---

## 3. What NOT to do

| Anti-pattern | Why |
|---|---|
| Add `cargo`/`anchor`/`node` to the system prompt | They don't exist in the container → "command not found" + wasted turns |
| 5-model swarm on the core program | Serial dependency chain (`programs/`→IDL→`client/`→`tests/`); parallel workers on shared files produce conflicts (docs say so explicitly) |
| Custom Open WebUI image for the Rust/Solana stack | The main container isn't designed for that payload; Computer/Open Terminal is cleaner |

---

## 4. Recommended execution order

1. **Host toolchain verify** — confirm the WSL2 host has the exact AEON pins (Agave/Solana
   4.1.x, Anchor 0.30.1, Node 20, `cargo-build-sbf`). Verify with `npm run build:sbf` +
   `npm run demo:economy`.
2. **Open WebUI Computer on the WSL2 host** (Fix 1) — the single highest-value move.
3. **Approval mode (auto) + plan mode** (Fix 6) — turn on before autonomous build/test.
4. **Knowledge Bases + Skills + auto-loaded files** (§2) — ground the model in AEON truth.
5. **Model preset** (§2d) — bundle KBs + skills + tools + honest prompt.
6. **Native coding-agent backend** (Fix 4) — add Claude Code/Codex if you want a frontier model.
7. **Git worktrees** (Fix 5) — only for genuinely-independent tasks.
8. **Open Terminal custom image** (Fix 2) or **MCP tool server** (Fix 3) — only if you need
   isolation or a lighter-weight proxy.

---

## 5. What stays the same

- **Honest system prompt** — only claim tools that actually exist in the agent's environment.
- **TEAM/ handoff protocol** — unchanged; it's the coordination layer regardless of toolchain.
- **Audit gate** (`docs/AUDIT_PASS.md`) — unchanged; the 7 hard invariants are living law.
- **CASE_CATALOG + SECURITY_MODEL** — unchanged; they're the source of truth for safety claims.

---

## 6. Decision record

See `TEAM/decisions.md` for the formal decision entry. Summary: adopt Open WebUI Computer
(on the WSL2 toolchain host) as the primary capability fix; add RAG/Skills/memory for
grounding; keep the honest system prompt; skip the multi-model swarm; use worktrees only for
independent tasks.
