# Maurice — agent instructions

Shared governance for every coding agent on this repository (Claude Code, Codex,
Pi). This file is the **single source** of architecture rules. Do not copy these
rules into other instruction files; import or point to this one.

## What this project is

Maurice is a private household app for Android and Chrome desktop that presents a
Home Assistant home. Home Assistant owns devices, automations and history.
Maurice owns presentation, session, scoped control and local preferences.
The living contract is [`docs/superpowers/specs/2026-10-14-home-cockpit-design.md`](docs/superpowers/specs/2026-10-14-home-cockpit-design.md);
delivery status is [`docs/README.md`](docs/README.md); execution order is
[`docs/BACKLOG.md`](docs/BACKLOG.md).

## Architecture governance

Before any change that alters architecture, data contracts, persistence,
platform scope, or user-visible behaviour:

1. Read [`docs/architecture/decisions.md`](docs/architecture/decisions.md).
2. Review [`docs/architecture/open-questions.md`](docs/architecture/open-questions.md).
3. Search Flex for relevant history **when the register does not settle it**.
4. Verify every historical claim against the current code. A past agent's
   "implemented" is a lead, not proof.
5. Never silently override an accepted decision. Supersede it explicitly.
6. Surface contradictions before writing code — state both sides.
7. Ask the product owner before changing product scope or behaviour.
8. Record approved changes in `decisions.md`.
9. Mark obsolete decisions `SUPERSEDED` and link what replaced them.
10. Treat agent summaries and compaction output as secondary evidence.

## Evidence hierarchy

When sources disagree, report the discrepancy instead of silently choosing one.

| Rank | Source | Establishes |
| --- | --- | --- |
| 1 | Current code and passing tests | Implementation reality |
| 2 | Accepted ADRs (`docs/architecture/decisions.md`) | Architectural intent |
| 3 | Historical Flex sessions | Decision context and rationale |
| 4 | Agent summaries, compaction, chat recaps | Leads only — never authoritative |

Code beats intent. If the code contradicts an ADR, that is a finding to report,
not a licence to pick a side.

## Product principles and delivery maturity

Architectural decisions and product principles are **complementary**, not
substitutes. `docs/architecture/decisions.md` governs *how the system is built*.
The eight non-negotiable product principles govern *what is worth building and
when it counts as delivered*. Read
[`.opencode/skills/maurice-product/SKILL.md`](.opencode/skills/maurice-product/SKILL.md)
before proposing a feature, changing product behaviour, scoping work, or
declaring anything delivered. Do not re-derive those principles here; this file
does not restate them.

That skill is not discoverable by every agent, so it must be opened explicitly.
Two dimensions stay separate:

| Dimension | Scale | Answers |
| --- | --- | --- |
| **Evidence source** (above) | code > ADR > Flex > summaries | *How do we know it is true?* |
| **Delivery maturity** | Implemented → Automated → Built → Installed → Observed → Used | *How far has it actually got?* |

A passing test establishes implementation evidence, not product acceptance.
Claim only the maturity level reached, on the named revision and binary.

## Token efficiency

- Do not search Flex for trivial edits, formatting, copy changes or renames.
- Do not load the whole decision register; read the relevant ADR rows/sections.
- Retrieve only the historical context you need; prefer targeted semantic search.
- Do not re-litigate decisions already recorded — cite them instead.

## Read-only audit rule

An audit or review task modifies **no** application code, dependencies,
configuration or tests. Deliver findings as documentation. Never commit unless
explicitly asked.

## Known traps in this repository

- `profileIdFor()` is URL-bearing by design; the SecureStore **key** is a separate
  random `storageId`. Do not "simplify" them together (see OQ-05).
- Two sync counters coexist (`SessionManager.generation`, backend `epoch`, plus
  `transportGeneration`). Compare the correct one (see OQ-04).
- 3D renders on native; it is gated off only in `internal-trial` builds
  (`src/config/build.ts`). Do not describe 3D as web-only (see OQ-03).
  It renders the *personal* plan locally; only Git, fixtures, demo builds and
  published screenshots are forbidden surfaces (product principle 6).
- Five states were accepted for commands; the code has six (`superseded` added).
  The implementation is correct — do not remove `superseded`.
