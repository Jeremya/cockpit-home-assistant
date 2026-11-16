# Next wave B — screens, navigation and accessibility

Agent B of [the 2026-11-16 next wave](../handoff/parallel/2026-11-16-next-wave.md). Base
`ebce4f06f730b6311a24634d40e7afc314fedf92`, worktree `work/next-wave-B` outside the Jest-scanned
tree. Public sample plan and offline demo home only; no household profile, HA, token or device.
Nothing committed or pushed.

**Maturity reached: Implemented + Automated (web).** Nothing here is Built, Installed or Observed.

## Changes (two demonstrated defects)

| Defect | Evidence before | Fix | Evidence after |
| --- | --- | --- | --- |
| Stack header Back link is **30 × 30 px** on web, below the 48 px contract (design §12, product rule 4) | Every Stack route at 320/430/768/1440 and at 150/200 % zoom; the 1440 panel draws its own 82 × 48 Back | `src/components/stackHeader.web.tsx` draws the same `HeaderBackButton` (label, `href`, `onPress`, a11y name "Home, back" unchanged) with `minWidth/minHeight: 48`; wired as `headerLeft` in `app/_layout.tsx` and `app/(workspace)/_layout.tsx`. `stackHeader.tsx` is `undefined` on native, so Android keeps the platform toolbar button | **48 × 48** on all 12 width × zoom cells; focus ring `2px #7dd3fc` present; panel at 1440 still has no Stack Back (`check-detail-panel` assertion unaffected because the header is hidden while paneled) |
| Home pulse truncates room names (`numberOfLines={1}`): "Living …" at 320 px, all four names at 430 px / 150 % | Clipped-text probe on the demo Home | `HomePulse.tsx` lets the room name wrap; counts and the pulse's accessible label are unchanged | No clipped text at any cell |

Cause worth knowing: Metro resolves by extension before platform, so a `stackHeader.ts` native file
shadows `stackHeader.web.tsx` on web. Both variants must share the `.tsx` extension (first export
proved the fix absent from the bundle; renaming fixed it).

Tests: `src/components/__tests__/stackHeader.web.test.tsx` (label/href/onPress kept, 48 px
minimum, no back link without history) and `stackHeader.test.ts` (native returns `undefined`).

## Verification on this tree

| Check | Result |
| --- | --- |
| `jest --listTests` | 83 files, **0** under `.claude/` (worktree outside the repo) |
| `jest --runInBand` (full) | **83 suites / 1149 tests pass** (base 81 / 1146 + 2 new files, 3 tests) |
| `npm run typecheck`, `npm run lint`, `npm run format:check`, `git diff --check` | pass, 0 lint warnings |
| Public web export (sample, `EXPO_OFFLINE`, no `.local`) | built in scratchpad; prepared plan `source: sample` |
| `check:ui`, `check:detail-panel`, `check:web-auth` (heavy recettes) | **Not run** — reserved for the coordinator's single campaign on the integrated SHA |

## Matrix (web, Chromium headless, demo home)

Zoom is emulated as Chrome page zoom (CSS viewport = width / zoom, device scale factor = zoom), the
method used by B04. It is **not** native font scaling.

| Width | Zoom | Lamp ≤2 presses (toggle on/off) | Feeder detail opens, Back returns | Rooms / Plan / Settings reachable | Overflow | Targets < 48 |
| --- | --- | --- | --- | --- | --- | --- |
| 320 | 100 / 150 % | pass | pass | pass | none | none |
| 320 | 200 % (160 CSS px) | pass | pass | pass | none | tab bar items 40 × 48 (see limits) |
| 430, 768, 1440 | 100 / 150 / 200 % | pass | pass (1440: panel) | pass | none | none |

Page errors: 0 in every cell. External requests: aborted by route guard, none needed.

Keyboard and motion (390 and 768 px, `prefers-reduced-motion` both values):

| Row | Result |
| --- | --- |
| Card → Enter opens detail; one Tab reaches Back; Enter returns to Home | pass, Back 48 × 48 with focus ring |
| Focus after Back in **route presentation** | **fail**: focus lands on `body`, not the originating card |
| Reduced motion | `document.getAnimations()` = 0; link transitions 0.12 s → 0 s under `reduce` |

