# Attention policy — U04

Implemented 2026-10-15 in the working tree after P03/P04. This is a reading-level policy, not a physical-device health certificate. [Project status](../README.md) owns current delivery; [U03](device-summaries.md) now groups related readings without changing their meaning.

## Contracts

- `assessEntity(entity, ready)` in `src/core/policy.ts` returns `condition`, `ruleApplied`, `explanation` and an optional `binaryLabel`. Existing `getCondition(entity, ready)` delegates to it. No network, persistence, clocks, names or vendor guesses enter the policy.
- Quality takes precedence: any non-ready session → stale; HA unavailable → unavailable; HA unknown/empty → unknown. A stable old value is not automatically stale. Fresh HA/registry metadata is not proof of a recent physical-device poll.
- `primaryValue` reuses the binary labels. Home cards, details and 2D markers consume the same conditions; details explain the interpretation. Amber marks uncertainty/attention, red marks alerts, and unavailable/cached values are muted. Text carries the meaning independently of color.
- `attentionSummary(snapshot, preferences, ready)` in `core/selectors.ts` applies the existing visibility/disabled rules globally. It returns attention items and assessed/unassessed reading counts. Room filters never narrow household attention. Alerts sort first, then reported attention, unavailable readings and unknown interpretations. It does not merge devices or return a whole-device healthy flag.
- A valid observed reading outside an attention rule is retained, not promoted to evidence of health. Uninterpreted textual sensor/enum states are unknown with an explanation, even when a vendor calls them `normal`, `low` or numeric enum codes. Numeric measurements without a configured rule remain neutral readings. Unknown binary classes show On/Off rather than an invented Clear/healthy label.

## Default rules

The polarity and labels follow Home Assistant's [binary sensor device classes](https://www.home-assistant.io/integrations/binary_sensor/). Severity is Maurice's product policy.

| Input (domain / declared device class)      | Attention/alert                                                 | Other valid state                       |
| ------------------------------------------- | --------------------------------------------------------------- | --------------------------------------- |
| `binary_sensor` / `problem`                 | on → attention, Problem reported                                | off → normal, No problem reported       |
| `binary_sensor` / `connectivity`            | off → attention, Disconnected                                   | on → normal, Connected                  |
| `binary_sensor` / `battery`                 | on → attention, Low battery                                     | off → normal, Battery not low           |
| Door/window/opening/garage door/binary lock | on → attention, Open/Unlocked                                   | off → normal, Closed/Locked             |
| Smoke/carbon monoxide/gas/safety            | on → alert                                                      | off → normal for this indicator         |
| Moisture/tamper                             | on → attention                                                  | off → normal for this indicator         |
| Motion/occupancy/charging                   | on → activity                                                   | off → neutral; no health rule applied   |
| Lock entity                                 | jammed → alert; open/unlocked → attention; transitions → active | locked → normal; other states → unknown |
| Numeric battery sensor                      | 0–20% inclusive → attention                                     | above 20–100% → normal for this reading |

For numeric battery sensors, HA specifies [percentage units](https://developers.home-assistant.io/docs/core/entity/sensor/#available-device-classes). Maurice accepts only finite decimal numbers in 0–100 with unit `%`; missing/wrong units, malformed numbers and words are not coerced into percentages. **20% is an explicit app default**, not a manufacturer fault threshold. Household-specific thresholds remain later work.

No Petlibro health-policy adapter is added: H01 has not verified what its proprietary battery status means with the actual power/backup-battery setup. The reported value remains visible with a meaning-not-assessed explanation. No food dispensing, schedule change or other device service was used to diagnose it.

## Coverage and handoff

Home says **No issue detected by the available attention rules**, accompanied by assessed/visible counts and the exclusion of hidden entities. An empty home says there are no visible entities to assess. Offline coverage is unknown and attention items are suppressed under the existing session-level notice. One connected member of a multi-entity device does not erase a missing or unavailable member.

U03 reuses these assessments for each eligible member and retains partial/uninterpreted coverage in summaries. Its verified role presenter formats feed times/quantities; it does not add battery/power or whole-device health rules. Extend the policy with a narrowly verified adapter when H01 supplies evidence; never put model-name or translated-entity-name guesses in a screen. Generic problem/connectivity/battery rules do not close H01's hardware semantics gate.

## Verification checkpoint — 2026-10-15

- **192 repository tests / 19 suites pass**, including polarity/labels, battery boundaries and malformed values, missing classes, enum/vendor ambiguity, lock transitions, availability/offline precedence, old timestamps, partial-device coverage, hide/disabled rules, global room-filter behavior, details and cached placement markers.
- TypeScript, lint, configured formatting and public-sample web/Android Hermes exports pass. Exports are not a standalone APK.
- Chrome public demo passes coverage display, global attention under a room filter, shared binary labels and detail explanations, with no overflow at 320/430/768 CSS pixels and no page errors.
- Seeker native smoke: current JavaScript in the installed development client reconnects to the saved HA profile and renders the assessed/visible coverage text. No phone credentials or spatial preferences were changed.
- Fault polarity and ambiguity cases use synthetic fixtures. Native physical sensor changes, proprietary Petlibro interpretation, TalkBack, iOS, S01 performance and standalone acceptance remain unverified by this checkpoint.

The 2026-10-16 U03 checkpoint passes 215 tests / 21 suites and real-device summary navigation on Seeker, preserving this policy. See [U03 evidence and limits](../stage0/device-summary-validation.md).

Browser workflow evidence is recorded in [project status](../README.md#latest-verification-checkpoint). Private artifacts stay under ignored `.local/house-validation/`; shared fixtures and exports use the public sample.
