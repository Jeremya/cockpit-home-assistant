---
name: Maurice development
description: Use when implementing a ticket in Maurice — writing code, adding a dependency, running checks, preparing a commit, or handing work to another agent. Covers environment, commands, conventions, ownership, native build rules, documentation and the definition of done for source work.
---

# Maurice — development playbook

## Environment

- **Node 24** and the committed `package-lock.json`. Do not upgrade versions as
  a side effect of a feature.
- Expo SDK 57 / React Native 0.86 / React 19 / TypeScript 6 (strict,
  `noUncheckedIndexedAccess`).
- Native Android uses JDK **17** (JDK 25 fails Prefab/CMake). The SDK/JDK paths
  live in the ignored `.env.local`; `.local/android/` holds the tools.
- `npm ci` runs `patch-package --error-on-fail` then `house:prepare`.
- Generated `android/`, `ios/`, `dist*`, `artifacts/`, `.local/` are ignored.
  Durable native changes belong in `app.config.js`, a local Expo module or a
  config plugin — never in generated folders.

## Commands you will actually use

| Command | Effect |
| --- | --- |
| `npm run web -- --host localhost --port 8082` | Expo web preview |
| `npm start` | Expo dev client (Android, Metro) |
| `npm run android` | Prebuild + install development client |
| `npm test` | Jest (`--runInBand`), prepares the plan first |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Expo ESLint flat config |
| `npm run format:check` | Prettier check (no local config; repo defaults) |
| `npm run test:tooling` | Node test runner for `scripts/__tests__/*.test.mjs` |
| `npm run check:ui` | Playwright public smoke, 320/430/768/1440 |
| `npm run check:spatial-ui` | Playwright spatial/3D checks (headless CI mode; `--headed --performance` locally) |
| `npm run check:detail-panel` | Desktop detail-panel route |
| `npm run check:web-auth` | Browser sign-in/renewal/logout |
| `npm run export:android` | Hermes JS bundle export (not an APK) |
| `npm run build:trial:android -- --build-number N` | Signed trial APK from the git revision |
| `npm run proof:protocol` | Loopback HA WebSocket proof, no credentials |
| `npm run proof:ha` | Read-only configured-HA proof (token file) |
| `npm run proof:camera` | Camera origin/redirect proof |
| `npm run proof:dependencies` | Installed-decoder regression proof |
| `npm run check:audit` / `check:audit:strict` | Reviewed policy / public-release gate |
| `npm run check:public-inputs` | Committed-artifact provenance check |

Playwright needs `npx --no-install playwright install chromium` once.

## Ticket workflow

1. **Read the contract.** `docs/README.md` (status) → the ticket in
   `docs/BACKLOG.md` or `docs/handoff/...` → the feature contract in
   `docs/design/` → the source and its tests. Future requirements are not
   current APIs.
2. **Check the tree.** `git status`, `git log --oneline -10`. There may be
   uncommitted work from another agent; never overwrite it. Work in a worktree
   when the ticket is parallel with someone else's (see
   `using-git-worktrees`).
3. **Isolate.** One ticket = one branch/worktree = one coherent commit. Do not
   bundle unrelated fixes or dependency bumps.
4. **Write the failing test first** (`test-driven-development`). Behavioural
   tests only; no styling snapshots, no "renders without crashing" padding.
5. **Implement minimally** in the layer that owns the behaviour
   (`maurice-architecture`). Do not add a second store, permission path or plan
   copy.
6. **Verify** the narrow tests, then the affected broader checks. Quote exact
   commands and results.
7. **Commit** with an imperative sentence. Examples from this repo:
   - `Keep one Home across the detail panel threshold and show the panel only on desktop`
   - `Record the Settings fix as integrated and C04's base`
   - `Let check:ui clean up and report when interrupted`
   No `feat:`/`fix:` prefix. Body: what changed, why, and what was verified —
   including what is *not* verified.
8. **Do not push, merge, publish or rebuild a distributed APK** unless asked.
   State the SHA, checks and limits; the integrator owns index updates.
9. **Update docs in the same commit** as the behaviour change (see below).

## Code conventions

- TypeScript strict. Prefer explicit domain types over `any`; keep `unknown`
  at boundaries and narrow.
- Pure functions for selectors/presenters under `core/`, `commands/`,
  `spatial/`; side effects at the edges (`services/`, `session/`).
- Components: PascalCase file and export. Hooks: `useThing`. Tests:
  `__tests__/<subject>.test.ts[x]` beside the subject.
- Reuse `src/theme.ts` (`colors`, `spacing`, `radii`, `typography`,
  `minTouchTarget`) and `components/ui.tsx`; no ad-hoc palettes.
