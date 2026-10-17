# Offline simulated commands — C04

Implemented in the working tree on 2026-10-16, after [C01 validation](commands.md), [C02 observed outcomes](command-outcomes.md) and [C03 scheduling](command-scheduling.md). The offline backend now accepts supported simulated services. C07a now adds [scoped switch UI](switch-controls.md); no household device was actuated for C04. Existing `Demo home` provenance and the demo profile remain visible.

## Ownership and dispatch

`SessionManager` still constructs `new DemoBackend(sessionId)` for the demo profile. No manager, scheduler, facade or tracker behavior changes in C04. Screens must use `commands` from `services/runtime.ts`; they must not import `DemoBackend` or choose a scenario.

| Module                                                | Responsibility                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `session/demo/fixtures.ts`                            | Public initial entities, registry UUIDs, devices, areas and Petlibro reading roles                 |
| `session/demo/services.ts`                            | Closed descriptor decoder and code-free simulated effects                                          |
| `session/demo/DemoBackend.ts`                         | Authoritative in-memory state, observation publications, injected clock/scenario and timer cleanup |
| `session/demo/__tests__/commands.integration.test.ts` | Actual manager/facade/scheduler/tracker acceptance, injecting only backend constructor options     |

The decoder accepts exactly the existing C01 projections: lock `lock`/`unlock`/`open`, climate `set_temperature`/`set_hvac_mode`, fan `turn_on`/`turn_off`/`set_percentage`/`set_preset_mode`, and switch `turn_on`/`turn_off`. It requires one existing entity in the matching domain and rejects extra fields, generic HA services, array targets and non-record payloads. The shared validator then checks availability, declared capability, limits, modes and step. There is no network client, socket, service forwarding, feeder actuation or camera request.

Optional lock code is validated as a nonblank string and immediately discarded. The simulated lock cannot certify a real PIN format. Intent projection copies allowed values only. Timer closures are created in a separate method that receives only entity ID, code-free intent and copied scenario; original service payloads never enter retained simulation state, pending records or diagnostics.

## State, observations and lifecycle

Fixtures are created once per backend. Accepted transport responses do not change observed values. A separate effect timer patches the addressed entity and publishes a mapped snapshot; attribute-only changes update `last_updated` while preserving `last_changed`. Reuse the previous mapped entities for structural sharing.

The 12-second foreground tick changes only the thermostat's simulated current temperature. It preserves target temperatures, HVAC mode, fan settings, lock/switch states and fixed feeder readings. It no longer flips a side door or manufactures new feeding times. Periodic and service publications retain the synchronization epoch and unchanged entity timestamps. Thus a thermostat tick cannot satisfy the fresh-observation fence for an uncertain lock.

Refresh, recovery and foreground publish a full authoritative snapshot with a new epoch, between `synchronizing` and `ready`. That can provide fresh reconciliation evidence but sends no command. Command changes survive these operations within the session. Background pauses periodic telemetry and rejects new direct service calls; already-sent effect/acknowledgement timers remain eligible to finish, as C03 requires. Foreground never recreates their service calls.

`open` emits `opening`, then `unlocked` 900 ms later. Its return timer checks the exact raw entity revision so it cannot undo a newer lock effect. C02 retains this transient evidence even when acknowledgement arrives after `opening` ends.

`stop()` is final for that instance: clear every timer, resolve unresolved acknowledgements as `unknown(connection_lost)`, and suppress all later snapshots/recovery/start attempts. A replacement backend starts from public fixtures; simulated observed state and commands are not persisted across disconnect/restart. Stable registry keys, device grouping, area IDs and feeder roles remain compatible with U03/P03/P04/S02. Only the side door's Open capability and the fan's `normal`/`sleep` presets are added to the public fixture.

## Deterministic acceptance options

`DemoOptions` is a constructor injection, with no route, preference, diagnostic control, random failure or scenario button:

