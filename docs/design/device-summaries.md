# Physical-device summaries — U03

Implemented 2026-10-16 in the working tree after `45df8a4`. This is a read-only presentation layer over existing HA observations, not a new device registry, health policy or preference schema. See [validation](../stage0/device-summary-validation.md) and [project status](../README.md).

## Ownership and identity

`src/core/deviceSummaries.ts` derives groups from the current `HomeSnapshot`, profile preferences and session readiness. Only actual `entity.deviceId` membership joins readings. Entities without a device remain standalone cards; absent device metadata never justifies grouping by name or guessing a model. A group needs at least one eligible observation to appear.

Group view identities include the active profile and device ID. They are not persisted. Favorites, visibility, room overrides and P04 placements still reference entity stable keys through the existing alias reconciliation. No preference migration is needed. A renamed entity stays attached to its device; a recreated registry identity is not automatically the old favorite.

Home represents eligible favorite members with one full device card, ordered by the first favorite member. In the whole-home view that full card appears only in Favorites; a selected room still shows it. Global attention may separately link to a relevant member. Standalone favorites keep their individual cards. Hidden and disabled members cannot create a favorite summary.

Room resolution remains app override → entity area → device area → Unassigned. Members assigned to different rooms stay one physical device labeled **Multiple rooms**. The summary appears once in the whole-home list and in each relevant room filter. It never rewrites assignments to make the UI simpler. Device counts and reading counts are separate.

## Coverage and presentation

`src/core/devicePresentation.ts` formats the generic summary and delegates every member's interpretation to U04's `assessEntity`. The shared attention ordering chooses the most serious issue for the card. A connected member never makes missing, unavailable or uninterpreted members healthy. Qualifiers retain cached observations, partial availability, unknown interpretation, known issues, missing observations and stale/missing registry metadata. Coverage counts describe eligible readings assessed by rules, not the health of the complete appliance.

Missing-reading counts use supported, visible, enabled registry members without observations. Unsupported HA domains do not become missing telemetry. Registry-only devices do not receive invented state cards. When model or role metadata is absent, generic readings remain accessible; no role is inferred from a translated display name or an entity suffix.

Generic cards show the sole reading, or a known lock/climate/fan primary reading when available, with a small set of supporting values. Details expose the summary and an explicit **Show all N readings** action. Every eligible member opens its existing stable-key observation detail, including raw attributes and provenance. The detail can return to its physical device.

## Verified Petlibro presentation

`src/core/devices/petlibro.ts` isolates the first model-specific presenter. The installed community integration **1.2.32**, actual HA registry metadata and normalized backend observations were checked read-only. The presenter requires manufacturer PETLIBRO, model PLAF103, registry platform `petlibro`, matching registry UUID/entity ID/device ID and the declared HA domain/device class.

| Registry translation key        | HA kind                      | Display role            |
| ------------------------------- | ---------------------------- | ----------------------- |
| `last_feed_time`                | sensor / timestamp           | Last reported feed      |
| `next_feed_time`                | sensor / timestamp           | Next announced feed     |
| `today_feeding_quantity_weight` | sensor / weight              | Reported today          |
| `online`                        | binary_sensor / connectivity | Connectivity            |
| `last_feed_quantity_weight`     | sensor / weight              | Last reported quantity  |
| `next_feed_quantity_weight`     | sensor / weight              | Next announced quantity |

A role requires exactly one eligible match. Missing or ambiguous roles show **Not reported**; no matches select the generic presenter. Future integration/model changes must preserve this fallback until verified.

Timestamps use the phone's local timezone and locale. Missing, numeric or malformed timestamps do not become invented feed dates. An elapsed next-announced time remains a manufacturer report with an explanation in details. Quantities require a finite nonnegative decimal and a recognized weight unit; zero remains zero and unverified units stay qualified.

These values report what the manufacturer announced or recorded. They do not confirm the pet ate or that a recent physical poll occurred. This presenter adds no Petlibro battery/power interpretation; those semantics remain H01 work under the [attention policy](attention-policy.md).

## Navigation and future extensions

`DeviceSummaryCard` opens `app/appliance/[id].tsx` with a profile parameter. `DeviceSummaryScreen` checks that profile and current visible membership on every render. `services/deviceNavigation.ts` revalidates delayed callbacks against the current profile, aliases and visibility before navigation. Removed or entirely hidden devices render an unavailable state. Entity details remain at `app/device/[key].tsx`; no new route replaces P04 placement keys.

Keep future model adapters pure and evidence-based. The backend owns observations and recovery; native code owns presentation, navigation and future commands. S02 must reuse the existing stable-key placement path, not persist summary view IDs. Controls, dispensing, schedules, images, a device-favorite schema, list virtualization and broad accessibility acceptance are separate tickets.