- Platform variants use `.web.tsx` only for genuinely different behaviour, not
  for a fork of the feature.
- Accessibility is implementation, not QA-only: `accessibilityRole`,
  `accessibilityLabel`, 48 dp targets, visible focus, reduced motion.
- No secrets, LAN addresses, device serials or private identifiers in code,
  tests, fixtures, comments or logs.
- Every async boundary needs a cancellation/staleness story; guards come from
  the session generation, not from `mounted` flags alone.

## Where NOT to write logic

- `app/*.tsx` route shells: registration and params only.
- `src/screens/`: composition; derive through selectors, don't re-implement
  policy.
- Components: never call `session`/`commands` directly except through the
  documented hooks (`useSwitchCommand`, `commands.capture` + `setSwitch`).
- The 3D renderer: presentation and selection only.
- Tests: don't assert private internals when a public behaviour is observable.

## Ownership and parallel work

The current parallel wave divides files:

- **A / integrator:** scripts, workflows, `package*.json`, audit policy, doc
  indexes, native acceptance. Owns integration.
- **B:** Home/detail routes, detail components, `AppShell*`, `desktop.css`,
  `EntityCard`, `services/deviceNavigation.ts`, `spatial/navigation.ts`.
- **C:** Settings, `app/auth-callback.tsx`, `services/auth/`,
  `credentialStorage*`, `credentials.ts`, `runtime.ts`, `SessionManager`,
  `HomeAssistantBackend`, and `core/types.ts` for the connection contract only.
- **Frozen:** 3D engine, camera, plan/preferences model, command facade, theme.

If you need a change in someone else's zone, send the need and a proposed API
instead of editing in parallel. A cross-cutting bug is a separate commit with a
named owner. Always re-check `docs/handoff/parallel/README.md` — zones move.

## Native rules

- A JS-only change can be tested in the installed development client with
  Metro. A new native dependency requires a rebuilt client.
- Device acceptance uses a **named binary** built from a **clean revision**.
  Trial builds strip `EXPO_PUBLIC_*` and private plan inputs; verify the build
  metadata before installing.
- Never automate authentication, and never perform a physical action without
  explicit authorization at that moment. Restore any temporary Wi-Fi, sleep,
  placement or HA state afterwards.
- A JS bundle export is not an APK; a built APK is not an installed app; an
  installed app is not a physical observation.

## Documentation discipline

- `docs/README.md` = current status and navigation. Update the affected row and
  the verification checkpoint.
- `docs/BACKLOG.md` = implementation contracts and ticket acceptance. Update the
  ticket, not the whole history.
- `docs/design/<feature>.md` = the durable contract (scope, rules, verification
  boundary).
- `docs/stage0/<feature>-validation.md` = dated evidence ledger. **Append** a
  dated section; never replace old numbers, hashes or failures.
- `docs/handoff/` = bounded tickets and prompts for the next agent.
- `docs/reviews/` and `docs/superpowers/specs/` = dated snapshots; follow-ups
  link rather than rewrite.
- Record the exact commands you ran and the scope they cover. Distinguish
  "source checks" from "remote CI", "built" from "accepted", and "reused
  evidence" from "re-run evidence".
- Use the public sample for committed artifacts. Private geometry, tokens and
  personal captures stay ignored.

## Dependencies and supply chain

- Add a dependency only when the platform or an existing tool cannot do the
  job; prefer the Expo-supported version range.
- Lockfile changes are reviewed, not incidental.
- Patches live in `patches/` and must pass `patch-package --error-on-fail`.
- Audit policy (`scripts/dependency-audit-policy.json`) allows only reviewed,
  expiring exceptions; `check:audit:strict` is the public-release gate.
  Never "fix" an audit failure by deleting the check.

## Definition of done (source)

- Behaviour test written first, now green; relevant regressions green.
- `npm run typecheck`, `npm run lint`, `npm run format:check` pass.
- No secret/private data added to Git, fixtures, artifacts or docs.
- Docs updated at the right level (status / contract / dated evidence).
- Commit is self-contained and revertible; SHA and limits reported.
- Anything unverified is named explicitly. Silence is not a claim of success.

## Smells

- A screen that knows about `sessionId`, epochs or service names.
- A command path that updates `useCockpit` before a report.
- A new retry/timeout outside the backend.
- A preference read before `preferencesLoadedFor` matches.
- A plan/credential copied between profiles or origins "for convenience".
- A test that asserts a style object or a snapshot of a whole screen.
- A green broad suite used to justify an unverified native claim.
