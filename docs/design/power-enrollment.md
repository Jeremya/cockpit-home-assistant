# M01 — scoped household power control

Implemented on 2026-10-19. This replaces C07a's model-global Boolean with explicit, default-denied enrollment. Physical household acceptance remains separate from source, public fixture and phone acceptance; see the [validation ledger](../stage0/power-enrollment-validation.md).

## User flow

Home → device summary exposes the unique primary switch directly: its reported On/Off value, the existing `SwitchControl`, and independent request outcomes. After enrollment this is two presses from Home to a power request. No nested press targets or service calls are added to cards or the 3D scene. Individual readings remain available. A device with several main switches has no guessed primary; names, favorite order and hiding a sibling cannot select one.

A verified Kasa offers **Allow power control**, a cancelable review naming the device, then **Allow this device**. The review explains that the connected load must be safe to switch and that granting permission sends no request. **Revoke power control** is also available offline. Revoking blocks future requests; an already-sent request may still take effect.

## Stored permission and migration

`PreferencesFile` is now schema **3**, still under the existing `prefs` key. Ordered v1 → v2 → v3 migration preserves every profile, spatial plan, unresolved reference and ordinary preference. The v2 → v3 step initializes `switchEnrollments` to `{}` even if old data contains an undeclared field with that name. Existing households are never automatically enabled.

A grant binds the profile, exact stable entity-registry key, physical device ID, `tplink` platform, TP-Link manufacturer, exact HS103/HS103(US) model and switch capability. Entity IDs may be renamed within the same stable binding; a recreated UUID needs a new grant. Grants never follow aliases and are separate from favorites, placement and visibility. Storage validates and allowlists every field. Generic `updatePreferences` preserves grants; dedicated manager methods own changes.

## Shared enforcement and lifetime

`commands/switchControl.ts` owns identity scope, exact binding comparison, permission selection and pure `primarySwitch`. Real eligibility requires a main enabled/unhidden switch, a unique matching registry entry and device membership, fresh entity/device metadata and the exact grant. The closed public demo lamp needs no household grant; other demo switches and vendor devices remain outside this slice.

`SessionManager` applies the same rule at facade entry, send time and after `CommandTracker.begin()` can synchronously notify subscribers. It uses its authoritative command snapshot, current profile/preferences and foreground/readiness checks. A delayed enrollment review also compares the manager-captured physical binding against the current one.

Grant/revoke invalidates prepared targets and unsent scheduled work **before** publication. A pending grant is unusable until its save completes. Failure removes that grant and reports the error. Revocation takes effect immediately; a failed revocation write explicitly warns that the denial is session-only and must be saved before restart. It does not claim a failed disk write was durable.

Preference and snapshot-identity writes are queued before store publication. A synchronous subscriber's subsequent revocation therefore wins both in memory and in serialized storage. Completing a grant rechecks the final current binding after notifying subscribers. C02 outcomes, C03 serialization and no-replay behavior are reused, with no optimistic entity state or background command retry.

## Fixture and verification boundaries

`node scripts/trial-ha-fixture.mjs 18123 --power-proof` explicitly enables simulated HA power for the single public `switch.trial_plug`. It remains loopback-only, accepts only its public token, never forwards a request, and rejects other entities, domains, services and nonempty service data. Without the flag, all services remain rejected as in R03a. `powerAccept`, `powerObserve` and `powerOn` can be set through its bounded fixture configuration endpoint to exercise refusal, unconfirmed outcomes and independent reports.

The public smoke now uses the direct summary actions at 320/430/768, preserving the original focus-return assertions, isolated installs, source-map guard and sample-only provenance. Only the reviewed smoke-script hash changes in the R01 exception policy; package versions, affected graph, rationale and 2026-11-02 expiry are unchanged. Public distribution still requires strict audit closure.

Automated tests cover another HS103/profile, recreated and aliased identities, stale/changed metadata, pending/failed persistence, offline revocation/restart, reentrant grant/snapshot/sending revocation, canceled reviews and ambiguous primary selection. A fresh named APK must then pass Pixel UI/persistence/recovery checks. Physical Kasa Off/On acceptance requires the user's explicit authorization for that moment, the exact target/load, initial-state restoration and a recorded physical observation. No feeder, lock, climate or fan control is added.
