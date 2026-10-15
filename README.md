# Home Cockpit

An Android-first app for viewing a household's devices through Home Assistant. Built with Expo SDK 57, React Native, TypeScript, Zustand and the official HA WebSocket client. Home Assistant owns integrations and device state; Cockpit provides the household interface.

The current app is **read-only**: Home with attention items, favorites and rooms; entity details; connection settings; entity visibility and room overrides; diagnostics. An offline demo home is included. Device controls, camera images and the 3D floor plan are later milestones.

## Current status

Recorded on 2026-10-15:

- 47 tests pass across 8 suites, along with TypeScript, ESLint and formatting checks.
- The configured HA `2026.10.1` instance passes authenticated synchronization, registry loading, ping, fresh refresh, simulated foreground return and forced reconnect: 44 entities and all three registries fresh.
- Protocol tests cover disconnect during the first synchronization, continued updates after a refresh timeout and automatic recovery. No device service calls are sent by either proof script.
- Android native prebuild and Hermes bundle export pass. Installing and running the app on the Pixel 9 remains the next validation step.

The HA checks run under Node on the development Mac. Device integration compatibility, authenticated camera images and Android lifecycle behavior still need validation on the actual hardware. See the [recorded results](docs/stage0/results.md) and [HA proof report](docs/stage0/ha-proof-2026-10-15.json).

## Install and run

Use Node 24 and the locked dependency versions:

```sh
npm ci
```

### Preview the interface

```sh
npm run web
```

Choose **Explore demo home** in Settings. This mode uses simulated data inside Cockpit and requires no HA account. The web preview is for the interface; token persistence uses native SecureStore and is not supported in the browser.

### Run on the Pixel 9

Install Android Studio with its Android SDK and JDK, configure `ANDROID_HOME` and `adb`, enable USB debugging on the phone, then connect and authorize it. Build and install the development client:

```sh
npm run android
```

For later sessions with the client already installed:

```sh
npm start
```

Use the development client for networking and credential validation. Expo Go is not a supported target. iOS runtime validation is deferred.

## Connect Home Assistant

The backend requires **HA 2026.10 or newer**; the tested version is `2026.10.1`. An existing HA instance can be used directly. To run the included local container, start Docker Desktop, then:

```sh
npm run ha:up
```

This seeds `.local/home-assistant/` without overwriting an existing configuration and starts the pinned container on port 8123. Open <http://localhost:8123>, complete onboarding if needed, and create a dedicated Cockpit user. Sign in as that user and create a long-lived access token under **Profile → Security**.

In Cockpit's Settings, enter the HA origin and token. Use the Mac's LAN address on the Pixel, such as `http://192.168.1.20:8123`, with both devices on the same Wi-Fi. `localhost` on the phone refers to the phone. The URL must have no path, query or fragment. For HTTP, enable the trusted local network option; the token is sent unencrypted over that connection.

The included HA configuration enables HA's `demo` integration. These simulated devices exercise the real HA API; they do not prove vendor compatibility. This is separate from Cockpit's offline demo mode.

Container logs:

```sh
npm run ha:logs
```

### Check the configured HA instance

Prepare a local file with owner-only permissions:

```sh
mkdir -p .local
touch .local/ha-token
chmod 600 .local/ha-token
```

Open `.local/ha-token` in an editor, save only the raw token, then run:

```sh
HA_ALLOW_INSECURE_HTTP=1 npm run proof:ha
```

The entire `.local/` directory is ignored by Git; it also contains HA's runtime and authentication data.

| Variable                 | Default                 | Purpose                             |
| ------------------------ | ----------------------- | ----------------------------------- |
| `HA_URL`                 | `http://127.0.0.1:8123` | HA origin to test                   |
| `HA_TOKEN_FILE`          | `.local/ha-token`       | Local file containing the token     |
| `HA_ALLOW_INSECURE_HTTP` | Unset                   | Set to `1` to explicitly allow HTTP |

The proof authenticates, loads a snapshot and registries, pings, refreshes, simulates foreground return and reconnects its own client. It prints version, timing, aggregate entity counts and metadata freshness, excluding tokens, URLs and entity details. Stale registry metadata is reported separately from a successful entity connection. Enter the token separately in the native app's Settings; the proof's local token file is not bundled into the app.

## Development checks

```sh
npm run typecheck
npm run lint
npm test
npm run proof:protocol
npm run export:android
npm run format:check
```

`proof:protocol` runs without HA credentials against a temporary loopback WebSocket server using the real compressed entity protocol and official client. `proof:ha` tests a configured HA instance with the local token. Neither proof replaces Pixel/Hermes runtime validation.

`export:android` produces a Hermes JavaScript bundle, not an installable APK. Use `npm run android` for the native development build.

## Design boundaries

- The HA backend owns recovery policy, synchronization and foreground heartbeat. Existing transport reconnections use the official client's retry loop; initial connection and synchronization failures have backend retries. Authentication and version errors are terminal.
- A candidate refresh keeps the committed entity stream active until replacement succeeds. Optional registry failures preserve known identities and appear in Diagnostics. Values remain qualified as cached until the session is ready.
- Native tokens live in SecureStore with safe keys. Credential operations are serialized, and a journal recovers interrupted saves and token cleanup. Forget removes saved credentials from the phone; revocation is a separate action in HA.
- Preferences are separate for demo and each HA origin. Moving HA from the Mac to a dedicated box creates a new profile unless preferences are explicitly migrated. Observed entity states and pending commands are not persisted.

## Next milestones

1. Build and install on the Pixel; validate setup, SecureStore, network loss, background/foreground, server restart and Forget.
2. Complete the [household capability inventory](docs/stage0/inventory.md), including real camera images and a Bluetooth path for AIRTAP. Prototype 3D feasibility on the Pixel.
3. Stage 2: command tracking and capability-aware controls, then camera images and related events. Outcomes must reflect observed HA state, and reconnect must never replay a command.
4. Stage 3: the spatial cockpit, with bundled geometry, live markers and the list view remaining usable if the scene fails. Later candidates include configuration export/import, household logins and tablet layouts.

The dependency audit remains an open release gate; its findings and the remaining hardware checks are tracked in [Stage 0 results](docs/stage0/results.md). Detailed contracts and acceptance criteria are in the [specification](docs/superpowers/specs/2026-10-14-home-cockpit-design.md).
