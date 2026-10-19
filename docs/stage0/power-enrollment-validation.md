# M01 power enrollment — 2026-10-19

[M01's implementation](../design/power-enrollment.md) replaces the model-global Boolean with default-denied, profile/device-bound permission. Source is in `2a4e87a`; `220b303` corrects only trial-report feature metadata. The exact **Maurice Trial 1009** sample APK from clean `220b3031ed152ba2582710bbe5bc7ed8a99cda29` is installed and passes the scoped Pixel 9 Pro / Android 17 checks below, without Metro.

## Source and CI

**633 Jest tests / 40 suites and 19 Node tooling tests** pass. TypeScript, lint, formatting, decoder and loopback protocol proofs pass. Public smoke passes at 320/430/768 with direct summary power, offline use, 48 px controls and all twelve M00 focus-return assertions. No page errors or external requests; the developer plan remains unchanged. Web/Android runtime-map guards pass.

[Public checks](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39316948871) and the [reviewed dependency audit](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39316948836) pass on the exact candidate source. Raw audit still reports 56 affected entries / three advisories; existing exceptions expire 2026-11-02, and strict public-release mode still fails. The reviewed hash changes cover direct summary smoke locators and accurate build-report metadata, with no dependency, signing or exposure-scope change.

## Named binary and Pixel acceptance

- Build **1009**, `0.1.0-trial.9`, ARM64 release, embedded Hermes, public sample, no development launcher or backup, explicit local HTTP support, same trial signing key.
- APK SHA-256: `8d9dee521128ad96abc03a1b3906bd4504067131641befaaac30f2300a7cf18e`.
- Source SHA-256: `04d5c3e0b5cb5738e7fe1462ce4832b1a8b3836da80aa0a057ed9178ad7204a0`.
- Signed update from installed **1002** preserves the saved HA connection and loads the profile. Existing real power defaults to denied. Complete preference-field preservation is verified by migration tests, not a native raw-storage comparison.
- The public loopback fixture checks explicit review/cancel, no service on enrollment, accepted-but-unobserved busy controls, later reported state, stored permission across process restart, revoke/reenroll, On/Off, deadline wording, foreground without replay, offline revoke followed by recovery/restart, and qualified HA refusal without optimistic state.
- Four targeted simulated requests complete those cases; two additional simulated requests were issued during harness diagnosis, **six native fixture requests total**. They never reach household devices. The fixture ends with Off reported and permission revoked.
- **100% and 200% text:** named power controls remain at least 48 dp and within screen bounds; permission review/cancel remains reachable. Font scale is restored. No new Maurice native crash is observed in these scoped checks.
- The saved household session is restored. Read-only preflight finds the unique HS103 and matches its hardware identifier to the MAC previously supplied by the user. Both actions remain disabled until explicit enrollment. Private identifiers/screenshots/token stay in ignored local evidence.

The first 1008 artifact was not installed because its generated report still claimed `realControls: false`. The producer now reports enrolled HS103 support with a denied default; 1009 is the accepted native candidate. Initial native harness assertions omitted Android's `, busy` accessibility suffix and searched until the deadline. The final check inspects disabled buttons in the same acknowledgement frame. Another harness expectation incorrectly required an unconfirmed message to remain after a fresh nonmatching foreground observation; C02 deliberately dismisses that transient display. The corrected check proves the deadline display before foreground, unchanged service count and fresh Off state afterward. No product timeout or outcome rule was weakened.

## Physical household acceptance and limits

The user confirmed that the enrolled HS103 powers a lamp and explicitly authorized one supervised cycle. Through installed **Trial 1009** on the Pixel, one On request and one Off request produced matching HA/native observations. The user also confirmed seeing both physical lamp changes. The original **Off** state is restored and remains Off after process restart; the exact profile/device permission persists. No other household actuator was used. The one-cycle test authorization is consumed; the saved permission enables ordinary use of this specific plug, not other HS103 devices or profiles.

The saved household session is restored; original font scale, stay-awake setting and Wi-Fi state are restored or unchanged. The temporary fixture server and adb reverse are removed. **M01 is accepted for this lamp on Pixel 9 Pro / Android 17, build 1009.** Next is M02 household personalization: apply the intended profile plan, link rooms, place the two proven devices and curate readings/favorites.

The [safe aggregate](power-enrollment-proof-2026-10-19.json) separates source, binary, native fixture, household read-only and physical evidence. The manifest's generated candidate label is a build-time checkpoint; this ledger owns subsequent scoped acceptance. M01 is not a new acceptance of the entire R03a suite. Seeker M01, Pixel S02/3D and spoken TalkBack validation of the new permission review remain separate. The earlier unexplained native incident and public-release gates remain open.
