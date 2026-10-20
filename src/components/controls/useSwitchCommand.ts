import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { useStore } from "zustand";
import { latestCommand, visibleCommand } from "../../commands/store";
import {
  switchCommandBusy,
  switchControlRestriction,
  switchIdentityRestriction,
} from "../../commands/switchControl";
import { assessEntity } from "../../core/policy";
import { useCockpit } from "../../core/store";
import type { EntityRecord, HomeSnapshot } from "../../core/types";
import { commands, commandStore, session } from "../../services/runtime";

/** The one rendered path to a switch request; the manager stays the final check. */
export function useSwitchCommand({
  entity,
  snapshot,
  profileId,
  mode,
  ready,
  savingPermission = false,
}: {
  entity: EntityRecord;
  snapshot: HomeSnapshot;
  profileId: string;
  mode: "demo" | "homeAssistant" | null;
  ready: boolean;
  savingPermission?: boolean;
}) {
  const [active, setActive] = useState(AppState.currentState === "active");
  const [notice, setNotice] = useState<string | null>(null);
  const preferences = useCockpit((state) => state.preferences);
  const grant = Object.hasOwn(preferences.switchEnrollments, entity.key)
    ? preferences.switchEnrollments[entity.key]
    : undefined;
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      setNotice(null);
    });
    return () => listener.remove();
  }, []);
  const latest = useStore(commandStore, (state) => {
    const record = latestCommand(
      state,
      profileId,
      entity.key,
      snapshot.identities.aliases,
    );
    return record?.entityId === entity.entityId ? record : undefined;
  });
  const outcome = visibleCommand(latest);
  const busy = switchCommandBusy(latest);
  const restriction = switchControlRestriction(entity, snapshot, mode, {
    profileId,
    preferences,
  });
  const identityRestriction = switchIdentityRestriction(entity, snapshot, mode);
  const condition = assessEntity(entity, ready).condition;
  const blocked =
    (savingPermission ? "Saving power permission…" : null) ??
    restriction ??
    (!active
      ? "Return to the app to use power control."
      : !ready
        ? "Wait for synchronization before using power control."
        : ["unknown", "unavailable", "stale"].includes(condition)
          ? "A known, available state is required for power control."
          : null);
  // Bind this rendered interaction to its manager-issued lifetime. A stale press
  // cannot capture the same key in a replacement home and operate that device.
  const captured = useMemo(() => {
    const current = useCockpit.getState();
    if (
      blocked ||
      current.profileId !== profileId ||
      current.preferences.switchEnrollments !== preferences.switchEnrollments ||
      current.snapshot?.sessionId !== snapshot.sessionId ||
      current.snapshot.syncEpoch !== snapshot.syncEpoch ||
      current.snapshot.entities[entity.entityId]?.key !== entity.key
    )
      return;
    return commands.capture(entity.key);
  }, [
    blocked,
    entity.key,
    entity.entityId,
    profileId,
    snapshot.sessionId,
    snapshot.syncEpoch,
    preferences.switchEnrollments,
  ]);
  function send(on: boolean) {
    const current = useCockpit.getState();
    const currentEntity = current.snapshot?.entities[entity.entityId];
    if (
      AppState.currentState !== "active" ||
      current.profileId !== profileId ||
      current.mode !== mode ||
      current.snapshot?.sessionId !== snapshot.sessionId ||
      currentEntity?.key !== entity.key ||
      current.status.kind !== "ready" ||
      !current.snapshot ||
      switchControlRestriction(currentEntity, current.snapshot, current.mode, {
        profileId,
        preferences: current.preferences,
      }) ||
      ["unknown", "unavailable", "stale"].includes(
        assessEntity(currentEntity, true).condition,
      )
    )
      return;
    // Read synchronously as well as subscribing: two presses in one render must
    // not send twice, including after ack but before a matching observation.
    if (
      switchCommandBusy(
        latestCommand(
          commandStore.getState(),
          profileId,
          entity.key,
          current.snapshot.identities.aliases,
        ),
      )
    )
      return;
    if (!captured || captured.kind === "refused") {
      setNotice(
        captured?.message ?? "Review this device before sending a request.",
      );
      return;
    }
    const result = commands.setSwitch(captured.target, on);
    setNotice(
      result.kind === "refused" || result.kind === "no-op"
        ? result.message
        : null,
    );
    // The manager owns the result promise. Only observed snapshots update state.
  }
  function dismissOutcome() {
    if (outcome) session.dismissCommand(outcome.id);
  }
  return {
    active,
    grant,
    identityRestriction,
    restriction,
    blocked,
    busy,
    outcome,
    notice,
    setNotice,
    send,
    dismissOutcome,
  };
}
