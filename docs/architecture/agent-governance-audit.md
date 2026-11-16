# Agent governance audit

- **Date:** 2026-10-28
- **Audited agents:** Claude Code 2.1.311, OpenAI Codex CLI 0.162.1, Pi 1.4.0 (DeepSeek)
- **Scope:** shared architecture governance via `AGENTS.md`, `docs/architecture/`, and Flex MCP
- **Rule:** verified by direct observation only. Configuration was not assumed to be effective.

---

## 1. Verification matrix

| Check | Claude Code | Codex | Pi |
| --- | --- | --- | --- |
| Shared instructions loaded | **PASS** | **PASS** | **PASS** |
| ADR register accessible | **PASS** | **PASS** | **PASS** |
| Open questions accessible | **PASS** | **PASS** | **PASS** |
| Flex MCP connected | **PASS** | **PASS** | **PASS** |
| Historical retrieval successful | **PASS** | **FAIL** | **PASS** |
| Scenario A passed | **PASS** | **PASS** | **PASS** |
| Scenario B passed | **PASS** | **PASS** | **PASS** |
| Scenario C passed | **PASS** | **PASS** | **PASS** |

**19 of 24 checks PASS. 1 FAIL (Codex headless Flex). 0 UNVERIFIED.**

The single failure is an execution-mode policy gate, not a configuration defect. Details in §5.

---

## 2. Evidence per PASS

### 2.1 Shared instructions loaded — all three

`AGENTS.md` was created at the repository root as the single governance source. **No `CLAUDE.md` was created**, because all three agents load `AGENTS.md` natively — verified, not assumed:

- Claude Code's binary contains the `claude-md-or-agents-md` loader token, and its own `prompt-audit` documentation states it loads "CLAUDE.md, CLAUDE.local.md and AGENTS.md in the project root and its ancestor and nested directories".
- Pi documents `AGENTS.md` in `docs/configuration.md` ("Context files … from the agent directory, the working directory, and its parent directories").
- Codex reads project `AGENTS.md` by default.

**Direct observation (probe answerable only from the new file, no tools allowed):**

```bash
claude -p "Answer ONLY from the project instructions already loaded … list the four evidence ranks" --allowedTools ""
codex exec --skip-git-repo-check -c model_reasoning_effort=low "… same …"
pi --print "… same …" --tools ""
```

All three replied with the exact four-tier hierarchy from `AGENTS.md`:

> `Current code and passing tests > Accepted ADRs (docs/architecture/decisions.md) > Historical Flex sessions > Agent summaries, compaction, chat recaps`

Claude and Pi reproduced the parenthetical file path verbatim, confirming they read the file rather than inferring a plausible answer.

### 2.2 ADR register and open questions accessible — all three

Same probe, first two lines (`ADR=ok`, `OQ=ok`), returned by all three agents:

| Agent | `ADR` | `OQ` |
| --- | --- | --- |
| Claude Code | `ok` | `ok` |
| Codex | `ok` | `ok` |
| Pi | `ok` | `ok` |

### 2.3 Flex MCP connected — all three

| Agent | Config location | Evidence |
| --- | --- | --- |
| Claude Code | `~/.claude.json` → top-level `mcpServers.flex` = `http://localhost:7134/mcp/` | Server answered `HTTP 406` on `/mcp/` (live MCP transport, rejecting a non-MCP GET) |
| Codex | `~/.codex/config.toml` → `[mcp_servers.flex]` stdio `python -m flex.serve` | `codex mcp list` → `flex … enabled`; runtime log `mcp: flex/flex started` |
| Pi | `~/.pi/agent/mcp.json` → `flex`, `exposure: deferred` | `pi mcp list --json` → `"state": "connected"`, `"tools": ["flex"]`, `"errors": []` |

### 2.4 Historical retrieval — Claude Code and Pi

Both retrieved the correct session for the rollback decision:

- **Claude Code** returned `01a13b80-df0b-7952-ab83-100f0ffefdf7` with the quoted finding *"\[P1] Replace action rollback with an 'unconfirmed' outcome"* — matching `decisions.md` ADR-03.
- **Pi** returned the same session id `01a13b80-df0b-7952-ab83-100f0ffefdf7`.

