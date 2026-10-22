# D01 — Chrome desktop with shared application code

**Reading note — 2026-10-22:** this document records D01 and the manual-token mode. Shared Home/selection and the measured desktop model camera have since shipped locally through UX08; follow the [current parallel handoff](../handoff/parallel/README.md) for execution. The detail panel and persistent OAuth sign-in remain future B/C work. The historical “Next work” list below is not the current task queue.

The user selected Chrome desktop on 2026-10-19. D01 extends the existing Expo/React Native Web app. Routes, screens, device cards, observations, preferences, plan geometry, HA transport, command tracking and power enrollment stay shared with Android. There is one SessionManager per running client; this does not synchronize phone and browser storage.

## Layout and navigation

`AppShell.web.tsx` adds the browser landmarks, skip link and persistent navigation at **1024 CSS pixels** and above. Its native counterpart passes children through. The Stack and route definitions stay in `app/_layout.tsx`; resizing never switches navigators or remounts the session. Overview links dismiss back to Home. Regular anchors retain modified-click/new-tab behavior and route URLs. Keyboard focus has a visible outline; active navigation uses `aria-current`.

`useResponsiveLayout` is the shared browser breakpoint. Home reuses `HousePlanCard` in an expanded preview beside the existing attention section, then puts the existing device cards into `CardGrid`. The grid measures available content width, including the navigation rail, before choosing one to three columns. Other screens get bounded reading widths; the device summary can put its existing power control beside observations. The same FloorPlanView receives a larger desktop height. Native screen and command ownership remain unchanged. Platform extensions are supported by [Expo Router](https://docs.expo.dev/router/advanced/platform-specific-modules/).

## Shared interface and phone preview

On 2026-10-20, the user clarified the goal: House Control's inviting visual style and intuitive interactions, with one product experience across phone and computer. Use the same typography, spacing, colors, device information, actions and interaction rules. Adapt the arrangement to the available width. A wider window can add columns or a detail panel, but should not introduce another implementation of a card, command policy or session.

Future D03 workspace and camera work must be reconciled with that direction before implementation. The current D03 draft is not a commitment to maintain two separate interfaces. Start shared visual changes in the compact layout, then verify the same components at wider sizes. Platform adapters remain appropriate for storage, rendering and input capabilities; they do not require two visual identities.

Run Expo and the development preview in separate terminals:

```sh
npm run web -- --host localhost --port 8082
node scripts/preview-devices.mjs
```

Open **http://localhost:8083**. `scripts/preview/` provides a local phone frame with 360×800, 412×915, 430×932, 768×1024 and 1280×900 CSS-pixel viewports, plus rotation. One iframe hosts the actual Expo app throughout; resizing changes its viewport without replacing its document, navigation or session. The surrounding frame scales down to fit the browser window without changing the app's selected CSS width. Expo's own development connection provides app updates.

The preview uses only Node built-ins and is not imported by the app. Its HTTP server listens on loopback only. For other ports, use `node scripts/preview-devices.mjs --app http://localhost:8090 --port 8091` with Expo on port 8090. Browser preferences belong to the embedded app's origin, not to the preview server. Opening the app in a separate tab creates another session; it does not share the in-memory token with the iframe.

Use the demo for visual exploration. The frame has no mock backend of its own: connecting the embedded app to HA uses the real backend and the existing power permissions. The framing page does not inspect the iframe's session. The optional local token loader below is an explicit server capability, disabled by default.

This is a web viewport preview, not an Android emulator. It does not emulate touch hardware, pixel density, native safe areas, native accessibility or GPU performance. Validate a compact layout, rotate it, resize to a wide layout without losing the selected room or detail, then check the Android build on the Pixel/Seeker for native acceptance. Chrome's own [Device Mode documentation](https://developer.chrome.com/docs/devtools/device-mode) also distinguishes browser simulation from real-device testing.

## Browser credentials and connection

`runtime.ts` still constructs the same Credentials, PreferencesStorage and SessionManager. Only `credentialStorage.web.ts` differs: its connection journal and token store are per-page in-memory maps. Native uses the existing AsyncStorage journal and SecureStore token adapter. Browser preferences, including exact per-device grants, stay in AsyncStorage's browser storage, per application origin and HA profile. No token enters localStorage, sessionStorage, route parameters or build configuration. A page reload requires reconnecting with manual token entry or the explicit local file load below; regular client-side navigation and transport recovery retain the active session. Forget uses the common credential cleanup. The form clears the token after connecting.

The browser connects directly through the same official HA WebSocket client and token authentication, following the [HA authentication contract](https://developers.home-assistant.io/docs/auth_api/). Start locally with:

```sh
npm run web -- --host localhost --port 8082
```

Open **http://localhost:8082** in Chrome. Use the HA address reachable from this computer, including `http://127.0.0.1:8123` when HA is on this Mac. HTTP still needs the explicit trusted-network choice. Allow Chrome's local network permission if requested. Chrome/network policy may restrict mixed-content or local requests when hosted elsewhere; localhost acceptance is not a deployment guarantee. See [Chrome's Local Network Access description](https://developer.chrome.com/blog/local-network-access).

`confirmAction.web.ts` uses the browser's keyboard-accessible confirmation dialog for Forget and plan reset; native keeps Alert. Existing power permission review remains shared UI. Browser enrollment is independent of the phone; importing, copying or changing a profile must not silently transfer its power rights.

## Local token loading (development only)

Requested on 2026-10-20 to avoid repeatedly pasting the token while developing on the Mac:

```sh
node scripts/preview-devices.mjs --local-ha
# Optional destination override:
# node scripts/preview-devices.mjs --local-ha --ha-url https://home.example.com
```

The helper must be on port **8083** for the app's development button. Its `--app` origin must exactly match the Expo origin (default `http://localhost:8082`). In Settings, **Load local connection** fills the configured HA URL and the masked token. It clears any previous HTTP trust; the user reviews the address, confirms local HTTP trust if applicable, and selects Connect. Loading alone does not connect or grant power permissions. It works in the frame and in a direct app tab.

The Node helper reads only the fixed repository `.local/ha-token`, at request time, with a 16 KiB bound. It requires a regular file with no group/other permissions and rejects symlinks. It accepts no client-supplied file path or destination. `.local` is never served as a static directory, and the token is absent from HTML, JS bundles, logs and URL parameters.

`POST /local-connection` exists only with `--local-ha`. The server binds to loopback, checks the exact Host and Origin before reading, requires `X-Maurice-Local-Connection: 1` and an empty body, returns only the configured CORS origin, and sends `Cache-Control: no-store`. GET, missing/foreign origins, altered hosts and simple form requests are rejected. This follows the browser's [CORS preflight model](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS). Local processes and code executing within the permitted app origin remain trusted; this is a development helper, not a public authentication service.

The web client exposes the button only in development on an HTTP loopback origin. Requests omit browser credentials, reject redirects and time out after five seconds. Errors omit response contents. Production code cannot invoke the loader; the native module provides no file-loading implementation. The token lives in the existing page memory and is cleared from the form after connecting. No automatic read or login occurs on page load or after Forget. Forget removes the page's credentials, not the source file; stop the helper to disable future file loads, or revoke the token in HA to invalidate it.

This does not implement D02's persistent browser sign-in. That remains a separate product decision for deployed clients.

## Verification and next slices

The existing isolated public smoke now runs the complete flow at **320/430/768/1440**, retaining four marker/list return-focus assertions per width. Additional desktop checks cover 1024/1280/1920 and crossing back to 800 without losing room selection. `scripts/lib/browser-connection-check.mjs` creates a second fresh context and a disposable public HA fixture: enrollment, two simulated power requests, recovery without replay, no persistent token, reload/reconnect with saved preferences/grant, and Forget cancel/confirm. Only that exact loopback WebSocket is allowed. It never uses household credentials or forwards services. Public screenshots remain sample-only, explicitly allowlisted and bounded.

The dependency review changes only the smoke/workflow hashes and adds the new fixture helper to reviewed inputs. No dependency, lockfile, signing input, advisory scope or 2026-11-02 exception expiry changes. Runtime-map and strict public-release checks remain in place.

Next work:

1. **M02:** configure the intended house, room links, two proven device placements and favorites on the chosen client. Preserve power grants during spatial edits. Cross-client preference migration requires an explicit import design; matching HA URLs alone does not sync clients.
2. **M03:** polish the common Home and reading presentation for daily use on both screen sizes.
3. **D02:** design persistent browser sign-in, preferably HA authorization with an explicit token/refresh-token lifetime and logout policy. Do not silently change D01 to durable plaintext token storage or add a credential proxy by default.
4. **M04 / browser spatial acceptance:** measure the production 3D path, mouse/keyboard interaction and visibility/resource lifecycle on the exact browser/GPU. Existing rendering code is shared; D01 certifies its 2D flow only.
5. Installable PWA/offline startup remains later work: the current loaded demo works offline, but no service worker or fresh offline start is claimed.

Source/browser evidence and the separate real-HA read-only check are recorded in the [D01 validation ledger](../stage0/desktop-validation.md).
