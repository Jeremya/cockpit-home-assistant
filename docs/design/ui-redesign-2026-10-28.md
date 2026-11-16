# Maurice UI redesign — three directions

- **Status:** design exploration completed 2026-10-28. **Owner selected Concept C**; the C P0, P1
  and P2 visual layers are implemented in production Home. Accessibility acceptance, the optional
  light theme, screenshot-diff CI and native performance measurement remain.
- **Owner decision:** C (Premium Smart Home Cockpit), confirmed 2026-10-28. The analysis below
  recommended B; that recommendation is superseded by this decision, not erased.
- **Ask:** rethink the Home experience, not polish the current stack.
- **Constraint:** keep the product principles, Home Assistant integration, command
  rules and existing architecture. The prototypes are isolated, use public demo
  data only and never open a Home Assistant session.
- **Evidence:** three rendered prototypes at 390 × 844 (2× captures), verified at
  375 × 812 and 430 × 932, plus the current Home at the same viewport.

## 1. What I inspected

Read: `AGENTS.md`, `.opencode/skills/maurice-product/SKILL.md`,
`docs/architecture/decisions.md`, `docs/architecture/open-questions.md`,
`docs/design/2026-10-15-interface-direction.md`, `docs/design/floor-plans.md`,
`docs/design/spatial-view.md`.

Current Home sources: `src/screens/HomeScreen.tsx`,
`src/components/HomePlanOverview.tsx`, `src/components/DeviceSummaryCard.tsx`,
`src/components/EntityCard.tsx`, `src/components/CardGrid.tsx`,
`src/components/ui.tsx`, `src/theme.ts`, `src/components/AppShell.web.tsx`,
`src/components/layout.ts`, `src/components/SessionBanner.tsx`,
`src/components/FloorPlanView.tsx`, `src/components/CockpitSceneView.tsx`.

The current captures use the **demo profile** with the public sample; the real
household plan was not opened or captured for this document.

## 2. Test environment

| Item | Value |
| --- | --- |
| Target viewport | 390 × 844 logical, DPR 2 |
| Also checked | 375 × 812, 430 × 932 |
| Runtime | Expo web dev server, React Native Web, Chromium 156 |
| Data | Public sample plan + simulated demo observations |
| Prototype route | `/ui-redesign?concept=a\|b\|c`, gated by `EXPO_PUBLIC_UI_REDESIGN=1`, unlinked |
| Production changes | None; no dependency installed, no commit created |

## 3. Current Home — critical review

![Current Home](../../artifacts/ui-redesign/current-home.png)

![Current Home with the 3D plan expanded](../../artifacts/ui-redesign/current-home-3d.png)

The current Home is a vertical stack of engineering panels. It works, and its
accessibility and truthfulness foundations are worth keeping, but it has no
compositional hierarchy.

| Problem | Where it comes from | Consequence |
| --- | --- | --- |
| The alert panel is the first and largest surface | `HomeScreen.tsx` around the “Needs attention” block (`:272`), with the coverage sentence “Attention rules assessed 6 of 19 visible entities” | One unlocked side door takes roughly a third of the first screen and reads like a system report. |
| Technical inventory is a primary heading | `HomeScreen.tsx:480-494` — “Around your home”, `{deviceCount} devices · {visibleCount} visible readings` | The user is asked to parse a database count before seeing a room or an action. |
| The plan is a control panel, not a hero | `HomePlanOverview.tsx` — title, “3 floors · Explore full floor plan”, a full-width “Show rooms on plan” button, then floor tabs, 2D/3D tabs, a scene and room chips, all inside the same bordered panel | At 390 px the 3D house is small and surrounded by switches; the house competes with its own controls. |
| Every surface has the same weight | `ui.tsx` `Panel` and `styles`: 1 px border, 24 px radius, 20 px padding; `HomeScreen` repeats the pattern for attention, plan, filters, cards | Borders and nesting replace hierarchy; nothing feels like a hero, a control or a quiet aside. |
| Accent colour is everywhere | `theme.ts` `accent: #98c2ff`; `ui.tsx` labels, links, selected chips, focus | Blue no longer signals one meaning; every interactive element looks equally important. |
| Two competing display scales | `ui.tsx` `title` 32 px, `sectionTitle` 19 px; `theme.ts` `typography.title` 30, `value` 26; uppercase 11 px labels | “Maurice · demo home”, “Needs attention” and “Around your home” all compete; no calm reading order. |
| Horizontal filter chips overflow without a clear affordance | The rooms row in `HomeScreen` | At 390 px the last chip is cut; it looks like a layout defect rather than a scroll. |
| No persistent mobile navigation | `AppShell.web.tsx` has a desktop rail; native uses stack routes and a header gear | Home, Rooms, Plan and Settings are not peers on a phone; the user must know where to go. |
| The house is hidden by default | `HomePlanOverview` collapses the plan on compact widths | The product’s defining object is behind a button, behind a 3D tab, inside a card. |

