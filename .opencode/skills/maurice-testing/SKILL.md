---
name: Maurice testing
description: Use when planning, writing, running or reporting tests for Maurice — Jest behaviour tests, Node tooling tests, protocol/HA/camera proofs, Playwright UI and accessibility checks, Android trial acceptance, or when deciding what evidence a claim needs.
---

# Maurice — testing and acceptance

## What "tested" means here

Maurice distinguishes six levels. Use the exact level, never the strongest
adjacent one.

1. **Code** — implemented on a revision.
2. **Automated** — behaviour tests pass on that revision.
3. **Built** — a named artifact exists (APK number, SHA-256, source commit).
4. **Installed** — it runs on the target device.
5. **Observed** — a human saw the effect and the restored state.
6. **Used** — sustained household use over days.

A passing suite never upgrades a native claim. An old accepted binary never
certifies new source. A demo fixture never certifies vendor hardware.

## Test layers

| Layer | Command | Proves | Does not prove |
| --- | --- | --- | --- |
| Jest behaviour/component | `npm test` | rules, guards, lifecycle, selectors, rendering logic | native layout, touch, GPU, TalkBack, real HA |
| Tooling (Node) | `npm run test:tooling` | build/preview/public-artifact policy, fixtures, config | runtime app behaviour |
| Protocol proof | `npm run proof:protocol` | compressed HA protocol, resync/disconnect, command policy against a loopback server | real HA version/vendor |
| HA proof | `HA_ALLOW_INSECURE_HTTP=1 npm run proof:ha` | auth, snapshot, registries, ping, refresh, reconnect on a configured HA | device control, vendor semantics |
| Camera proof | `npm run proof:camera` | origin binding, redirect isolation, no token leakage | camera rendering on device |
| Dependency proof | `npm run proof:dependencies` | installed decoder consumption | absence of advisories |
| Web smoke | `npm run check:ui` | Home/plan/control at 320/430/768/1440, focus returns, closed HA fixture | touch, safe areas, native fonts |
| Spatial browser | `npm run check:spatial-ui` | 2D/3D selection, camera, fallback, lifecycle, performance mode | phone GPU/size acceptance |
| Detail panel | `npm run check:detail-panel` | desktop panel route/threshold/back behaviour | native navigation |
| Web auth | `npm run check:web-auth` | sign-in, renewal, tabs, logout, storage failure | native credential persistence |
| Android export | `npm run export:android` | Hermes/DOM bundle builds | installability or runtime |
| Trial APK | `npm run build:trial:android` + manual | a signed standalone candidate exists | acceptance |
| Audit | `npm run check:audit` / `:strict` | reviewed dependency policy / release gate | functional correctness |

## Choosing the layer

- Pure rule, selector, migration, guard → **Jest**.
- Build script, CLI, public-artifact policy → **Node tooling test**.
- Transport, reconnect, epochs, service mapping → **Jest + protocol proof**.
- Real HA compatibility → **HA proof**, read-only.
- Layout, focus, keyboard, responsive width → **Playwright**.
- Touch, safe area, fonts at 200 %, GPU, TalkBack → **native acceptance**.
- Physical effect, permission grant, restored state → **authorized human
  observation on a named binary**.

If unsure, start at the lowest layer that can fail for the reason you care
about — then add the next one only for the claim you need to make.

## Writing a Jest test

- Place it in `__tests__/` beside the subject: `foo.ts` →
  `__tests__/foo.test.ts`. Shared fixtures use descriptive names and public
  shapes.
- Test **observable behaviour and invariants**, not implementation trivia or
  style objects. Assert the thing a user or another module depends on.
- Cover the failure modes the contract names: stale metadata, recreated
  identity, wrong profile, revoked grant, unavailable entity, late response,
  generation change, failed refresh, overlapping requests.
- Use fake timers deliberately; flush promises explicitly. No arbitrary
  `setTimeout` waits.
- Use the real `SessionManager` with a mocked backend when the guard is the
  subject; use a fake scheduler/tracker only when the unit is the pure part.
- Demo determinism is a feature: the same inputs must produce the same
  snapshot/outcome.
- One behaviour per test; a failing test should name the rule that broke.

## Playwright conventions in this repo

- Scripts live in `scripts/check-*.mjs`, not in `e2e/`. They start their own
  server, use the public sample, and write reports/screenshots to `artifacts/`.
- Preserve the developer's private plan: preparation is isolated, and the
  script restores local configuration on exit **and on interrupt**. Clean up
  temporary dirs and browsers in `finally`.
