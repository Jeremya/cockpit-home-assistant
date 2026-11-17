# Wave 2 — B: shared focus, native accessibility, decisions to group

Agent B of [wave 2](../handoff/parallel/2026-11-16-wave-2.md). Base
`0f6d5fb41e1126d4e5fb82f6626458b96f0e59cb`, branch `work/wave-2-B`, worktree outside the
Jest-scanned tree. Public sample plan and the in-app offline demo home only: no household profile,
no HA (real or fixture), no Trial 1012, no Pixel.

**Maturity.** Web focus and grid fixes: Implemented + Automated (Jest, browser recettes).
Android switch target: Implemented + Automated (Jest); **not in the measured APK**, so it must be
rechecked on A's rebuilt candidate. Seeker run: Installed + Observed on the A1 candidate for what it
contains.

## Corrections

| # | Defect, reproduced before correction | Correction | Evidence after |
| --- | --- | --- | --- |
| 1 | **Focus lost in web route presentation.** At 390 and 768 px focus fell to `body` on opening a detail, drilling in, Back, browser Back/Forward and after a panel → route breakpoint change. Base probe: **6 / 16 rows pass** (only the panel, `/house` marker and route → panel rows) | `DetailWorkspace.web.tsx` applies the panel's existing rule in route presentation too: each shown detail focuses its title; return to the list focuses the visible origin, else the list title, else the main region. Fallback chain in `listFocus.web.ts` | Probe **16 / 16**; `check:detail-panel` **26 / 26 rows** (22 existing + 4 new, see below) |
| 2 | **Android switch target 47 × 27 dp.** On the Seeker, a touch 6 dp above "Show Front door" (inside the declared `hitSlop` 12/8) did nothing; only the centre toggled. Android's native switch ignores `hitSlop` | `ThemedSwitch` gives the native switch a 48 × 48 dp minimum box (`style`, not web; web keeps its CSS target). `hitSlop` removed as it was not effective | Jest: new test fails on base, passes with the fix. **Native recheck pending on the A3 APK** |
| 3 | **Device grid paints one full-width column for one frame** after a filter change on web, then jumps to columns (`CardGrid` starts at width 0 until `onLayout`). This is the cause of the `check:ui` 1440 failure below | `CardGrid` measures before paint on web (`useLayoutEffect` + `getBoundingClientRect`), the same technique `DetailWorkspace` already uses | Frame sampling: first frame is the final lattice. Unmodified `check:ui` **2 / 2 pass** |

### Owner agreement for correction 1

