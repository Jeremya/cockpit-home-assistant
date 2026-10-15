# Home Cockpit foundations

Starting commit: `5071157` (specification v3; no application source).

This implementation builds the read-only Stage 1 foundation while keeping the Stage 0 hardware gates explicit. Physical controls remain Stage 2.

- Pin Expo SDK 57 and the HA client; configure Android development builds and repeatable checks.
- Add local HA Container configuration and preserve its runtime data outside Git.
- Implement strict URL validation, safe credential keys, profile preferences and identity reconciliation.
- Decode the real compressed entity stream and implement fresh subscription epochs, cancellation, bounded synchronization and reconnect handling.
- Build demo mode, overview, entity details, connection settings, entity selection and diagnostics.
- Verify stream deletion/attribute diffs, fresh resync, metadata failure, credentials and lifecycle races with behavioral tests; run TypeScript, lint and Android bundling.
- Record what actually ran in `docs/stage0/`; Android installation and actual household integrations require the Pixel/SDK and configured HA credentials.

Review notes addressed during implementation: optional registry failures must settle readiness; stale identity mappings must not override a successful registry removal; the fresh stream subscription must disable the client's automatic resubscription so epochs have one owner; credentials cannot rely on enumerating SecureStore keys after a partial write.
