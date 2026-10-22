# B — shared detail content and desktop panel validation

Append-only ledger for agent B's lots, as defined in the [parallel handoff](../handoff/parallel/B-detail-panel.md). Each lot records its own source, checks and limits; later lots do not rewrite earlier results. Every check here uses the public sample or test fixtures. No household credential, private geometry or physical service is involved.

## B01 — extract the detail contents without changing navigation — 2026-10-22

Base: `0733657` (handoff on top of `e52ac06`), branch `work/detail-panel`.

### What changed

The two detail screens are now route adapters. Each reads its route parameters and owns the only ScrollView; the summary adapter also measures the width its content actually receives. The contents live under `src/components/details/`:

| API | Contract |
| --- | --- |
| `DeviceSummaryContent({ profileId, deviceId, width, onOpenReading? })` | Resolves the profile-scoped summary with the existing `deviceSummaries`, `presentDevice` and `primarySwitch` selectors. Keyed by the summary's profile-scoped identity, so expansion never carries over to another device or home. |
| `ReadingDetailContent({ profileId, entityKey, onOpenDevice? })` | Resolves aliases with the existing preferences; shows nothing of an entity when `profileId` is not the current home. Keyed by `[profileId, key]`, so raw attributes opened for A are not shown for B. |
| `detailColumns(width)` | Two columns from **740 px of measured width** (two 360 px columns plus the 20 px gap); one otherwise. Never reads the window. |
| `openDeviceSummary(profile, id, open?)`, `openReading(profile, key, open?)` | Unchanged validation, now followed by an optional opener receiving a typed `DeviceDestination` / `ReadingDestination`. Omitted, they push the same routes and parameters as before. An injected opener is reached only through this validation at the moment of the tap. |
| `EntityCard` `onOpenReading?` | Forwarded to `openReading`; the route stays the default. |

The contents do not read route parameters, push routes, create sessions or own a scroll container. `SwitchControl`/`useSwitchCommand`, favorites, qualifiers, coverage, explicit controls and refusals are moved unchanged; no service call was added. The `device-summary` test ID moved from the ScrollView to the content root, so the existing smoke selectors still apply. `device-summary-columns` and `reading-detail` are new test IDs.

### Behavior differences, stated explicitly

- Summary columns follow measured width instead of `web && window ≥ 1024`. The browser measurement below shows the same arrangement as before at every checked width. Web windows from about 784 to 1023 px (no rail) now get two columns where they previously had one. On native, only a window wider than about 784 dp would change; Pixel and Seeker phones stay single-column.
- The legacy `/device/[key]` route still carries no profile: its adapter passes the current home. Profile-bound reading links are B02's decision.
- Unavailable states now render inside the route's scroll container. The reading route's unavailable message gets the same 880 px reading width as its available state.

### Source checks

- New tests: `DeviceSummaryContent` (11), `ReadingDetailContent` (8) and `DetailDispatch` (2). They cover 0/360/440 px measured widths staying single under a mocked 1920 px desktop layout; 760 px using two columns; injected reading/device openers receiving canonical, validated destinations; default routes unchanged; delayed taps refused after the target becomes hidden, removed or belongs to another profile; the same device ID or entity key in another profile staying unavailable; local expansion and raw attributes reset on target change; and one rendered power control per route, dispatching once.
- Mutation check: letting `EntityCard` call an injected opener without `openReading` fails the three delayed-tap cases; the file was restored.
- Existing `DeviceSummaryScreen`, `DeviceDetailScreen`, `EntityCard`, `SwitchControl` and `PowerEnrollment` suites pass without edits.
- Full Jest: **713 tests / 50 suites** pass (baseline on `0733657`: 692 / 47). TypeScript, lint and `format:check` pass.

### Browser checks

The existing public smoke (`node scripts/check-ui.mjs`, owned by A, run unmodified) **passes** at **320/430/768/1440** on the B01 working tree, including the browser HA fixture: summary power, reading favorites, three marker return-focus cycles and the named-row return per width. It reports zero page errors and external requests, an unchanged developer plan, and closed server/browser. Chromium 156.0.8078.4. The report records `dirtySource: true` against `0733657` because the run preceded this commit. The staged `src`/`app` index hash was identical before and after the run (`8757e5fc…8ab7`), and this commit adds only this ledger to it.

An ad-hoc Playwright check ran on a sample-only export, with external requests blocked. It opens the lamp summary, then a feeder reading, then its parent device:

| Window | Measured content | Columns | Power controls | Summary URL | Reading URL | Parent URL |
| --- | --- | --- | --- | --- | --- | --- |
| 430 | 386 px | 1 | 1 | `/appliance/demo-plug?profile=demo` | `/device/demo-sensor.feeder_last` | `/appliance/demo-feeder?profile=demo` |
| 768 | 724 px | 1 | 1 | same | same | same |
| 1024 (rail) | 756 px | 2 | 1 | same | same | same |
| 1440 | 1156 px | 2 | 1 | same | same | same |
| 1920 | 1156 px | 2 | 1 | same | same | same |

No horizontal overflow, page errors or external requests. The script and export are local scratch files, not a committed runner; B04 adds `scripts/check-detail-panel.mjs`.

### Limits

No native build or device run; native route behavior is covered by the shared component tests only. No panel is mounted yet, and Home, layout, router and renderer are untouched by B01.

## B02 — URL/history/focus prototype — 2026-10-22

Base: B01 `f76a589`. Decision and rules: [detail panel navigation](../design/detail-panel-navigation.md).

### What changed

- `app/index.tsx`, `app/appliance/[id].tsx` and `app/device/[key].tsx` move into the `app/(workspace)/` route group; URLs are unchanged. Its Stack's `layout` is `DetailWorkspace`: pass-through on native; on web it shows Home beside the Stack when the measured workspace fits a panel.
- `src/navigation/detailNavigation.ts`: `DetailTarget`, canonical `detailHref` (always with `profile`), `detailTargetFromRoute` with the bounded legacy binding, `detailLayout` (360–440 px panel, Home ≥ 640 px), focus-origin keys.
- `openReading` now pushes `/device/<key>?profile=<p>`. The reading route binds a legacy link without `profile` to the first home it is shown in. `ReadingDetailContent` never matches a null home.
- Device cards carry their focus-origin id. The prototype panel has a named **Close details** control (`popTo("index")`) and restores focus to the origin card on return to the list.
- `scripts/check-detail-panel.mjs` (B-owned, not wired to `package.json`) builds the public sample in isolation and replays the matrix. The runner arrives in B02 rather than B04 because the history proof needs it; B04 extends it. `scripts/fixtures/detail-panel/expo-router-history.patch` is a **proposed** dependency fix for A. It is applied only with `--with-proposed-router-patch`, inside the disposable staging copy.

### Source checks

- `detailNavigation` (16 tests): panel widths at 800/1056/1216/1696 px workspaces; no width ever squeezes Home below 640 px; hrefs always name the home; routes map only to the home they name; legacy links resolve only in their bound home; incomplete/foreign routes and oversized origin ids are rejected.
- `DetailRouteBinding` (2 tests, written first and seen failing): a reading link naming home A stays unavailable under no home and under home B, then appears for A. A legacy link binds to the first home and stays unavailable after switching to B.
- Seven existing assertions now expect the reading link's `profile` parameter: `DeviceSummaryScreen` ×2, `HousePlanScreen` ×2, `HomeScreen`, `scene`, plus B01's own `DeviceSummaryContent`. A `/house-place` assertion caught by an over-broad edit was restored unchanged. No other test changed.
- Full Jest: **731 tests / 52 suites** pass. TypeScript, lint and `format:check` pass. `test:tooling`: **23 / 23**.

### Candidate comparison