Asked in this session on 2026-11-17 with a two-option question ("Contrat de focus en présentation
route…"). Option chosen by the owner: **« Même règle que le panneau (Recommandé) »**, whose text was:
"Chaque détail affiché (ouvert, imbriqué, revenu, Forward) focalise son titre ; le retour à la liste
focalise l'origine visible (carte ou marqueur), sinon le titre « Around your home », sinon la région
principale. Jamais d'élément caché." The other option ("Retour seulement") was declined. The answer
was given through the session's question dialog, so A cannot verify it from another session: the
owner should confirm it at merge. The contract text is updated in
[detail-panel-navigation.md](../design/detail-panel-navigation.md) (Navigation rules → Focus; Panel
behavior → Focus).

## `check:ui` 1440 failure — "Desktop must lay common device cards out in columns"

The assertion was not removed, and the failure is not put down to machine load.

| Run (local, macOS, Chromium 156.0.8078.4, `npm run check:ui`) | Tree | Result |
| --- | --- | --- |
| 1–3 | `0f6d5fb` + focus/switch changes, before the grid fix | fail, fail, fail |
| 4 | `0f6d5fb` clean (detached worktree) | fail |
| 5–6 | `0f6d5fb` clean, later | pass, pass |
| instrumented copy, init-script recorder only (no added round trip) | B tree before grid fix | fail, with the trace below |
| 7–8 | B tree **with** the grid fix | pass, pass |

So before the grid fix: **5 failures in 7 unmodified runs** (4/4 on the B tree, 1/3 on clean base).
These samples are too small to compare the rates between the two trees; the frame sampling below shows
the same first frame on both. Public CI was green at `0f6d5fb`
([run 43999529250](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/43999529250)); the
race is timing-dependent and was not reproduced there.

Mechanism, from the instrumented run (event log, page time in ms):

```
3858 pointerdown on tab "All rooms"     3859 click     3862 aria-selected=true "All rooms"
~3876 assertion measures the grid  →  sharedRow = false
```

The click is not lost and the selection changes. The grid is measured in its first frame. Frame
sampling with the public export at 1440 px confirmed it on **both** base and B builds: frame 1 =
cells `[256, 937, w 1152]` and `[256, 1187, w 1152]` (one column), frame 2 (~16 ms later) =
`[256, 937, w 373]`, `[645, 937, w 373]`. With correction 3, frame 1 is already the three-column
lattice. Two instrumented copies with an extra round trip before the click passed for the same
reason (the delay hid the first frame); they are not counted as evidence of a fix. The debug copy was
deleted and is not part of the branch.

## Focus matrix (web, public export, demo home)

| Row | 390 | 768 | 1440 |
| --- | --- | --- | --- |
| Card → detail (title focused) → header Back → card | base fail / **pass** | base fail / **pass** | panel: pass / pass |
| Card → detail → browser Back → card | base fail / **pass** | base fail / **pass** | — |
| Back, Forward (title), Back → card | base fail / **pass** | base fail / **pass** | — |
| Nested: feeder → reading → Back → Back (title, title, card) | base fail / **pass** | base fail / **pass** | — |
| Placed `/house` marker → reading → Back → marker | pass / pass | pass / pass | — |
| Opened in panel, filtered away (Office), narrowed to 768, Back → list title | — | — | base fail / **pass** |
| Opened in panel, narrowed to 768, Back → card | — | — | base fail / **pass** |
| Opened as route at 768, widened to panel, Close → card | — | pass / pass | — |
| Direct link without a session → Back → main region | base body / **main** | base body / **main** | — |
| Focus ever on a hidden element | no | no | no |

Home markers: compact Home has no 2D markers (static preview), so the marker origin is the `/house`
one, covered by M00 (`check:ui` marker cycles). Stale-profile focus is not separately exercised
beyond the direct link before connection. The direct-link rows run without a session; with a session
the 1440 panel row of `check:detail-panel` already covers it.

New `check:detail-panel` rows: "Route presentation focus at 390 px", "… at 768 px", "Origin filtered
away, then panel to route", "Direct link without a session, route Back".

## Seeker recette

Device `SM02G4061971427` (Seeker, Android 16, 1200 × 2670, 480 dpi = 3 px/dp, gesture navigation).
Candidate from A: `com.larrabee.homecockpit.s02proof` 0.1.0 (1), APK SHA-256
`66a7f47f75e065d5c44929cc0e21ddc69bc022006312de3f437f1bd5df80580d` (installed hash checked), source
`0f6d5fb`, demo home. It contains **none** of the B corrections above. Slot granted by A, released
to A and D at the end. State restored: TalkBack off, `font_scale` 1.0, no install, only demo state
touched (lamp On → Off, one visibility switch toggled and restored).

Method: `adb -s … uiautomator dump` per scroll page (swiping on the right edge), bounds converted to dp;
`input tap` for actions.

| Check | 100 % | 150 % | 200 % |
| --- | --- | --- | --- |
| Lamp from Home: on observed, off restored | pass, 1 press | pass, 1 press | pass, 1 press |
| Feeder: open, readings shown, system Back to Home list | pass | pass | pass |
| Tab bar height (bar top) | 80 dp (810) | 87 dp (803) | 92 dp (798) |
| Last item at the end of the scroll, Home / Rooms / Plan / Settings | 778 / 761 / 778 / 761 dp, all above the bar | Home/Plan/Settings above; Rooms see note | 778 / 761 / 778 / 761 dp, all above |
| Controls under 48 dp (wholly visible) | `Show …` switches 47 × 27 | switches 47 × 29 | switches 47 × 35 |
| Text truncation (screenshots) | none seen | none seen | none seen; headers and cards wrap |
| Safe areas: status bar, gesture inset (frame `[0,2598][1200,2670]`) | content clears both; detail ends at 825 dp < 866 dp | — | same |
| Unlabelled clickable nodes | 0 | 0 | 0 |

Note, script limit vs product: at 150 % the Rooms scan stopped at its 14-page cap before the end of
the list, so its "content under the bar" reading is an artefact. Raised to 40 pages, the 200 % scan
reached the end with nothing under the bar. Partial sizes such as "Add favorite 335 × 25" are controls
cut by the scroll viewport. Their full size is 48 (100 %) or 59 dp (200 %), so they are not defects.
The `Show …` switches are the only real sub-48 targets, and the 6 dp touch above shows the `hitSlop`
is not effective (correction 2).

**Scene under the bar (C's observation).** On compact Home the plan card with its 3D scene appears
only after "Show rooms on plan". It starts below the fold and scrolls fully above the bar
(screenshot `scene3d.png`, not committed). Verdict: **below the fold, not inaccessible.** The same holds
for "Place device" on Plan at 100/150/200 %: at rest 827–875 dp under a bar starting at 810 dp, then
472–520 dp after one scroll. "Retry 3D view" did not occur on the Seeker. The Pixel was not measured by B.

Related observation for C: a vertical swipe that starts on the Home 3D scene orbits the camera
instead of scrolling the page. The rest of the page still scrolls, so this is not a trap, but it
broke my scroll script until it swiped on the edge.

**TalkBack, supervised.** Enabled by adb with the owner holding the phone, Maurice in demo on Home.
The guided path was: Home → lamp on/off, feeder detail, Back, tab bar. Owner's report: « ça a
marché ». Per-step announcements were not recorded. Disabled afterwards (no bound service).

## To replay on A3 (rebuilt candidate)

1. Rooms: a touch 6 dp above and below a `Show …` switch toggles it; uiautomator bounds ≥ 48 × 48 dp
   at 100 and 200 %; restore each switch.
2. Settings: the "Show token" switch, same check.
3. Smoke: lamp 1 press on/off, feeder open/Back at 100 % (layout of rows holding a switch).

## Decisions to group (owner)

| Topic | Today | Proposal |
| --- | --- | --- |
| `/` | tab Home, rail Overview | Home everywhere |
| `/entities` | tab Rooms, rail Devices & rooms, header Your entities, title Entities & rooms | Rooms everywhere; title "Rooms", eyebrow keeps "Your home, your view" |
| `/settings` | tab Settings, rail Connection, header Connection, title Settings | Settings everywhere |
| `/house` | tab Plan, rail and header Floor plan, title = plan name | Plan in tab/rail, header Floor plan kept (title is the plan name) |
| Heading levels (web) | Stack header title and `ScreenHeader` are both level 1; Home sections all level 1 | one level 1 per page (in-page title), section headings level 2 |
| ADR-18 (1) flat lattice without room titles on wide Home | in `main` | captures `adr18-1-*` (wave 1, git-ignored) |
| ADR-18 (2) no count-only card headline | in `main` | captures `adr18-2-*` |
| ADR-18 (3) faint 1 m grid behind the 2D plan | in `main` | captures `adr18-3-*` |

None are changed here. `all-quiet` stays unwired.

Pending assignment, not touched: Android autofill offering to save the HA token in Google Password
Manager (seen by D).

## Validation on the final tree

Base `0f6d5fb`, all B changes applied (the tree that is committed):

- `tsc --noEmit`, `npm run lint` (0 warnings), `npm run format:check`: pass.
- `jest --runInBand`: **87 suites / 1158 tests pass** (wave-2 base: 85 / 1153; +2 files, +5 tests:
  `listFocus.web.test.ts` 4, `ThemedSwitch.test.tsx` 1).
- `npm run check:detail-panel`: **passed, 26 / 26 rows**, 0 page errors, 0 external requests.
- `npm run check:ui`: **passed 2 / 2** with the grid fix (runs 7–8 above).
- Not run by B: `check:spatial-ui`, `check:web-auth` (no change in their surfaces), any APK build.
