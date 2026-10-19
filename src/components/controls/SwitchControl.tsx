import { useEffect, useMemo, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { useStore } from "zustand";
import { latestCommand, visibleCommand } from "../../commands/store";
import {
  switchCommandBusy,
  switchControlRestriction,
  switchIdentityRestriction,
  switchOutcomeText,
} from "../../commands/switchControl";
import type { CommandTarget } from "../../commands/types";
import { assessEntity } from "../../core/policy";
import { useCockpit } from "../../core/store";
import type { EntityRecord, HomeSnapshot } from "../../core/types";
import { commands, commandStore, session } from "../../services/runtime";
import { Body, Button, Label, Panel, colors, styles } from "../ui";

export function SwitchControl({
  entity,
  snapshot,
  profileId,
  mode,
  ready,
}: {
  entity: EntityRecord;
  snapshot: HomeSnapshot;
  profileId: string;
  mode: "demo" | "homeAssistant" | null;
  ready: boolean;
}) {
  const [active, setActive] = useState(AppState.currentState === "active");
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<CommandTarget | null>(null);
  const [saving, setSaving] = useState(false);
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
    (saving ? "Saving power permission…" : null) ??
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
  function beginPermission() {
    const current = useCockpit.getState();
    if (
      AppState.currentState !== "active" ||
      current.profileId !== profileId ||
      current.snapshot?.sessionId !== snapshot.sessionId ||
      current.snapshot.syncEpoch !== snapshot.syncEpoch ||
      current.snapshot.entities[entity.entityId] !== entity ||
      current.status.kind !== "ready"
    )
      return;
    const result = commands.capture(entity.key);
    if (result.kind === "captured") setReview(result.target);
    else setNotice(result.message);
  }
  async function savePermission(allow: boolean) {
    if (saving || (allow && !review)) return;
    setSaving(true);
    const saved = allow
      ? await session.allowSwitch(review!)
      : await session.revokeSwitch(profileId, entity.key);
    setReview(null);
    setSaving(false);
    setNotice(
      saved
        ? allow
          ? "Power control allowed for this device in this home."
          : "Power control revoked. Already-sent requests may still take effect."
        : "Permission could not be saved. Review the current device and try again.",
    );
  }
  return (
    <Panel>
      <Label>
        {mode === "demo" ? "Simulated power control" : "Power control"}
      </Label>
      <Body>
        {mode === "demo"
          ? "This changes the offline demo lamp only."
          : "Sends an On or Off request through Home Assistant."}
      </Body>
      {mode === "homeAssistant" && (
        <View style={{ gap: 12 }}>
          {review ? (
            <>
              <Label>Allow {entity.name}?</Label>
              <Body>
                Only allow a lamp or a load you can safely switch. This
                permission applies to this device in this home. Allowing it
                sends no power request.
              </Body>
              <Button
                title="Allow this device"
                disabled={saving || !active || !ready}
                onPress={() => void savePermission(true)}
              />
              <Button
                title="Cancel permission"
                secondary
                disabled={saving}
                onPress={() => setReview(null)}
              />
            </>
          ) : grant ? (
            <Button
              title="Revoke power control"
              secondary
              disabled={saving}
              onPress={() => void savePermission(false)}
            />
          ) : !identityRestriction ? (
            <Button
              title="Allow power control"
              secondary
              disabled={
                saving ||
                !active ||
                !ready ||
                !["on", "off"].includes(entity.state)
              }
              onPress={beginPermission}
            />
          ) : null}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 12 }}>
        {[true, false].map((on) => {
          const selected = entity.state === (on ? "on" : "off");
          const disabled = !!blocked || busy || selected;
          return (
            <Pressable
              key={String(on)}
              accessibilityRole="button"
              accessibilityLabel={`Turn ${entity.name} ${on ? "on" : "off"}`}
              accessibilityState={{ disabled, busy }}
              disabled={disabled}
              onPress={() => send(on)}
              style={({ pressed }) => [
                styles.button,
                {
                  flex: 1,
                  backgroundColor: selected
                    ? colors.accentSurface
                    : colors.raised,
                  borderWidth: 1,
                  borderColor: selected ? colors.accent : colors.border,
                  opacity: blocked || busy || pressed ? 0.55 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: selected ? colors.accent : colors.text },
                ]}
              >
                {on ? "Turn on" : "Turn off"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {blocked && <Body>{blocked}</Body>}
      {outcome && (
        <View
          accessibilityLiveRegion="polite"
          testID="switch-outcome"
          style={{ gap: 8 }}
        >
          <Label>
            Requested{" "}
            {outcome.desired.intent.kind === "setSwitch" &&
            outcome.desired.intent.on
              ? "On"
              : "Off"}
          </Label>
          <Body>{switchOutcomeText(outcome, mode === "demo")}</Body>
          {!busy && (
            <Button
              title="Dismiss result"
              secondary
              onPress={() => session.dismissCommand(outcome.id)}
            />
          )}
        </View>
      )}
      {notice && !busy && (
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          {notice}
        </Text>
      )}
    </Panel>
  );
}