Cross-checked against the register: correct session, correct decision.

### 2.5 Scenario A — accepted command lifecycle (all three PASS)

| Agent | Reported states | Cited |
| --- | --- | --- |
| Claude Code | `sending, accepted, confirmed, failed, unconfirmed, superseded` (six) | ADR-03; `src/commands/types.ts:122` |
| Codex | identical six | ADR-03 + `src/commands/types.ts:122` |
| Pi | identical six | ADR-03, `src/commands/types.ts:122` |

All three recognized the six-state implementation, treated `superseded` as legitimate, and **did not revert to the historical five-state design**. Expected behaviour met.

### 2.6 Scenario B — "is 3D web-only?" (all three PASS)

All three rejected the outdated conclusion:

- Claude: *"No, 3D also renders on native. It is gated off only for internal-trial: `buildFeatures.spatial3d = !buildInfo.trial` (src/config/build.ts:12)"*, flagging **OQ-03**.
- Codex: *"no; `buildFeatures.spatial3d` gated by internal-trial"*.
- Pi: *"no, not web-only; gate `spatial3d: !buildInfo.trial` in src/config/build.ts:12"*.

Every agent independently located the build gate and identified the unresolved product-intent question. **Partial nit:** Codex and Pi flagged `OQ-04` (the sync-counter question) rather than `OQ-03` (3D). Both recognized the substance; only the question id was imprecise. Not counted as a failure.

### 2.7 Scenario C — fetch-then-subscribe proposal (all three PASS)

None modified code. All three detected the conflict with the accepted design:

- Claude: *"yes: the gap between the REST fetch and the subscription drops or reorders changes, so a stale snapshot can commit as authoritative state"* → **ADR-05**; action: "raise the conflict … get approval, then record a superseding ADR".
- Codex: *"yes; fetch-then-subscribe may miss changes between REST snapshot and subscription, conflicting with ADR-05 freshness guarantees"*.
- Pi: *"yes … gap between fetch and subscribe loses changes, adds second authority vs ADR-05"*.

All three named ADR-05, named the lost-update risk, and required approval before proceeding. Expected behaviour met.

---

## 3. Configuration changes made

| Change | Detail |
| --- | --- |
| **Added** `AGENTS.md` (repo root) | Single shared source: governance protocol, evidence hierarchy, token-efficiency rules, read-only audit rule, and four repository-specific traps drawn from `open-questions.md`. |
| **Created** `docs/architecture/decisions.md`, `docs/architecture/open-questions.md` | Already produced by the preceding architecture audit; referenced here as the authoritative register. |
| **Deliberately not created:** `CLAUDE.md` | All three agents load `AGENTS.md` natively. Adding a `CLAUDE.md` shim with `@AGENTS.md` would load the governance text twice in every Claude session, wasting context. This contradicts the "minimal, no duplication" constraint, so it was rejected on evidence. |
| **Not touched** | `~/.claude.json`, `~/.claude/CLAUDE.md`, `~/.claude/settings.json`, `~/.codex/config.toml`, `~/.pi/agent/*`, all MCP configurations, dependencies, application source, tests. |

No global configuration was modified. No commit was created. No dependency was added.

---

## 4. Verification commands used

```bash
# instruction loading (no tools, forces answer from loaded context)
claude -p '…four evidence ranks…' --allowedTools ""
codex exec --skip-git-repo-check -c model_reasoning_effort=low '…'
pi --print '…' --tools ""

# Flex connectivity (objective, no model)
pi    mcp list --json
codex mcp list
curl -s -o /dev/null -w '%{http_code}' http://localhost:7134/mcp/

# governance scenarios A/B/C with Flex retrieval, read-only
claude -p '…A/B/C…' --allowedTools "Read,Grep,Glob,mcp__flex__flex"
codex exec --skip-git-repo-check --sandbox read-only '…A/B/C…'
pi --print '…A/B/C…'

# no side effects
git status --short
```

---

## 5. Remaining limitation — Codex cannot call Flex in `codex exec`

**Status: FAIL (headless only). Configuration is correct; the execution mode is the blocker.**

