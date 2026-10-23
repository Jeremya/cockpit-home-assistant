# C — browser sign-in validation

Ledger for agent C's lots, as defined in the [parallel handoff](../handoff/parallel/C-web-auth.md). The contract, interfaces and detailed per-lot evidence live in the [browser sign-in ADR](../design/browser-auth.md). This page records what each lot proved, and the C04 portable recette. Every check uses the public auth fixture or a disposable Home Assistant container. No household instance, token, account or device is involved, and the `.local` token is never read.

## C01 — contract and prototype — `34b8d7b`

PKCE (S256), state, redirect and code lifetime are checked against HA core 2026.10.x source and a disposable `ghcr.io/home-assistant/home-assistant:2026.10.1` container: the fixture's 12-step conformance sequence passes against both. HA's real authorize page forwards the challenge. A code without its verifier is refused; a verifier for a code without challenge is refused. The prototype transaction is single-use, bound to this tab and posts only to the HA it started with. See [Proof (C01)](../design/browser-auth.md#proof-c01).

## C02 — sign-in in memory — `ebfb193`

The official client takes over after the code exchange. The HA user is checked before the first synchronization. The callback address is cleared, including Expo Router's late rewrite. Reloading asks to sign in again, and a beacon revokes the memory sign-in. A replayed callback is refused, and **Sign out** revokes. See [C02 status](../design/browser-auth.md#c02-status-in-memory-sign-in).

## C03 — remembered sign-in and user-bound grants — `b96bec7`, `e893965`

**Remember this browser** is opt-in and unchecked by default. Only the refresh token is stored, in IndexedDB, and only after the user check and a fresh snapshot. A sign-out anywhere wins over a late write. **Sign out**, **Stop remembering** and **Forget** are distinct, and sign-out reaches every tab without a token. On web, power grants belong to the verified HA user (the [M01 amendment](../design/power-enrollment.md)). `e893965` restored `router.replace("/")` in Settings after the integrator found that `dismissTo` broke Back to a detail. Integrated in `13bb790` and `590aec0`. See [C03 status](../design/browser-auth.md#c03-status-remembered-sign-in-and-user-bound-grants).

## C04 — portable recette — 2026-10-22

Base: `590aec0` (integrated tree with B and the `auth-callback` route), branch `work/web-auth-c04`.

### Runner

`node scripts/check-web-auth.mjs` follows the detail-panel recette:

1. Copy the public source to a temporary directory, then `npm ci`.
2. Check the public sample plan, then export the web build and serve it with `scripts/lib/preview-server.mjs` on `127.0.0.1`.
3. Start `scripts/lib/web-auth-fixture.mjs --serve --access-lifetime 4` on loopback.
4. Drive headless Chromium.

Network rules: each context may reach only the app and the fixture, plus the fixture's WebSocket. Any other request or socket is aborted and counted.

Browser profiles: a disposable on-disk profile, deleted with the temporary directory, makes the "close and reopen the browser" case real.

Output:
- `artifacts/web-auth/report.json` and two captures. Each capture is taken only after checking that the page contains no token or code.
- The finished report is checked last; a token-like or code-like value empties it and fails the run.
- The exit code is non-zero on any failed row, page error, external request, secret in the console or service call.

`--app <origin>` reuses a running app, such as the Expo development server, to iterate. The report then says `"staged": false`.

The fixture gained `POST /_fixture/drop-sockets`, which ends the WebSocket transports like an HA restart while tokens stay valid (tooling test added).

### Rows

| Row | What it proves | Observed (staged run) |
| --- | --- | --- |
| Sign-in request | Authorize URL has exactly `client_id` (= app origin + `/`), `redirect_uri` (= `/auth-callback`), `response_type=code`, a 43-character `state`, a 43-character `code_challenge`, `S256`. The verifier never appears. The transaction is written before the redirect, holds no token and is gone after the callback. **Remember this browser** is unchecked. Back reaches HA's page without a code | All true; landing `/` |
| Memory by default | No IndexedDB record and no token in local/session storage or cookies. Reloading asks to sign in; leaving revokes (fixture: 0 active refresh tokens) | 0 records, revoked |
| Used or forged callback | The captured callback replayed in another tab and a callback with a foreign state are refused with their messages, without any exchange, and leave a clean address | 0 exchanges, empty query |
| Remember this browser | Exactly one record with the documented fields and the refresh token only. Settings says it is remembered. Leaving the page and coming back reconnects with no new code and no revocation | 1 record, 0 codes, 0 revocations |
| Browser restart | After the tab is closed with its unload handlers and the browser exits, the token survives. Reopening the profile reaches the same home with no new code, after a refresh | 0 codes, 1 refresh, same HA address |
| Renewal on reconnect | After the access token expired, HA dropping the socket leads to a refresh and a new authenticated socket, then a new synchronization, with no new code | 1 socket dropped, 0 codes |
| Sign out in another tab | Tab A allows the plug; tab B restores the same sign-in and opens the plug's panel. **Sign out** in A turns B's control off, and a forced tap on it sends nothing. B shows "Not connected" and the notice. Record deleted, `signOutSeq` 1, token revoked | 0 records, seq `[1]`, 0 service calls |
| Stop remembering | Record deleted while the page stays signed in for this page only; the next load asks to sign in and the token is revoked | 0 records, revoked |
| Storage write refused | IndexedDB aborts the write (injected at `put`, see findings): "could not remember" notice, still signed in for this page only, no record; leaving revokes | 0 records, revoked |
| Corrupt record | An invalid record is deleted at start and reported without its contents | not shown, 0 records |
| Another Home Assistant user | Alice allows the plug; Bob signs in to the same home: Settings names the reset, and Bob must allow the plug himself | 0 service calls |

Staged run on the C04 commit (clean tree, over `590aec0`), Chromium 156.0.8078.4, public sample plan `a5f7f720…`: **11/11 rows pass**, `result: "passed"`. 0 page errors, 0 external requests, 0 secrets in the console, 0 service calls. Fixture totals: 7 codes issued and exchanged, 0 rejected codes, 6 refreshes, 6 revocations, 13 socket authentications; one refresh token remains active at the end: the last row's memory sign-in, since closing a Playwright context runs no unload handler. Captures: `settings-remembered.png` (about 100 KB) and `signed-out-elsewhere.png` (about 90 KB). Neither shows a token, and both were inspected. The temporary directory, including the browser profile, is removed afterwards.

### Mutation checks

Run in `--app` mode against the development server, then the source restored:

- Not telling other tabs about a sign-out: **Sign out in another tab** fails.
- Revoking a remembered sign-in on page unload: **Remember this browser**, **Browser restart**, **Renewal on reconnect** and **Sign out in another tab** fail.

### Harness findings

- This headless Chromium ignores `Storage.overrideQuotaForOrigin`: the reported quota stays at 10 GB, and a browser-level session answers "Internal error". The storage row therefore aborts the IndexedDB transaction at `put`, which is the failure a quota error produces. A real quota exhaustion is not reproduced.
- Closing a Playwright context does not run unload handlers. The first version of the restart row passed with a mutation that revoked remembered sign-ins on unload. The row now closes the tab with `runBeforeUnload` and also leaves and reopens the page, which catches that mutation.
- Console messages from a document being unloaded are not delivered. The pending transaction is therefore observed when the app writes it (a boolean only).

### Requests to A

1. Add `"check:web-auth": "node scripts/check-web-auth.mjs"` to `package.json`, and a CI job like `check:detail-panel`. The job uploads `artifacts/web-auth/` (report and two captures, under 5 MB, with the same budget rule as the detail-panel recette).
2. Pin the runner and the fixture in the reviewed audit inputs as you do for the other recettes.
3. `scripts/__tests__/web-auth-fixture.test.mjs` is already part of `test:tooling`.

### Limits

- Chromium only. No hosted HTTPS deployment, real certificate or Chrome local-network prompt.
- The browser flow uses the public fixture. A real HA 2026.10.1 was exercised only by C01 (conformance, authorize page, prototype with the official client), not with persistence or tabs.
- Quota failure is simulated at the IndexedDB API (see findings).
- HA absent at launch, concurrent refreshes in one tab and the crash between grant revocation and principal write are proven by unit and integration tests, not in this recette.
- The two-tab race between users and the other known limits are listed in [C03 status](../design/browser-auth.md#c03-status-remembered-sign-in-and-user-bound-grants).