- `clock`: `now`, `setTimeout`, `clearTimeout`; defaults to the app clock. Inject the same advancing time source for observations and timers.
- `scenario({entityId, intent, sequence})`: immutable, code-free request, returning an acknowledgement kind, acknowledgement delay and independent observation delay. `null` observation means no effect. Defaults: accepted after 120 ms, effect after 450 ms. Delays must be finite, nonnegative and at most 600,000 ms; invalid/throwing scenarios reject without scheduling an effect.
- `initialState`: override state/capabilities on existing simulated entities for acceptance; it cannot create registry identities or alter the plan. Production uses the default fixtures.

Scenario acknowledgement kinds are `accepted`, `rejected`, `timeout` and `connection_lost`; the last two map to transport `unknown`. A rejection may still accompany an observation, and an unknown result may reconcile a later effect. Neither status promises that no effect occurred. Timing and outcomes are deterministic; these fixtures do not model proprietary device behavior.

## Verification — 2026-10-16

- **526 tests / 30 suites** pass, including **84 new C04 cases**: 57 backend cases and 27 real-manager integration cases. Existing C01–C03, UI, identity, preferences and spatial tests remain passing.
- Backend cases exercise every supported service, exact entity isolation, malformed/unsupported payloads and capabilities, unavailable observations, quantization, timestamps/epoch, persistence through ticks/refresh/foreground, feeder identities/roles, transient Open, injected clocks, stop cleanup and code non-retention.
- Integration cases exercise acknowledgement before/after observations; rejection with effects; unknown/late reconciliation and deadline expiry; all semantic categories; continuous debounce/serialization; `queued.completion` resolving to `started`, `no-op`, `refused` or `cancelled`; lock freshness; foreground/background; invalid prepared targets; replacement and no replay. The real HA backend constructor is forbidden in these tests.
- TypeScript, ESLint and the configured Prettier check pass. The existing loopback protocol proof still passes its official-client recovery/mapping/outcome/C03 checks with **18 fake services** and no configured HA connection.
- Public-sample web and Android Hermes/DOM exports pass. These are bundle checks, not a new APK or phone interaction acceptance. S02's [pending Pixel acceptance](../stage0/spatial-view-validation.md) remains open.

## C07a handoff

C07a UI is now implemented; [current architecture and acceptance gates](switch-controls.md) supersede this implementation handoff. The original bounded scope follows. Implement only the first switch control in the existing entity-detail flow; [backlog C07a](../BACKLOG.md#c05--c06--c07--controls-one-small-change-each) owns the ticket. Keep the scene selection-only. Reuse `getCapability`, `assessEntity`, runtime `commands.setSwitch`, the transient `commandStore`, `latestCommand` and `visibleCommand`; never store optimistic physical state in a component. Capture the current manager target for an interaction, and handle `refused`/`no-op`/`started` explicitly. A switch does not use the continuous queue. C03 can refuse another action while it is sending or accepted, even when the service acknowledgement has already settled.

Subscribe with narrow selectors. Render the observed on/off/unknown value separately from sending/accepted/confirmed/failed/unconfirmed wording. Demo outcomes must explicitly remain simulated, including rejection wording; the existing tracker's generic error text mentions HA, so choose appropriate demo presentation without putting raw backend messages on screen. Disable interaction on cached/non-ready/background/unavailable/disabled/unsupported observations. A dismissed outcome does not grant dispatch eligibility. Do not expose unrelated switch entities such as the demo fridge's power-cool actuator as verified household integrations.

Use C04 constructor injection for component/integration acceptance of success, failure and unconfirmed states; keep injection out of the runtime UI. Test rapid taps, readiness/profile changes, disconnect mid-action, unknown with late observation and no replay after reconnect/restart. Add accessibility labels, busy state and touch targets consistent with existing native components. No lock, climate, fan, feeder or camera control in this slice.

After fixture/component checks, validate the installed app in demo. Then obtain explicit authorization for the concrete Kasa lamp action and verify it physically against observed HA state; record which device was checked and the result. Existing read-only Kasa evidence does not certify actuation. If hardware cannot be accepted, leave its control disabled and record the remaining gate. Preserve S02's separate Pixel gate, the existing WIP and private household configuration. Update current docs and the next-agent prompt from the actual final scope.
