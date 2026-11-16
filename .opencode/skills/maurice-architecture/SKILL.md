---
name: Maurice architecture
description: Use when designing or reviewing a change to Maurice's architecture — session/backend lifecycle, commands and outcomes, preferences and profiles, spatial/plan data, web/Three.js rendering, or when deciding where a new feature belongs. Also use before writing a technical plan or an ADR-style decision.
---

# Maurice — architecture lens

## Runtime in one diagram

```
app/_layout.tsx (boot + foreground)
        │
        ▼
services/runtime.ts ── singleton session / commands / commandStore
        │
        ▼
SessionManager  ◄── credentials (SecureStore | browser auth)
   │      │  └── preferences (schema 3, per profile)
   │      ▼
   │   HomeAssistantBackend ──WS/HTTP──► Home Assistant
   │   DemoBackend          ──simulated─┘
   ▼
zustand useCockpit (observations + status + prefs)
   │
   ├── core selectors/policy/presentation ──► screens & components
   ├── spatial selectors + useHousePlan ────► SVG 2D plan
   └── sanitized props ──► web/Three.js scene (selection callback only)
                           ▲
commands facade ──► SessionManager guards ──► backend.callService
        └── CommandTracker ──► commandStore (transient outcomes)
```

**Golden rule:** observations flow one way; commands flow the other; the two
never share a store.

## Ownership map

| Path | Owns | Must not own |
| --- | --- | --- |
| `src/session/SessionManager.ts` | session lifecycle, backend replacement, generation/profile guards, persistence orchestration, command dispatch gate, enrollment enforcement | UI state, rendering, retry timers |
| `src/session/homeAssistant/` | connection, heartbeat, foreground resync, epoch snapshots, registries, compressed entity stream, URL normalization | command semantics, preferences shape |
| `src/session/demo/` | deterministic simulated backend, demo entities, simulated service effects | real transport, UI copy |
| `src/commands/` | semantic facade, validation, scheduling, observations, outcome tracking, switch eligibility/presentation | transport, screens, raw HA service names outside the mapping |
| `src/core/` | snapshot types, zustand observations, selectors, policy, capabilities, device summaries, presentation | transport, persistence, navigation |
| `src/preferences/` | schema, ordered migrations, allowlisted persistence, default-denied grants | feature UI |
| `src/spatial/` | plan model, sample/private plan selection, per-profile seeding, placements, links, scene projection | HA mutations, command dispatch |
| `src/services/` | composition root, credentials/journal, browser auth, camera image transport, storage, confirmations | feature logic |
| `src/screens/` + `src/components/` | composition, presentation, shared visual language | new stores, direct service calls |
| `src/web/` | Three.js renderer, scene model, camera, marker diffs, disposal | secrets, HA attributes, commands |
| `app/` | thin Expo Router shells | business logic |

## Key contracts (read the source, these are summaries)

- `HomeBackend` (`src/session/types.ts:13`): `start/stop/resync/ping/recover/setForeground`,
  snapshot/status subscriptions, `callService`, `getCameraImageRequest`.
  `ServiceCallResult` = `accepted | rejected | unknown`.
- `CockpitState` (`src/core/store.ts:7`): `initialized`, `profileId`, `mode`,
  `status`, `snapshot`, `preferences`, `preferencesLoadedFor`, `notices`.
- `SessionManager` (`src/session/SessionManager.ts:87`): `bootstrap`, `connect`,
  `disconnect`, `retry`, `refresh`, `setForeground`, `updatePreferences`,
  `allowSwitch`, `revokeSwitch`, `resetSpatial`, `cameraImageRequest`,
  `signOut`, `stopRemembering`, `forget`, plus `commands` and `commandStore`.
- Profile id = `"ha:" + normalizedOrigin`, demo = `"demo"`
  (`session/homeAssistant/url.ts:45`).
- `ProfilePreferences` schema 3 (`src/preferences/types.ts:18`); empty prefs
  deny all power (`switchEnrollments: {}`).
