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