The rejected URL-encoded candidate was measured with a temporary, uncommitted router probe on the B01 flat Stack. The results are in the [decision](../design/detail-panel-navigation.md#rejected-target-encoded-in-homes-url): pushing `/?detail=` duplicated Home (1 → 2 → 3 instances) and recreated the renderer. `navigate`, `setParams` and singular pushes created no Back entry, and the next Back left the app.

### Router defect found and isolated

Diagnosis used temporary probes: root navigation state with keys, history API call logs, and workspace/Home mount counters. None was committed.

- The first history entry is recorded with the **unkeyed** linking state. Back to it regenerates every navigator key, the `__root` key from `stack-1i2m…` to `stack-rHUl…`. The tree remounts; on the prototype, workspace mounts went 1 → 2, Home 2 → 3, renderer created 2 → 3.
- Forward then calls `resetRoot` with a record naming the dead root key. `popstate` arrives, but no state change or `replaceState` follows, and the screen stays on Home.
- **The same sequence fails on the current flat app** (`f76a589` export: Forward shows the URL `/appliance/demo-feeder?profile=demo` with no summary). B02 did not introduce it.
- A second fork defect (`replace()` writes with an index `popstate` never updates) overwrites a forward record after a Back. A second Forward then rebuilds from the path and remounts.
- With both hunks of the proposed patch applied locally, the long sequence (Back ×2, Forward ×2, Back) shows the right content at every step, never recreates the renderer, and returns focus to the card. `node_modules` was restored afterwards; its two file hashes match the original install.

A third issue was in the prototype itself. After a direct link, the anchored `index` received the detail's path params from the installed `getStateFromPath`, so closing produced `/?id=demo-plug`. The workspace now clears the anchored list's params with `replaceParams({})`. Close and the header's “Home, back” link both reach `/`; checked on a local export.

### Browser matrix — `node scripts/check-detail-panel.mjs`

Isolated public sample export (plan provenance `sample`), Chromium 156.0.8078.4, 1440 × 932 unless stated. External requests are blocked and counted. The report records `dirtySource: true` against `f76a589` because the run preceded this commit. The staged `src`/`app`/`scripts` index hash, `af33eb3e…f3c1`, was identical before and after the runs. Reports are in ignored `artifacts/detail-panel/`.

| Row | Installed router | With proposed patch |
| --- | --- | --- |
| Home → feeder → reading: URL `/appliance/demo-feeder?profile=demo` then `/device/demo-sensor.feeder_last?profile=demo`; Home visible beside the panel; 1 Home; renderer not recreated | pass | pass |
| Back → device (panel), Back → list | URL and content correct; **the tree remounts** (renderer created 2 → 3), **focus not returned** | pass: no remount, focus on the origin card |
| Forward → device | not reached (row stops at the failed focus assertion); the same defect ignores Forward, as shown above | pass: summary in the panel, 1 Home, renderer still 2 created / 1 live |
| Lamp → feeder from Home (push), Back → lamp, Back → list | pass | pass |
| Close after device → reading | pass: `/`, focus on the origin card, renderer unchanged | pass |
| Direct link `/appliance/demo-plug?profile=demo` in a new context | pass: unavailable before connection, summary after connecting the demo, Close → `/` inside the app | pass |
| Reload without a session | pass: same URL, no summary; summary returns after connecting the same home | pass |
| Resize 1440 → 430 → 1024 → 1440 with the lamp open | pass: same URL and session; route presentation at 430/1024 (renderer released), panel at 1440 (one new renderer); peak live 1 | pass |
| Kitchen filter while the lamp is open | pass: target and URL unchanged; filter kept after Close; focus falls back to the main region because the lamp card is filtered out | pass |
| Compact 430 px | pass: full-screen detail, Back → Home, no panel | pass |

Totals: **7 of 8 rows** with the installed router, and **8 of 8** with the patch (`08e84113…5605`, staging copy only). Zero page errors and zero external requests in both runs. Server and browser closed. No HA, credentials or services.

Not covered in the browser: another real home with identical IDs. The demo has a single profile, so A/B profile isolation rests on the Jest cases above and in B01. Real 200 % Chrome zoom, keyboard Escape and title focus belong to B03/B04. The `/house` marker → reading → Back path stays on the public smoke below.

### Existing public smoke on the prototype

`node scripts/check-ui.mjs` (A's runner, unmodified) **passes** at **320/430/768/1440** on the same staged tree (`af33eb3e…f3c1`). Its coverage includes the 1440 summary power flow, now shown in the panel; Back to Home; and, per width, three `/house` marker → reading → Back focus cycles plus the named-row return, with readings pushed above `/house` in route presentation. It also passes the browser HA fixture: 2 simulated service calls, 0 physical. Zero page errors and external requests; developer plan unchanged; server and browser closed.

### Limits and handover

- Native: no build or device run. The new group adds one Stack level on Android. Native screens, titles and Back are expected to be unchanged, and the Jest route/content suites pass, but TalkBack return focus and hardware Back must be re-accepted on A03's candidate.
- The panel is a prototype: generic Stack header inside the panel, a plain Close control, focus restored only to device cards (reading/marker origins and title focus are B03). Home still lays itself out from the window width, so at 1280 px its desktop arrangement is squeezed into 696 px. B03 makes Home follow its measured column.
- The router defect is reported to A with this reproducer and patch; adopting a fix is A's decision. Until then, browser Back to the list remounts the tree and loses the focus return, and Forward after it can be ignored. The current app already has the second problem.
