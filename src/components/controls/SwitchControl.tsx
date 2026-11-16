import { useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { switchOutcomeText } from "../../commands/switchControl";
import type { CommandTarget } from "../../commands/types";
import { useCockpit } from "../../core/store";
import type { EntityRecord, HomeSnapshot } from "../../core/types";
import { commands, session } from "../../services/runtime";
import { minTouchTarget, radii, spacing, typography } from "../../theme";
import { Icon } from "../EntityIcon";
import {
  Body,
  Button,
  Label,
  Notice,
  Panel,
  colors,
  styles,
  type Interaction,
} from "../ui";
import { outcomeTone } from "./outcomeTone";
import { useSwitchCommand } from "./useSwitchCommand";

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
  const [review, setReview] = useState<CommandTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const {
    active,
    grant,
    identityRestriction,
    blocked,
    busy,
    outcome,
    notice,
    setNotice,
    send,
    dismissOutcome,
  } = useSwitchCommand({
    entity,
    snapshot,
    profileId,
    mode,
    ready,
    savingPermission: saving,
  });
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
  const look = outcome ? outcomeTone(outcome) : null;
  return (
    <Panel>
      <View style={control.head}>
        <Label>
          {mode === "demo" ? "Simulated power control" : "Power control"}
        </Label>
        <Body>
          {mode === "demo"
            ? "This changes the offline demo lamp only."
            : "Sends an On or Off request through Home Assistant."}
        </Body>
      </View>
      {mode === "homeAssistant" && (
        <View style={control.group}>
          {review ? (
            <>
              <Notice tone="warning" title={`Allow ${entity.name}?`}>
                Only allow a lamp or a load you can safely switch. This
                permission applies to this device in this home. Allowing it
                sends no power request.
              </Notice>
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
      <View style={control.actions}>
        {[true, false].map((on) => {
          // The observed state is not an action: its side stays flat.
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
              style={({ pressed, hovered }: Interaction) => [
                control.action,
                selected && control.current,
                hovered && !disabled && control.hovered,
                pressed && !disabled && control.pressed,
                (!!blocked || busy) && control.disabled,
              ]}
            >
              {!disabled && <Icon name="power" size={18} color={colors.text} />}
              <Text style={[control.actionText, disabled && control.muted]}>
                {on ? "Turn on" : "Turn off"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {blocked && <Body>{blocked}</Body>}
      {outcome && look && (
        <View
          accessibilityLiveRegion="polite"
          testID="switch-outcome"
          style={control.group}
        >
          <Notice
            tone={look.tone}
            icon={look.icon}
            title={`Requested ${
              outcome.desired.intent.kind === "setSwitch" &&
              outcome.desired.intent.on
                ? "On"
                : "Off"
            }`}
          >
            {switchOutcomeText(outcome, mode === "demo")}
          </Notice>
          {!busy && (
            <Button
              title="Dismiss result"
              variant="quiet"
              style={control.dismiss}
              onPress={dismissOutcome}
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
const control = StyleSheet.create({
  head: { gap: spacing.xs },
  group: { gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.md },
  action: {
    flex: 1,
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.raised,
  },
  current: { backgroundColor: "transparent", borderColor: colors.border },
  hovered: { backgroundColor: colors.hover },
  pressed: { backgroundColor: colors.accentSurface },
  disabled: { opacity: 0.45 },
  actionText: { ...typography.body, color: colors.text, fontWeight: "600" },
  muted: { color: colors.muted },
  dismiss: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    marginLeft: -spacing.sm,
  },
});
