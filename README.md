# Home Cockpit

An Android-first Expo app for a single household's Home Assistant. The first implementation is read-only: Overview, rooms, favorites, entity detail, selection and diagnostics. Demo mode runs without Home Assistant. Physical controls and camera images are Stage 2; the spatial cockpit is Stage 3.

## Run the application

Node 24 is the development baseline. Install the locked dependencies:

```sh
npm ci
npm start
```

Open the development client on the Pixel 9. To build that client locally, install Android Studio / Android SDK, configure `ANDROID_HOME`, enable USB debugging, connect the phone, then run:

```sh
npm run android
```

Expo Go is not a supported networking validation target. `npm run web` is available for a demo preview; real credential persistence requires the native SecureStore module. The app intentionally does not save tokens to browser storage. iOS is not yet validated.

## Local Home Assistant

Docker Desktop must be running. Seed the local configuration without overwriting existing data, then start the pinned HA container:

```sh
node scripts/setup-ha.mjs
npm run ha:up
```

Open <http://localhost:8123> and complete Home Assistant's initial setup. Its `demo` integration supplies simulated entities through the real API. Create a dedicated household user and a long-lived token under that user's Profile → Security; enter that token in the app. The container is exposed on port 8123 so the Pixel can reach it on the same Wi-Fi network. Use the Mac's LAN IP, not `localhost`, on the Pixel. HTTP requires explicit trusted-network consent in the app.

The HA runtime directory `.local/` is ignored by Git. It contains authentication data and should not be committed or shared. The example configuration in `home-assistant/` contains no credentials. No owner account or password is automatically created.

### Check the configured HA instance

Sign in as the dedicated Cockpit user and create a long-lived token under Profile → Security. Save only the token in `.local/ha-token` (owner-readable only, `chmod 600 .local/ha-token`), rather than putting it in a shell command or chat. Then run:

```sh
HA_ALLOW_INSECURE_HTTP=1 npm run proof:ha
```

The default endpoint is `http://127.0.0.1:8123`. Set `HA_URL` for another origin and `HA_TOKEN_FILE` for another local token file. HTTP consent is required for HTTP endpoints. The check authenticates, loads a snapshot and registries, pings, refreshes, simulates foreground return and reconnects its own client. It sends no service calls and prints only version, timings and aggregate counts. Stale registry metadata is reported separately from a successful entity connection. This is a Node-side check; it does not replace Pixel/Hermes validation.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run proof:protocol
npm run export:android
npm run format:check
```

The protocol proof binds a temporary loopback WebSocket server and exercises the actual official HA client, authentication, initial compressed snapshots, immediate resync, deletion, coalescing and heartbeat. It sends no device service calls. It proves Node-side protocol compatibility; Hermes and physical-device validation remain separate gates.

`npm run export:android` produces a Hermes JavaScript bundle, not an installable APK. A native Android build is still required to verify phone networking and SecureStore.

## Implementation boundaries

- HA owns device truth and integrations; Cockpit never invents state or persists observed states as current truth.
- Full snapshots replace state. Subscription epochs reject old callbacks and wait for a new server snapshot.
- Optional registry errors preserve known identity and produce diagnostics. Entity aliases migrate local preferences.
- Tokens are stored with safe SecureStore keys. A small metadata journal makes interrupted writes recoverable without enumerating secrets.
- Preferences and identity metadata are separate for demo and each HA origin. Changing from the Mac's address to a dedicated HA box currently creates a new profile; preferences are not automatically transferred.
- Real device integrations, actual Ring still images, Bluetooth support for AIRTAP, APK installation, iOS and 3D feasibility have not been proven by demo mode.

See [Stage 0 results](docs/stage0/results.md) and [the specification](docs/superpowers/specs/2026-10-14-home-cockpit-design.md).