- Assert zero page errors and zero external requests where the script already
  does; keep those assertions when extending.
- Widths are 320 / 430 / 768 / 1440 for the public smoke. New layout rules need
  the widths that can actually break them.
- Accessibility assertions: roles, accessible names, selected state, focus
  return, skip link, keyboard activation. Do not replace a focus assertion with
  a longer timeout or retry.
- Never assert pixels or whole-page screenshots. Use DOM state plus a small
  number of named artifacts.

## Flake policy

1. Reproduce with slowed transitions/commits and observe the real state
   (`document.activeElement`, mounted refs, network log).
2. Fix the lifecycle/race. Never delete the assertion, raise the timeout
   blindly, or add retries to hide it.
3. Record both the failing and passing runs if the cause is unproven.
4. An intermittent failure stays open until a mechanism is demonstrated or a
   supervised acceptance covers the risk.

## Native acceptance protocol

Before touching a device:

- Confirm the exact source commit, build number, feature flags, plan source and
  SHA-256. A build from uncommitted source is not an acceptance candidate.
- Confirm the phone, OS version and that the expected binary is installed.
- Obtain explicit authorization for the moment, especially for any physical
  action.
- Note what you will restore (Wi-Fi, sleep, placement, initial switch state).

During:

- Record what you see, not what the code implies. Separate "request accepted"
  from "state observed".
- Cycle the feature through: cold start, background/foreground, HA restart,
  network loss, cache, unavailable, refusal, persistence after process restart.
- Check 100/150/200 % text, 48 dp targets and TalkBack where relevant (a
  supervised human listener is required for speech confirmation).

After:

- Restore device and HA state.
- Write a dated ledger section: commit, binary, checks, results, limits, what
  remains unproven. Never overwrite an older ledger.

## Evidence ledger template

```md
## <Feature> — <YYYY-MM-DD>

Source: `<commit>` · Binary: Trial `<n>` · SHA-256: `<hash>`
Device: `<model / OS>` · Plan: public sample | private (not committed)
Scope: <what this run covers>

| Check | Result | Notes |
| --- | --- | --- |
| <behaviour> | pass / fail / not run | <evidence> |

Automated: `<commands>` → <counts>.
Limits: <not run, not reproduced, reused evidence, platform gaps>.
Next: <the single next acceptance step>.
```

## QA checklist by surface

**Home** — attention first, honest unknown/unavailable, room filter, favourites
persist, summary opens detail, primary action reachable in ≤2 presses, large
text reflows, no nested pressables.

**Device summary / detail** — one card per physical device, all eligible
readings reachable, uncertainty preserved, stale/cached labelled, primary
reading chosen by verified semantics, no dead-end route.

**Plan (2D)** — floors, concave rooms, room links, placements save/move/remove,
missing references retained, offline rendering, 48 dp targets, screen-reader
alternative via room list.

**3D** — one active renderer, hidden/background stop, resource disposal, camera
bounds/zoom, marker diffs, selection callback, 2D fallback after context loss,
≥30 fps interaction, no secrets/attributes in the bridge.

**Settings / auth** — URL validation (no path/query/fragment), HTTP trust
choice, terminal errors, forget/sign-out removes credentials, browser memory
cleared on reload, durable session revokes on logout, no cross-origin copy.

**Diagnostics** — health without secrets, retry only where valid, unresolved
identities visible, plan reset explicit with consequences.

**Commands** — refusal for wrong/unenrolled device, no optimistic state, late
observation reconciles, deadline outcome, cancellation on lifecycle change,
zero replay, demo parity, qualified copy ("request sent" ≠ "lamp on").

**Accessibility** — 320/430/768/1440, 100/150/200 % text, keyboard-only web,
focus return from detail to marker/row, reduced motion, TalkBack supervised.

**Privacy** — no token/URL/private geometry in logs, artifacts, fixtures,
screenshots, bundles or scene props; public build verified with
`check:public-inputs`.

## Reporting

- State exact commands and counts from **this** run; do not reuse documented
  totals.
- Say what was **read** vs **run** vs **reused**.
- Name the platform and binary for every native claim.
- Keep old checkpoints. Append, don't rewrite.
- Report a failure with its log excerpt and reproduction, not a summary that
  hides it.

## Red flags

- "All tests pass" with no command, revision or scope.
- A new test that asserts only that a component mounts.
- A retry added to a focus or timing assertion.
- A native claim backed by an older APK.
- A physical action performed "because the test was green".
- A demo/HA-demo entity counted as household hardware.
- Private plan or token visible in a committed capture.
- Test totals copied from `docs/README.md` instead of measured.