- `HomeSnapshot` carries `sessionId`, `syncEpoch`, identities, registries,
  config and metadata (`core/types.ts:89`).
- Commands: `CommandTarget` is frozen as
  `{profileId, entityKey, entityId, sessionId}`; records live in
  `commands/store.ts`, not in `useCockpit`.

## Invariants (breaking one is an architecture defect)

1. **No optimistic observable state.**
   A command may create a *request record*; only an authoritative snapshot may
   change an entity. Enforced in `commands/CommandTracker.ts:159-186`,
   `commands/store.ts`, `SessionManager.ts:332-337`. The UI keeps the last
   observation until a matching report.
2. **One session owner.** Only `HomeAssistantBackend` decides recovery; only
   `SessionManager` replaces backends and invalidates work. No reconnect timer,
   fetch loop or service call in a screen, card, scene or hook.
3. **Epoch-based, all-or-nothing resync.** A refresh builds a candidate stream
   and commits it only on success; `syncEpoch` advances only after that
   (`homeAssistant/HomeAssistantBackend.ts:415-470,585-607`). A failed refresh
   must leave the committed stream alive.
4. **Identity is stable and guarded.** `entity.key` ≠ mutable `entityId`.
   Dispatch rechecks generation, backend, profile, session, unique key
   resolution and object identity (`SessionManager.ts:168-220`).
5. **Preferences are profile-scoped and loaded-guarded.** No edit before
   `preferencesLoadedFor === profileId` (`SessionManager.ts:726-741`). Plans are
   seeded once and replaced only by an explicit reset (`spatial/profilePlan.ts`).
6. **Permission is denied by default and checked at the last gate.** UI and
   manager share `switchControlRestriction` (`commands/switchControl.ts:100`);
   enrollment is per profile + stable key + device identity, never by model or
   display name. A revoked grant must fail even mid-queue.
7. **No replay.** Pending commands are cancelled on lifecycle/identity change;
   sent commands are never retried (`commands/CommandScheduler.ts`).
8. **Secrets never travel.** Tokens, auth headers and authenticated image URLs
   never reach logs, persisted command records, diagnostics, the scene bridge,
   plan exports or committed fixtures. Camera transport refuses cross-origin
   and HTTPS→HTTP redirects (`services/cameraImage.ts`).
9. **The renderer only renders.** `web/` receives allowlisted marker data
   (`spatial/scene.ts`, `web/sceneModel.ts`) and returns a selection callback.
   It never receives HA attributes, secrets or command dispatch.
10. **The demo is a backend, not a branch in the UI.** Demo mode uses
    `DemoBackend` through the same `SessionManager`, facade and outcome path.

## Where does my change go?

| Change | Put it in | Notes |
| --- | --- | --- |
| New HA transport/recovery behaviour | `session/homeAssistant/` | add protocol proof coverage |
| New command category | `commands/` + `SessionManager` gate + focused UI | validation, scheduler, tracker, permission, tests |
| New derived reading/attention rule | `core/` selector/policy/presenter | pure, deterministic, no UI |
| New persisted preference | `preferences/` | bump schema, ordered migration, deny-by-default, allowlist persistence |
| New plan/spatial behaviour | `spatial/` | keep geometry separate from device state |
| New screen or route | `screens/` + thin `app/` shell | no business logic in route files |
| Shared visual token | `src/theme.ts` | no per-screen palettes |
| Web-only renderer feature | `src/web/` | behind capability check, 2D fallback preserved |
| Browser credential/auth flow | `services/auth/` | page-memory or explicit durable store; never copy tokens across origins |
| Device-specific interpretation | `core/devices/` + pure presenter | verified semantics only, never name heuristics |

## Extension recipes

### Add a control category (e.g. lock)
1. Add the capability predicate and semantic intent in `commands/`.
2. Extend the target validation and service mapping (`serviceCalls.ts`).
3. Add a permission shape to preferences (new schema) with deny-by-default and
   migration.
