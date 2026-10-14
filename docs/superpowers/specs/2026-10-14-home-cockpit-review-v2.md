# Home Cockpit — review of specification v2

Reviewed on 2026-10-14 against [specification v2](./2026-10-14-home-cockpit-design.md). This pass focuses on the revised contracts and their edge cases. The workspace still contains no application implementation or dependency lockfile; source checks therefore establish upstream behavior to verify against the exact packages selected in Stage 0. The checked HA client branch currently declares version 9.7.1.

The revised product boundary, entity/device/area model, persistence sequencing, honest camera wording, and staged roadmap address the main concerns from the first review. Keep that direction. The remaining work is mostly tightening contracts so implementation cannot satisfy the words while producing the wrong behavior.

1. **[P1] The specified SecureStore key is invalid.** [Spec §6.6, line 490](/Users/jeremy/dev/cockpit-larrabee/docs/superpowers/specs/2026-10-14-home-cockpit-design.md:490).

   `profile:<profileId>:token`, with a profile ID such as `ha:https://home.example.com`, contains colons and slashes. Expo SecureStore accepts only alphanumeric characters, periods, hyphens, and underscores, and validates the key before accessing native storage. Following this contract literally would make credential persistence fail. [Expo SecureStore documentation](https://docs.expo.dev/versions/latest/sdk/securestore/)

   Use a safe credential-storage identifier, for example `profile.<uuid>.token`, with the normalized origin stored in profile metadata. A deterministic hex digest of the profile ID also works. Avoid replacing forbidden characters with a common separator unless collision handling is defined. Keep the safe storage key separate from the human-readable profile identifier.

   **Acceptance:** save, load, and forget credentials for an HTTPS origin with a non-default port and for an IPv6 origin. Keys are valid and profiles do not collide.

2. **[P1] Unsubscribe/resubscribe does not guarantee a fresh HA snapshot.** [Spec §6.3, line 444](/Users/jeremy/dev/cockpit-larrabee/docs/superpowers/specs/2026-10-14-home-cockpit-design.md:444).

   The checked client caches the entity collection on the connection. Its default unsubscribe grace period is five seconds. An immediate re-subscription cancels teardown and delivers existing collection state; it need not send a new `subscribe_entities` command. This undermines the stated pull-to-refresh and foreground synchronization guarantees. [Client collection implementation](https://github.com/home-assistant/home-assistant-js-websocket/blob/master/lib/collection.ts)

   Define `resync()` by an observable guarantee: it resolves only after receiving the initial server snapshot for a new subscription epoch, followed by any newer updates. Cached callback replay cannot satisfy it. Add a subscription epoch or synchronization revision separate from `sessionId`, because several resyncs can occur within one session. Coalesce concurrent refresh/foreground/reconnect requests and reject late results from superseded epochs.

   Stage 0 should choose and prove a mechanism: an explicit server subscription through the official client's lower-level API, or a controlled connection renewal. The lower-level option retains the maintained transport/authentication library; it does require deliberately decoding the entity stream. Avoid reaching into private collection fields or waiting five seconds as the refresh implementation.

   **Acceptance:** unsubscribe and re-subscribe immediately while the server delays its next initial snapshot. The app remains synchronizing and `resync()` remains pending until that server snapshot arrives.

3. **[P1] Per-entity serialization ends before the first command is resolved.** [Spec §6.5, line 483](/Users/jeremy/dev/cockpit-larrabee/docs/superpowers/specs/2026-10-14-home-cockpit-design.md:483).

   The text promises one in-flight command per entity but permits the next command when the previous leaves `sending`. At that point it may merely be `accepted`, still waiting for device state. An accepted unlock followed by a lock can therefore overlap, with ambiguous state updates and late outcomes.

   Define the intended actuator policy explicitly. For locks, reject another command while the first is sending or awaiting confirmation; after an unconfirmed outcome, require a fresh state/reconciliation before enabling the next deliberate action. For temperature and speed, retaining only the latest unsent intent is reasonable, but dispatch it under an explicit serialization/supersession policy. Coalescing controls how many requests are sent; it does not by itself order their completion.

   Drop every unsent queued intent when the session stops being ready, not just timer-based debounces. A queued unlock created while ready must not survive a disconnect and execute after reconnect.

   **Acceptance:** HA accepts an unlock but delays its state report. A second lock/unlock is refused under the lock policy. Disconnecting clears any unsent intents, and reconnect sends none automatically.

4. **[P2] Confirmation needs ordering rules and a bounded reconciliation window.** [Spec §6.5, line 480](/Users/jeremy/dev/cockpit-larrabee/docs/superpowers/specs/2026-10-14-home-cockpit-design.md:480).

   Three cases are unspecified: the matching entity update arrives before the service-call response; an old snapshot already matches the requested target; and an unrelated manual action hours later matches an unconfirmed command. The literal lifecycle risks missing the first case and treating the latter cases as proof of an old command's outcome.

   Track the baseline observation revision at dispatch, the semantic target, and an entity command sequence. Observe updates from dispatch onward; do not discard a match merely because acknowledgement has not arrived yet. Re-evaluate the latest observation when acknowledgement arrives, and never let a late acknowledgement downgrade a terminal result. Prefer local observation order over comparing HA timestamps with the phone's wall clock.

   Handle an already-satisfied target as an explicit no-op. Allow late reconciliation only within a defined window, for the same profile/entity identity, before a later command supersedes it. Reconciliation across a reconnect can report that HA now shows the requested state; it cannot establish which actor caused it. Keep that distinction in the wording of “confirmed,” including integrations with assumed state.

   Define predicates for every semantic command: the current list omits HVAC-mode, fan-preset, and lock-open outcomes. If an integration cannot provide a persistent observable state for an action, say that only HA acceptance can be reported. Likewise, `rejected` should mean HA returned an error, without promising that no physical side effect occurred.

   **Acceptance:** test state-before-acknowledgement, already-satisfied targets, superseding commands, a bounded late match after reconnect, and an unrelated match after that window expires.

5. **[P2] Registry fallback changes entity identity during an outage.** [Spec `HomeSnapshot`, line 248](/Users/jeremy/dev/cockpit-larrabee/docs/superpowers/specs/2026-10-14-home-cockpit-design.md:248), and [identity rules, line 218](/Users/jeremy/dev/cockpit-larrabee/docs/superpowers/specs/2026-10-14-home-cockpit-design.md:218).

   A registered entity normally has a registry UUID as its key. If registry loading fails, the spec switches it to `entity:<entityId>`. Favorites, hidden overrides, room assignments, detail routes, and placements all reference the old key, so they stop matching even though the entity still exists. Recovery changes the key again. Creating preferences during fallback introduces the opposite migration problem.

   Preserve previously established identity when metadata is temporarily unavailable. Keep last-known registry mappings and expose metadata freshness separately from entity-state freshness; never treat a failed registry request as proof that a registry entry was removed. Use fallback keys only when no identity is known, and define a migration/alias rule when an initially unregistered-looking entity later receives a registry key.

   Replace the single all-or-nothing `registryAvailable` meaning with either separate entity/device/area availability or an explicit partial-metadata policy. An area-registry failure should not change entity identity. If mappings are persisted, classify them as versioned metadata, not live device state.

   **Acceptance:** save favorites/visibility with registries working, reconnect with only entity-registry access failing, then recover. Existing preferences and detail routes remain attached throughout.

6. **[P2] The climate capability's unit has no source in the backend contract.** [Spec §5.4, line 328](/Users/jeremy/dev/cockpit-larrabee/docs/superpowers/specs/2026-10-14-home-cockpit-design.md:328), and [unit field, line 338](/Users/jeremy/dev/cockpit-larrabee/docs/superpowers/specs/2026-10-14-home-cockpit-design.md:338).

   `getCapability(entity)` is declared purely entity-derived, but `ClimateCapability.unit` requires HA's configured temperature unit. That configuration is absent from `HomeSnapshot`. HA's climate implementation converts displayed temperatures using HA configuration, and the client's `HassConfig` carries `unit_system.temperature` separately from entity attributes. [HA climate implementation](https://github.com/home-assistant/core/blob/2026.10.1/homeassistant/components/climate/__init__.py), [client configuration type](https://github.com/home-assistant/home-assistant-js-websocket/blob/master/lib/types.ts)

   Load the required HA configuration with the session and expose a small `HomeConfig`, at least the temperature unit, in snapshots. Pass it to capability derivation or normalize the unit explicitly in the backend. Define handling for configuration changes and missing configuration; never guess from the phone's locale. Validate finite positive steps and tolerate absent feature attributes deliberately.

   **Acceptance:** run the same climate entity through Celsius and Fahrenheit HA configurations, including when the phone locale differs. Displayed values, command payloads, limits, and confirmation tolerances remain in the correct units.

7. **[P2] Add bounded synchronization and explicit recovery mechanics.** [Spec session sequence, line 434](/Users/jeremy/dev/cockpit-larrabee/docs/superpowers/specs/2026-10-14-home-cockpit-design.md:434), and [heartbeat, line 440](/Users/jeremy/dev/cockpit-larrabee/docs/superpowers/specs/2026-10-14-home-cockpit-design.md:440).

   Readiness waits for the first entity snapshot and registry results, but no synchronization deadline is specified. A server can authenticate and respond to pings while never answering a registry request or providing the initial entity set. The app would remain on “Synchronizing…” indefinitely. A transport connection timeout does not cover that phase.

   Set deadlines for initial synchronization, resync, and optional metadata loading. Required entity-state failure should produce a retryable error; optional metadata timeout should produce an explicit degraded mode while preserving known identity. Discard late responses after a timed-out attempt. State what `start()` resolving means: authenticated transport or usable synchronized session.

   Specify the heartbeat recovery API too. In the checked client, `connection.close()` intentionally disables reconnect, while `connection.reconnect(true)` forces recovery. Use the latter or an equivalent explicit mechanism for a silently broken socket; reserve intentional close for disconnect/forget. [Client connection implementation](https://github.com/home-assistant/home-assistant-js-websocket/blob/master/lib/connection.ts)

   Background timers may not run while the process is suspended. Reconcile already-sent command deadlines immediately on foreground using recorded deadlines, rather than depending on a background timeout firing.

   **Acceptance:** authenticate and answer pings, but suppress a registry response or initial entity snapshot. The app exits synchronization according to the specified deadline and retains a working retry path.

8. **[P2] Apply the unlock interaction policy to lock opening.** [Spec device detail, line 161](/Users/jeremy/dev/cockpit-larrabee/docs/superpowers/specs/2026-10-14-home-cockpit-design.md:161).

   The revision adds `Open` and `setLockState(..., 'open')`, while only unlock explicitly requires confirmation. Apply the same deliberate confirmation and no-replay rules to opening/unlatching, in detail and any future card/plan controls, or defer open to a later stage. Keep authorization confirmation distinct from entering a device-required code.

   Also define per-entity command eligibility. A session being ready does not establish that a particular entity is available, that the intended capability still exists, or that the current entity ID still belongs to the key selected when a confirmation dialog opened. Revalidate immediately before dispatch.

   **Acceptance:** an open action follows the same confirmation policy as unlock; entity removal or capability loss while the dialog is open prevents dispatch to a stale address.

9. **[P2] Clarify that iOS host exceptions are build-time configuration.** [Spec §6.6, line 495](/Users/jeremy/dev/cockpit-larrabee/docs/superpowers/specs/2026-10-14-home-cockpit-design.md:495).

   “An explicit exception for the configured host is added” leaves open whether that happens when a user edits Settings. ATS exceptions belong in the installed app's Info.plist; a settings form cannot add one to an already shipped binary. For the personal MVP, choose a tested general local-network policy, require HTTPS for unsupported addresses, or document that the house-specific build must be rebuilt when its exception changes.

   Correction to the earlier review: it cited Apple's archived ATS reference. Apple's current documentation explicitly discusses IPv4/IPv6 and OS-version differences, including IP-address/CIDR exceptions on iOS 17+. Use that current reference and test every promised OS/address combination. [Current Apple local-network ATS documentation](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking), [current domain/IP exception documentation](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsexceptiondomains)

   **Acceptance:** a packaged build can use every address form claimed by its support matrix without runtime changes to native configuration.

**Smaller clarifications for the next edit:**

- §3.3 says an HA version below minimum produces a warning; `SessionError.ha_version_unsupported` suggests a blocking error. Choose warning or refusal explicitly.
- Distinguish HA registry entries from running state entities in Settings. A disabled HA entity may have no current state; choosing “show” in Cockpit cannot enable it in HA. Explain that distinction and keep the HA configuration action external.
- Preserve unchanged normalized `EntityRecord` objects deliberately. The client's unchanged object identity does not automatically survive mapping into new records or metadata enrichment.
- Define whether hide also removes an item from Needs attention, and deduplicate favorites/attention rows. During a session outage, a home-level connection notice is clearer than one identical stale alert for every sensor.
- Stage 0's “one real action per category” should apply only to controllable categories. Sensor/event categories need an observed external change, and camera needs a proven image response.
- Keep proof results and selected package versions as Stage 0 artifacts even when prototype UI code is discarded.

**Implementation readiness.** The roadmap remains appropriate. Before starting Stage 1, settle credential-key encoding, the actual fresh-snapshot mechanism, identity during metadata failure, required HA configuration, and synchronization deadlines. Tighten command ordering, confirmation, and opening behavior before Stage 2 controls. Stage 0 should explicitly prove immediate resync behavior against the exact locked client release, alongside the existing Hermes/native/device checks.

This review is based on the document and upstream documentation/source. No installed app or household hardware was available to execute the acceptance scenarios.
