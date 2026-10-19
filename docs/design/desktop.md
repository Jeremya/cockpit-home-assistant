# D01 — Chrome desktop with shared application code

The user selected Chrome desktop on 2026-10-19. D01 extends the existing Expo/React Native Web app. Routes, screens, device cards, observations, preferences, plan geometry, HA transport, command tracking and power enrollment stay shared with Android. There is one SessionManager per running client; this does not synchronize phone and browser storage.

## Layout and navigation

`AppShell.web.tsx` adds the browser landmarks, skip link and persistent navigation at **1024 CSS pixels** and above. Its native counterpart passes children through. The Stack and route definitions stay in `app/_layout.tsx`; resizing never switches navigators or remounts the session. Overview links dismiss back to Home. Regular anchors retain modified-click/new-tab behavior and route URLs. Keyboard focus has a visible outline; active navigation uses `aria-current`.

`useResponsiveLayout` is the shared browser breakpoint. Home reuses `HousePlanCard` in an expanded preview beside the existing attention section, then puts the existing device cards into `CardGrid`. The grid measures available content width, including the navigation rail, before choosing one to three columns. Other screens get bounded reading widths; the device summary can put its existing power control beside observations. The same FloorPlanView receives a larger desktop height. Native screen and command ownership remain unchanged. Platform extensions are supported by [Expo Router](https://docs.expo.dev/router/advanced/platform-specific-modules/).

## Browser credentials and connection

`runtime.ts` still constructs the same Credentials, PreferencesStorage and SessionManager. Only `credentialStorage.web.ts` differs: its connection journal and token store are per-page in-memory maps. Native uses the existing AsyncStorage journal and SecureStore token adapter. Browser preferences, including exact per-device grants, stay in AsyncStorage's browser storage, per application origin and HA profile. No token enters localStorage, sessionStorage, route parameters or build configuration. A page reload requires entering the token again; regular client-side navigation and transport recovery retain the active session. Forget uses the common credential cleanup. The form clears the token after connecting.

The browser connects directly through the same official HA WebSocket client and token authentication, following the [HA authentication contract](https://developers.home-assistant.io/docs/auth_api/). Start locally with:

```sh
npm run web -- --host localhost --port 8082
```

Open **http://localhost:8082** in Chrome. Use the HA address reachable from this computer, including `http://127.0.0.1:8123` when HA is on this Mac. HTTP still needs the explicit trusted-network choice. Allow Chrome's local network permission if requested. Chrome/network policy may restrict mixed-content or local requests when hosted elsewhere; localhost acceptance is not a deployment guarantee. See [Chrome's Local Network Access description](https://developer.chrome.com/blog/local-network-access).

`confirmAction.web.ts` uses the browser's keyboard-accessible confirmation dialog for Forget and plan reset; native keeps Alert. Existing power permission review remains shared UI. Browser enrollment is independent of the phone; importing, copying or changing a profile must not silently transfer its power rights.

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