4. Enforce in `SessionManager` at prepare *and* dispatch.
5. Reuse `CommandScheduler`, `CommandTracker`, outcome copy; no direct calls.
6. Add the focused control component and one entry point (summary first).
7. Tests: wrong device, wrong profile, stale metadata, recreated identity,
   revoked grant, no replay, unavailable target, demo parity.
8. Physical acceptance on a named binary with explicit authorization.

### Add a verified device adapter
- Put semantics in `core/devices/<vendor>.ts`, expose only evidence-backed
  fields, keep uncertainty explicit, add fixtures derived from public shapes.
- Never infer from entity ids or friendly names. Document the payload source.

### Add a screen that edits profile data
- Guard on `preferencesLoadedFor === profileId`.
- Validate plan/identity references before writing.
- Preserve unresolved references for review instead of silently deleting.
- Add restart/persistence coverage, not just render coverage.

### Change the bundled plan
- Remember a connected profile keeps its seeded copy. Updating the bundle is
  not enough; the user needs an explicit apply/reset path with consequences
  explained. Preserve non-spatial preferences.

## Security and privacy boundaries

- Native credentials: SecureStore + serialized journal
  (`services/credentials.ts`); browser: page memory, optional explicit
  remembered session per profile (`services/auth/authStore.ts`).
- Power grants on web require a bound HA principal; a changed/unknown principal
  revokes them (`SessionManager.ts:966-1019`).
- Committed builds and captures use the public sample. A bundle prepared with
  the private plan contains that plan; demo mode does not sanitize it.
- Diagnostics may describe health, never secrets or full payloads.

## Known debt and risks

- **Documentation drift.** Recorded test counts lag the working tree. Quote what
  you ran; don't copy old numbers.
- **U02 measurement gap.** Global subscription and non-virtualised lists are
  unmeasured beyond small inventories. Measure before rewriting.
- **3D lifecycle** is the riskiest browser area: one active renderer, resource
  disposal, hidden/background stop, durable 2D fallback, ≥30 fps interaction.
- **Preferences migration** is append-only in practice; every schema bump needs
  ordered, validated migration and a backup path for newer-version data.
- **Hosting (H02).** HA on a sleeping Mac is an availability risk, not an app
  bug.
- **Dependency exceptions** expire 2026-11-02; strict audit remains a gate.
- **Platform parity.** Browser storage does not validate native SecureStore, and
  native checks do not validate keyboard/focus behaviour.

## Architecture review checklist

- Which invariant could this break? Name the file and the test that proves it.
- Is there a second source of truth, store, permission path or plan copy?
- What happens on: cache, unavailable, auth failure, HA restart, profile change,
  plan reset, revoked grant, app backgrounded mid-command?
- Is recovery still owned by one place?
- Does the change leak a secret or private geometry into an artifact?
- Can the web renderer be replaced or disabled without touching the domain?
- Is the demo path still the same path?
- Is there an explicit rollback?

## Decision record template

```md
# <decision> — <date>
Status: proposed | accepted | superseded
Context: <user problem, evidence level>
Options: <2–3, with the invariant each one bends>
Decision: <one>
Consequences: <migrations, tests, docs, rollback>
Verification: <commands + acceptance scope>
```

Store durable decisions beside the feature contract in `docs/design/`, not in a
chat or a commit message alone.

## Read in this order

1. `docs/README.md` (current status) and `docs/BACKLOG.md` §2 (architecture to
   preserve).
2. `docs/design/commands.md`, `command-outcomes.md`, `command-scheduling.md`,
   `demo-commands.md`, `switch-controls.md`, `power-enrollment.md`.
3. `docs/design/floor-plans.md`, `spatial-view.md`, `desktop.md`,
   `camera-images.md`, `browser-auth.md`, `dependency-policy.md`.
4. `src/session/SessionManager.ts`, `src/commands/facade.ts`,
   `src/core/store.ts`, `src/preferences/storage.ts` and their tests.