## Findings not fixed (outside the existing contract or ownership)

1. **Focus return after route-presentation Back.** `DetailWorkspace.web.tsx` captures and restores
   the origin only while `paneled` (design: detail-panel-navigation, "Focus"). Below 1024 px web,
   keyboard users lose their place after Back. Not a regression; not in the current contract; file
   is under `src/navigation/`, outside B. Proposal for the coordinator: run the same
   `captureOrigin`/restore path when not paneled.
2. **Destination names diverge — owner decision needed.** Four surfaces, up to four names:

   | Route | Tab bar | Desktop rail | Stack header | In-page title |
   | --- | --- | --- | --- | --- |
   | `/` | Home | Overview | — | (pulse) |
   | `/entities` | Rooms | Devices & rooms | Your entities | Entities & rooms |
   | `/house` | Plan | Floor plan | Floor plan | plan name |
   | `/settings` | Settings | Connection | Connection | Settings |
   | `/appliance/[id]`, `/device/[key]` | — | — | Device readings / Device | device name |

   Recommendation: one name per destination used by tab, rail and header (e.g. Rooms /
   Plan / Settings), detail headers left generic. This is user-visible copy, so it is not changed
   here.
3. **Two level-1 headings per Stack page** (header title + `ScreenHeader`), and Home's section
   headings are all level 1 (`Heading` uses `accessibilityRole="header"` without a level).
   Heading structure is weak for screen-reader navigation; no contract states levels. Propose
   `aria-level` 2 for section `Heading` on web after the naming decision.
4. **Tab bar at 320 px × 200 % zoom** (160 CSS px): four items cannot fit 48 px each (192 > 160).
   Beyond WCAG's 320 CSS px reflow reference; recorded, not treated as a defect.

## ADR-18 — three open choices, public captures

Files under `artifacts/next-wave-B/` (git-ignored, not committed), 1440 × 900, demo/sample only.
"Before" is `44f6df3` (pre-polish, same lockfile); it differs in other ways too, so compare only the
named element.

| Choice | Before | Now |
| --- | --- | --- |
| Flat device lattice without room titles on wide Home "All rooms" | `adr18-1-wide-home-before-44f6df3.png`: KITCHEN / LIVING ROOM / ENTRYWAY groups, two columns | `adr18-1-wide-home-after-ebce4f0+B.png`: one three-column lattice; room is only in each card subtitle |
| Count-only card headline removed | `adr18-2-card-before-44f6df3.png`: fridge leads with "4 readings" | `adr18-2-card-after-ebce4f0+B.png`: no headline, three ruled readings |
| Faint 1 m drafting grid behind the 2D plan | `adr18-3-plan-before-44f6df3.png`: no grid, tinted rooms | `adr18-3-plan-after-ebce4f0+B.png`: grid across the stage |

Unchanged by B. Their presence in `main` is not an approval.

## Icon A and all-quiet

- `app.json` points `icon`, `adaptiveIcon.foregroundImage` (same bytes, sha256 `e43e5893…`) and
  `web.favicon` (`209a25e2…`) at the assets changed in `ebce4f0`; the web export emits a 16/32 px
  `favicon.ico` and the rail shows the new bust. **Native launcher icon not verified**: needs a named
  APK, which belongs to the coordinator's build slot.
- `assets/illustrations/all-quiet.png` still has no consumer. Not wired, as instructed.

## Not executed

Native rendering, Android safe areas, switch colours and `hitSlop`, native 200 % font scale,
TalkBack (supervised), the three heavy browser recettes, and any build. The Android back target is
the platform toolbar's own and was not measured.

## Next step

Coordinator: run `check:ui`, `check:detail-panel` and `check:web-auth` once on the integrated SHA;
decide finding 1's owner; ask the owner for the naming (finding 2) and the three ADR-18 choices;
schedule a native slot (B before C) for safe areas, 200 % font scale and TalkBack.