What to keep: 48 dp targets, explicit accessibility roles/labels, condition and
coverage semantics, the honest “Unlocked”/unavailable vocabulary, the 2D
fallback, reduced-motion handling and the no-optimistic-command rules.

## 4. References and compatibility

I inspected Apple Home, the Dribbble smart-home search, 21st.dev and the Mobbin landing. The component libraries below were checked for platform scope; none was installed or used as a runtime dependency.

| Source | Pattern worth adapting | Compatibility |
| --- | --- | --- |
| [Apple Home](https://www.apple.com/home-app/) (viewed) | Very large, calm title; small status chips; colour-coded accessory icons on light surfaces; camera/room hero; bottom tabs; generous white space. | Native iOS idiom; adapt with RN primitives, not web markup. |
| [Dribbble smart-home search](https://dribbble.com/search/smart-home-app) (viewed) | Two recurring families: light room/device cards, and dark control dashboards with a large climate value and compact cards. | Interaction patterns are portable; visual assets/code are not. |
| [Mobbin](https://mobbin.com) (landing inspected; search is gated) | Shipped-app screen library; useful for later room/device-picker audits. | Web reference only. |
| [21st.dev](https://21st.dev/community/components) (viewed) | Bento composition, restrained hero gradients, small “ambient” details. | **Next.js/web-only**; do not copy into React Native. |
| [shadcn/ui](https://ui.shadcn.com) | Form/card/typography discipline. | Web React/Tailwind; not an RN dependency. |
| [Magic UI](https://magicui.design) / [React Bits](https://reactbits.dev) | Motion and gradient ideas; use sparingly. | Web-only; no RN compatibility. |
| [React Native Reusables](https://reactnativereusables.com), [gluestack-ui](https://gluestack.io), [Tamagui](https://tamagui.dev) | Accessible RN primitives, theme tokens, platform-aware styling. | RN/Expo-compatible candidates; **not installed**. No dependency is approved by this exploration. |
| [House Control](https://github.com/0xProbabillity/house-control) | Architectural cutaway language, plinth, warm materials. | Already the basis of the 3D direction; not a UI library. |

No UI library was installed. The prototypes use only React Native, the already
installed `react-native-svg`, `expo-status-bar`, the existing Feather icon set
and (for Concept B) the existing `CockpitSceneView` with the public sample.

## 5. Three directions

### Concept A — Apple Home, reimagined

**Philosophy:** calm, light, effortless. The home is a quiet list of familiar
things; status is a sentence, not a dashboard.

![Concept A](../../artifacts/ui-redesign/concept-a.png)

![Concept A, lower screen](../../artifacts/ui-redesign/concept-a-lower.png)

- Warm off-white canvas, white cards, one deep-green accent, amber only for
  attention.
- Clear hierarchy: greeting (34) → one status sentence → house overview →
  circular quick actions → favourites → rooms.
- The house is a custom architectural plan illustration, not a 3D canvas, so the
  first screen is fast and legible. A “3D” affordance can open the real scene.
- Native-feeling rounded rectangles and soft shadows; no borders on cards.
- Bottom tabs: Home, Rooms, Activity, Settings.
- Strengths: highest readability, lowest cognitive load, easiest cross-platform
  implementation, works in bright environments. Weaknesses: the house is not the
  hero; it is the most generic direction; it abandons the dark Maurice character;
  the plan illustration needs real geometry mapping to stay truthful.

**Feasibility:** high; no 3D dependency, low–medium effort, lowest performance
risk. Safe-area insets and 200% text still need device verification.

**System.** Screen `#F5F2EB`, card `#FFFFFF`, soft `#EAE3D6`, text `#1D1B17`,
secondary `#625E56`, meta `#736D64`, accent `#1F6F5C`, warning `#A65A24`, cool
`#3B6B80`; radii 28/22/18; margins 20; card padding 14; type 34/27/23/15/13/11;
soft 8–22 px shadows, no card borders; 220 ms sheet fade, 120 ms press, reduced
motion immediate.

### Concept B — Architectural Home

**Philosophy:** the house is the product. One large, warm architectural portrait,
then only the controls that matter, then the rooms.

![Concept B](../../artifacts/ui-redesign/concept-b.png)

![Concept B, lower screen](../../artifacts/ui-redesign/concept-b-lower.png)

- Full-width live `CockpitSceneView` with the public sample; floor/room caption
  and a single “Open plan” affordance over the scene.
- Warm dark stage (`#0B0E12`), brass accent, serif display for “My home” and
  section titles; sans for controls and metadata.
- One status sentence, then “Now” (lamp toggle + front-door state), then a
  horizontal room rail, then “Elsewhere” readings.
- Floating, opaque navigation pill with a bottom fade; Home, Rooms, Plan,
  Settings.
- Strengths: strongest house prominence and emotional identity; directly uses
  the 3D asset system already built; reads as a premium architectural miniature,
  not an HA dashboard. Weaknesses: dark theme contrast needs care; the live 3D
  hero must meet the on-demand/idle-frame contract and have a beautiful 2D
  fallback; rooms and readings sit below the first viewport; serif can feel
  editorial if overused.

**Feasibility:** medium–high; the hero reuses `CockpitSceneView` on web and native,
so there is no new renderer. Medium–high effort: overlay layout, 2D fallback,
safe areas, focus and a measured performance budget. 3D/GPU risk is the main
cross-platform risk.

### Concept C — Premium smart-home cockpit

**Philosophy:** sophisticated dark interface, precise status, consumer-electronics
confidence. Data is composed, not dumped.

![Concept C](../../artifacts/ui-redesign/concept-c.png)

![Concept C, lower screen](../../artifacts/ui-redesign/concept-c-lower.png)

- “Home pulse” ring (4 room segments) with a central room count and one alert.
- Cyan/mint/amber status language; tabular numbers; soft radial ambience.
- Quick tiles for Lights, Climate, Security, Rooms; room cards with state bars;
  a grouped device list with the one real control (lamp) and read-only states.
- Five-item bottom navigation: Home, Rooms, Devices, Activity, Settings.
- Strengths: excellent status scanability, premium electronics feel, scales to
  more readings/rooms. Weaknesses: closest to the “engineering dashboard”
  failure mode; the house is absent from the hero and there is no direct plan
  access; the ring can imply invented health if it is not tied to real
  alert/room data; density at 390 px is high.

**Feasibility:** high; medium effort, no new dependency, but dense small text
needs a large-font pass.

**System.** Screen `#06090F`, surface `#0D141E`, elevated `#121B27`, text
`#F2F7FC`, secondary `#9AABBD`, meta `#7D8C9E`, accent `#7DD3FC`, mint `#5EEAD4`,
warning `#F0B35E`; radii 26/20/11; margins 18; type 34/24/18/13/11/9 with tabular
numbers; ring stroke 400 ms, list stagger 30 ms, toggle 160 ms, reduced motion
immediate.

Scenes are intentionally absent from all three quick-action rows: the public demo
does not expose a scene/script capability, and a scene shortcut would imply an
unsupported action. The tile pattern can add a real scene when HA exposes one.

## 6. Side-by-side

![Side-by-side comparison](../../artifacts/ui-redesign/comparison.png)

| Dimension | Current | A | B | C |
| --- | --- | --- | --- | --- |
| Visual appeal | 1 | 4 | **5** | 4 |
| Information hierarchy | 2 | **5** | 4 | 4 |
| Readability | 2 | **5** | 4 | 4 |
| Perceived quality | 1 | 4 | **5** | 4 |
| Mobile usability | 2 | **5** | 4 | 4 |
| Accessibility (base) | 3 | 4 | 3.5 | 3.5 |
| House prominence | 1 | 2 | **5** | 2 |
| Consistency | 2 | **5** | 5 | 4 |
| Implementation effort | — | Low | Medium–high | Medium |
| Cross-platform risk | — | Low | Medium (3D perf) | Low |

Ratings are judgements from the rendered screenshots, not measured usability
scores. The current UI scores low on hierarchy by design: it exposes the
attention ledger and reading counts as primary content.

## 7. Recommendation (analysis; superseded by the owner decision)

> **Owner decision 2026-10-28: Concept C.** The C P0 migration is recorded in §11. The B analysis
> below is retained as the design rationale that was not chosen.

**The analysis recommended Concept B — Architectural Home.**

The product’s defining promise is “the house is the hero”. B is the only
direction where the house is simultaneously the visual identity, the primary
navigation and the emotional reason to open the app. It also turns the 3D asset
system into product value instead of a feature buried behind a 2D/3D switch.

Borrow, without mixing styles:

- **From A:** the calm reading order, the room-card clarity, the soft light
  variant as a future **theme**, and the discipline of one accent with amber for
  attention.
- **From C:** the compact, honest status grammar (alert pill, room state bars,
  grouped device rows, tabular numbers) re-skinned in B’s warm palette. Do not
  bring C’s radial hero or cyan identity into the primary direction.

If the owner prioritises daylight accessibility over identity, A is the fallback.
If Maurice becomes energy/history-centric, revisit C. Neither is the current
brief.

## 8. Design system — Concept B (recommended)

### Typography

| Role | Family | Size / line | Weight | Tracking |
| --- | --- | --- | --- | --- |
| Display | Georgia / Iowan / system serif | 38 / 44 | 500 | −1.4 |
| Section | Georgia / serif | 24 / 30 | 500 | −0.6 |
| Card value | Georgia / serif | 24 / 30 | 500 | −0.6 |
| Body | system sans | 14 / 20 | 400 | 0 |
| Control | system sans | 13 / 18 | 600 | 0 |
| Metadata | system sans | 11 / 15 | 500 | 0 |
| Eyebrow | system sans | 9 / 12 | 800 | +1.8, uppercase |

Serif is reserved for the home name, section titles and large device states; it
never sets body copy or controls.

### Colour

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#0B0E12` | Screen |
| `surface` | `#12171D` | Cards, nav |
| `elevated` | `#171D24` | Sheets, raised rows |
| `text` | `#F5F0E8` | Primary |
| `muted` | `#A29A8F` | Secondary |
| `faint` | `#8A8177` | Metadata (still ≥ 4.5:1 target at 11 px) |
| `accent` | `#D7AA6B` | One active/brass accent |
| `success` | `#91BFA1` | Confirmed / quiet |
| `warning` | `#E1A65B` | Attention / unlocked |
| `danger` | `#E07A86` | Danger only |
| `border` | `rgba(255,255,255,0.09)` | Hairline, never decoration |

Status is always text + dot/icon; colour alone never carries the meaning.

### Layout and components

- Spacing: 4, 8, 12, 16, 20, 24, 32; screen margin 16–20; card padding 14.
- Radii: 28 hero, 22 cards, 11 icon wells, 999 pills.
- Hero: 360 px at 390 × 844, 2D fallback, one floor at a time, no duplicate
  renderer.
- Header: brand + simulated/demo pill, date, serif home title, one status line.
- “Now”: two large control cards; one supported toggle, read-only states clearly
  labelled.
- Rooms: horizontal architectural cards (mini plan, name, state, count).
- Elsewhere: grouped reading rows; no invented controls.
- Floating nav: Home, Rooms, Plan, Settings; opaque surface, bottom fade,
  48 dp targets, focus-visible ring on web.
- Motion: 180 ms toggle spring; 300 ms hero/section fade; 12 px card press
  translation; nav crossfade. Reduced motion applies final states immediately,
  and the scene never animates continuously.

### Accessibility and truthfulness

- 48 dp minimum targets; 200% text layouts verified before migration.
- Contrast: 4.5:1 for body/metadata, 3:1 for large display; the faint token is
  the first thing to re-measure on a real device.
- Status vocabulary: confirmed, read-only, attention, unavailable, loading,
  failed — never a colour-only chip.
- Demo/simulated is always visible in the header and in any public capture.
- Hero failure keeps the 2D plan, room list and navigation usable.
- No personal geometry, device names or credentials in published screenshots;
  public captures use the sample only.

## 9. Implementation plan (analysis written for B; C was selected)

> The plan below was written for the analysis recommendation. The owner chose C; §11 records the
> C P0 migration actually implemented and the C-specific P1/P2 remaining work. Reuse the *structure*
> of this plan, not B's hero.

### P0 — visual foundation

1. Add `src/theme/premium.ts` with B tokens; keep existing `theme.ts` for
   unmigrated screens during the transition.
2. Build shared primitives: `PremiumHeader`, `StatusLine`, `Pill`, `GlassButton`,
   `Toggle`, `SectionHeader`, `BottomNav`, `HeroShade`, `RoomCard`.
3. Rebuild Home composition: header → hero → Now → Rooms → Elsewhere; remove
   the readings count from Home and move technical coverage to Diagnostics.
4. Hero: reuse `CockpitSceneView` with saved placements and public-sample
   fallback; overlay caption/Open plan; 2D fallback; on-demand frames only.
5. Add the bottom navigation; preserve existing routes/deep links and desktop
   rail. **Navigation is a product decision and needs owner approval.**
6. Acceptance: 390/375/430, safe-area insets, 200% text, 48 dp, keyboard/focus,
   reduced motion, zero idle frames, hero fallback, no public personal data.

### P1 — device experience

1. Room cards/rail with real room status, device counts and selection; room tap
   preserves the current selection/return contract.
2. Device rows and Now cards for supported capabilities; lamp toggle uses the
   existing command facade and shows confirmed/pending/failed/unconfirmed.
3. Read-only states (lock, fridge, climate, feeder) are clearly labelled and do
   not imply control.
4. Loading, cached, unavailable, empty and error states; SessionBanner styling.
5. Replace `DeviceSummaryCard`/`EntityCard` presentation behind the same data
   and navigation logic.

### P2 — premium polish

1. Motion: hero entrance, room focus, toggle spring, list stagger; reduced
   motion parity.
2. Architectural integration: room highlight on the hero, camera focus, optional
   light theme derived from A.
3. Performance: Pixel/Seeker budgets for the hero; no second renderer; screenshot
   diff CI for 390/430 and desktop.
4. Final accessibility audit: TalkBack, 200% text, contrast, large-home room rail.

### Risks

- The live 3D hero must not violate the existing lifecycle/performance contract;
  the 2D fallback is mandatory.
- Dark warm surfaces need measured contrast, especially the 11 px metadata.
- The C bottom bar is Home-only in P0. Hosting it in the workspace shell for all
  destinations is P1; safe areas and TalkBack are not yet native-verified.
- The serif/brass identity must stay consistent; do not mix A's light cards or
  C's cyan into the primary theme.
- The public prototype uses the sample; a production hero must use the profile's
  saved plan without leaking it into captures.

## 10. Deliverables and evidence

- Prototypes: `src/prototypes/ui-redesign/` (`ConceptA`, `ConceptB`, `ConceptC`,
  `data`, `parts`).
- Harness: `app/ui-redesign.tsx`, env-gated and unlinked; retained for side-by-side reference,
  never part of production navigation.
- Screenshots: `artifacts/ui-redesign/` — `current-home.png`,
  `current-home-3d.png`, `concept-a.png`, `concept-b.png`, `concept-c.png`,
  `concept-{a,b,c}-lower.png`, `comparison.png`, `home-cockpit-p0.png`,
  `home-cockpit-p0-1440.png`, `home-cockpit-p1.png`, `rooms-cockpit-p1.png`,
  `plan-cockpit-p1.png`, `settings-cockpit-p1.png`, and `verify/` at 375/430.
- The current Home and all prototypes use demo/public sample data only.
- The exploration added no production migration; after approval, the C P0 and P1 slices changed the
  production Home/theme and workspace navigation (see §11). No dependency was installed and no
  commit was created.
- The in-progress 3D/furniture work in the working tree was preserved and is not
  part of this design approval.

## 11. C P0 + P1 + P2 migration — implemented 2026-10-28

The owner selected C. P0 built the visual foundation; P1 extended it across the main destinations;
P2 adds a compact architectural preview and reduced-motion-aware native entrances.

### What changed

| Area | Change | File |
| --- | --- | --- |
| Tokens | Near-black stage, cyan/mint/amber semantics, larger card radius, tabular values | `src/theme.ts`, `src/components/ui.tsx` |
| Home header | Home name, one status line, alert pill; the exact demo label remains for the public checks | `src/screens/HomeScreen.tsx` |
| Home pulse | Real room/device/alert counts, up to six room segments, room list, cached state never green | `src/components/home/HomePulse.tsx` (new) |
| Quick filters | Lights/Climate/Security/Rooms category filters over the existing visible summaries; counts are device groups | `src/screens/HomeScreen.tsx` |
| Room rail | Existing room-selection tabs restyled as cards with device/alert counts; same accessibility names and selection logic | `src/screens/HomeScreen.tsx` |
| Mobile navigation | Home/Rooms/Plan/Settings bottom bar on compact Home; desktop rail unchanged | `src/components/home/HomeTabBar.tsx` (new) |
| Plan card | Existing `HomePlanOverview` restyled/compacted; all floor, 2D/3D and room controls preserved | `src/components/HomePlanOverview.tsx` |

P2 additions:

| Area | Change | File |
| --- | --- | --- |
| Architecture preview | Compact static SVG floor-plan preview above the pulse on compact Home; opens Plan; no second 3D renderer | `src/components/home/HomeArchitecture.tsx` (new) |
| Motion | Fade/translate entrance for the preview and cockpit top, with reduced-motion final state; quiet press-scale feedback on quick tiles and room cards | `src/components/home/FadeIn.tsx`, `useReducedMotion.ts` |
| Web stability | Entrance motion is native-only so the public screenshot recette stays deterministic; web keeps immediate final states and press feedback | `src/components/home/FadeIn.tsx` |

P1 additions:

| Area | Change | File |
| --- | --- | --- |
| Workspace navigation | Bottom bar moved to the root shell; visible only on Home/Rooms/Plan/Settings (hidden on detail, auth, diagnostics, lab) | `src/components/MainTabBar.tsx`, `app/_layout.tsx` |
| Bar state | Pure `mainTabFor(path)` selection helper with tests | `src/components/shellNavigation.ts` |
| Attention | Compact warning surface; “About these readings” removed from Home | `src/screens/HomeScreen.tsx` |
| Coverage explanation | Moved to Diagnostics | `src/screens/DiagnosticsScreen.tsx` |
| Quick actions | Real values: Lights on/off, Climate primary value, Security alerts, room count | `src/screens/HomeScreen.tsx` |
| Device cards | Compact C surfaces (smaller padding, icon, value) | `src/components/DeviceSummaryCard.tsx` |
| Content clearance | Bottom padding on Home, Floor plan, Entities and Settings for the bar | those screens |

Not changed: `SessionManager`, preferences, command facade/scheduler/tracker, HA protocol,
existing navigation targets, 3D scene/lifecycle. The existing uncommitted 3D and furniture work is
preserved.

### Evidence

- `npm test`: **1015 tests / 75 suites pass.**
- `npm run check:ui`: **passed at 320/430/768/1440**, including no horizontal overflow, 48 px
  targets, room selection, plan/2D/3D, marker focus, keyboard power and direct routes.
- `npm run check:spatial-ui`: **passed** after P1 (one renderer, lifecycle, marker and fallback
  checks included).
- TypeScript, ESLint and Prettier pass.
- Measured C contrast: muted 7.9:1, faint 4.8:1, accent 11.9:1, warning 10.7:1.
- Clean public-sample captures: `home-cockpit-p0.png`, `home-cockpit-p0-1440.png`,
  `home-cockpit-p1.png`, `rooms-cockpit-p1.png`, `plan-cockpit-p1.png`, `settings-cockpit-p1.png`,
  `home-cockpit-p2.png`. Screenshots inspected; no page errors, no external requests, no physical
  service calls.
- **Built, installed and observed on the Seeker**: a local release APK (debug-signed, built from the
  dirty tree, package `com.larrabee.homecockpit`; the device's saved household profile supplied the
  private plan, while the artifact itself bundles the public sample) shows the real household pulse
  and attention counts, real quick values and the persistent bar across Home → Rooms → Plan →
  Settings. This is a local observation, not a named trial or acceptance. The device profile is
  private; do not share observed captures or the installed state. No private capture is committed.
- **P2 native build:** the release APK built successfully after P2, but the Seeker disconnected
  before installation; P2 native motion/preview is therefore **not device-observed**. The earlier
  P1 release was observed on the Seeker. The P2 web screenshot and automated checks are the current
  evidence.
- Maturity: **Implemented + Automated**; P1 was **Built/Installed/Observed** on the Seeker before
  the P2 build. Not a named candidate; TalkBack, 200 % text, iOS safe areas, native P2 motion and
  native performance are not accepted; no commit was created.

![Home after the C P2 migration](../../artifacts/ui-redesign/home-cockpit-p2.png)

![Rooms with the shell-hosted bar](../../artifacts/ui-redesign/rooms-cockpit-p1.png)

![Plan with the shell-hosted bar](../../artifacts/ui-redesign/plan-cockpit-p1.png)

### Trade-off and remaining work

- **House prominence:** C is status-first; the house is one tap away via Plan and the existing plan
  card. This trades some of the “house is the hero” emphasis recommended in B. The owner chose that
  trade-off. P1 should add a compact architectural preview to the pulse area so the house is present
  without returning to a full hero.
- **P1/P2 visual work is done.** Still acceptance-grade: 200 % text, TalkBack/large fonts, iOS
  safe-area verification, native reduced-motion behavior and native performance.
- **Remaining P2:** optional light theme, screenshot-diff CI and a native P2 install/observation
  (the Seeker disconnected before that install).

### How to view

```sh
EXPO_PUBLIC_UI_REDESIGN=1 npx expo start --web --port 8090
# prototypes: /ui-redesign?concept=a|b|c
# production P0 Home: /
```

**C is selected; P0–P2 visual layers are implemented. Accessibility acceptance and the remaining P2 gates follow.**

## Decision record

The owner selected **Concept C** on 2026-10-28. The architectural decision is recorded as **ADR-18**
in [`docs/architecture/decisions.md`](../architecture/decisions.md). The design analysis still
recommends B for house prominence; C was chosen for status scanability and consumer-electronics
identity. The P0 implementation preserves the existing data, command, navigation and 3D contracts.
