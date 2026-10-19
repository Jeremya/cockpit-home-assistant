# D01 desktop validation — 2026-10-19

The [desktop contract](../design/desktop.md) preserves shared screens, cards, plan components, SessionManager, command policy and preference schema 3. Browser-only differences are the workspace shell/CSS, volatile credential storage and native browser confirmation dialogs. No new package or server-side credential service is introduced.

## Source and isolated browser checks

**634 Jest tests / 41 suites** pass, including the common credential journal exercised with per-page browser stores. TypeScript, lint and formatting pass. **19 tooling tests** pass outside the filesystem/network sandbox; the first sandbox run could not bind loopback (`EPERM`), which also timed out the fixture cases. This was an environment restriction, not a product regression.

The public UI runner checks the full Home/rooms/readings/favorites/plan/placement/power flow at **320/430/768/1440**, plus desktop resize, keyboard navigation, active links and skip-to-content. The original M00 focus assertions stay in place, extended to sixteen assertions across four widths. Public exports use an isolated sample-only install/cache; the developer's prepared plan is preserved. Sample screenshots and aggregate results stay separate from local household checks.

Initial harness corrections put the first-Tab assertion before the pointer-driven demo button, restrict DOM queries to the exposed route when the Stack retains hidden screens, and use the existing `Cancel permission` label. These corrections do not relax focus, credential, command or network assertions. Overview navigation also explicitly dismisses back to the existing Home route.

The closed browser HA fixture uses only its public token and exact loopback endpoint. Its cases check default denial, explicit review/cancel/grant, no service on enrollment, two simulated On/Off requests, network recovery without replay, memory-only credentials, reload requiring a token while preserving preferences/grant, and browser Forget cancel/confirm. It never sends household services.

## Real Chrome and household scope

**Google Chrome 155.0.8059.80 on this Mac**, at localhost:8082 with the local development bundle, connects read-only to the actual HA instance, opens the real HS103 summary with both actions disabled by default, and renders the personal profile plan without horizontal overflow. The token is absent from browser persistence and the URL. **Zero device service requests and zero page errors** are observed. This fresh isolated Chrome context is closed after checking; it does not sign the user's normal Chrome profile in. No personal screenshot, identity, URL or token is committed.

The development server remains local for the user. D01 does not update either phone's installed binary, repeat the authorized M01 physical cycle or establish Chrome physical-control acceptance. M01's Pixel 1009 acceptance remains in its [own ledger](power-enrollment-validation.md). Production 3D/GPU, persistent browser sign-in, fresh offline startup, remote hosting and public distribution remain separate work.

The [safe aggregate](desktop-proof-2026-10-19.json) records final source checks and browser scope. The reviewed dependency policy retains its three tooling exceptions and unchanged 2026-11-02 expiry; strict public release still requires closure.