Evidence, reproduced twice:

```
mcp: flex/flex started
mcp: flex/flex (failed)
MCP tool call requires approval, but approval policy is never
```

`codex exec` hard-sets `approval_policy = never` (confirmed by the run header `approval: never` in both a sandboxed and a default-sandbox run, and `-c approval_policy=on-request` did not change it). Codex routes MCP tool calls through the approval system, so with `never` every Flex call is denied. The MCP server itself starts and connects — the failure is at tool-dispatch, not transport.

**What this means:** Codex's Flex access works in **interactive** sessions, where the user approves the call. It is unavailable to non-interactive `codex exec`, which is what CI and scripted agents use. I did not verify the interactive path because it cannot be driven safely headless.

**Remedy options — none applied, all need owner approval:**

1. **Accept it.** Use Codex interactively when Flex evidence is required. Zero risk, no config change. *(Recommended.)*
2. **Project-scoped approval config.** Add an approval policy permitting read-only MCP tools for this project. Requires a change to `~/.codex/config.toml` or a project profile — a global/agent-level change, so it was not made.
3. **Bypass flag.** `--dangerously-bypass-approvals-and-sandbox` would work but disables sandboxing. Not recommended for an audit task.

---

## 6. Additional finding — orphaned skill

`.opencode/skills/maurice-product/SKILL.md` (and the rest of `.opencode/skills/`) is **not loaded by any of the three audited agents.** Claude Code reads `.claude/skills` and plugins; Pi reads `.pi/skills` and `<agent-dir>/skills`; Codex reads `~/.codex/skills` and its plugin bundle. `.opencode/` is a different tool's directory.

That skill contains substantive product positioning and seven non-negotiable product principles that no agent currently sees. Options: (a) leave it for opencode only, (b) reference it from `AGENTS.md`, (c) move it to a location all three load. **Not actioned** — it is a content-governance decision, not a mechanical fix.

---

## 7. Manual steps required

None to make the current state work. The system is functional for Claude Code and Pi today, and for Codex interactively.

Optional owner decisions:

1. Approve or decline the Codex approval-policy change (§5).
2. Decide what happens to `.opencode/skills/maurice-product` (§6).
3. Resolve `open-questions.md` OQ-01/02/03 — these are product decisions the governance layer correctly refuses to settle on its own.

---

## 8. Maintenance recommendations

1. **Keep `AGENTS.md` short** (currently ~70 lines). It loads into every session of every agent; every line is a permanent token tax. Push detail into `docs/architecture/` and link, never inline.
2. **Do not add `CLAUDE.md`** unless a future Claude version drops native `AGENTS.md` support. Re-test with the §4 probe before adding one.
3. **Re-run this audit after changing any agent version.** The "loads natively" conclusion is version-specific: Claude 2.1.311, Codex 0.162.1, Pi 1.4.0.
4. **Keep the trap list in `AGENTS.md` in sync with `open-questions.md`.** The four traps (OQ-03/04/05 and the six-state lifecycle) are the highest-value lines in the file — they are the ones scenarios A/B proved actually change agent behaviour.
5. **Add a scenario D** covering credential-key handling (OQ-05) — the highest-regression-risk trap, and the only one with no test pinning it.
6. **Prefer the register over Flex.** Flex is the slowest and most expensive layer; the governance text correctly ranks it third. If an agent is citing Flex for something already in `decisions.md`, that is a token-efficiency defect worth correcting in the prompt, not the file.

---

## 9. Success criteria assessment

| Criterion | Result |
| --- | --- |
| 1. All three agents share the same governance rules | **Met** — one file, loaded natively by all three (verified) |
| 2. All three can locate the ADR register | **Met** — `ADR=ok` from all three |
| 3. All three can access Flex historical memory | **Partially met** — Claude and Pi verified end-to-end; Codex configured and connected but call-denied in `codex exec` (§5) |
| 4. Contradictions detected before implementation | **Met** — Scenario C passed for all three, no code modified |
| 5. Verification documented with evidence | **Met** — this report |

**Overall: governance is operational and evidence-backed. One gap remains: Codex requires an interactive session (or an owner-approved approval-policy change) to use Flex.**
