import { Pressable, StyleSheet, Text, View } from "react-native";
import { switchOutcomeText } from "../../commands/switchControl";
import type { EntityRecord, HomeSnapshot } from "../../core/types";
import { minTouchTarget, radii, spacing, typography } from "../../theme";
import { Icon } from "../EntityIcon";
import { colors } from "../ui";
import { useSwitchCommand } from "./useSwitchCommand";

/** A card's sibling power target; enrollment stays in the device summary. */
export function CompactPowerAction({
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
  const { restriction, blocked, busy, outcome, notice, send, dismissOutcome } =
    useSwitchCommand({ entity, snapshot, profileId, mode, ready });
  // Revocation or lost identity removes the action, not a still-relevant result.
  const allowed = !restriction;
  if (!allowed && !outcome) return null;
  // The intent comes from the displayed observation; unknown states get no inverse.
  const on =
    entity.state === "off" ? true : entity.state === "on" ? false : null;
  const disabled = !!blocked || busy || on === null;
  const explanation =
    blocked ??
    (on === null
      ? "A known On or Off state is required for power control."
      : null);
  return (
    <View style={action.container}>
      {allowed && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            on === null
              ? `${entity.name} power unavailable`
              : `Turn ${entity.name} ${on ? "on" : "off"}`
          }
          accessibilityState={{ disabled, busy }}
          disabled={disabled}
          onPress={() => on !== null && send(on)}
          style={({ pressed }) => [
            action.button,
            { opacity: disabled || pressed ? 0.55 : 1 },
          ]}
        >
          <Icon name="power" size={18} color={colors.text} />
          <Text style={action.buttonText}>
            {on === null ? "Power unavailable" : on ? "Turn on" : "Turn off"}
          </Text>
        </Pressable>
      )}
      {allowed && explanation && (
        <Text style={action.muted}>{explanation}</Text>
      )}
      {outcome && (
        <View
          accessibilityLiveRegion="polite"
          testID="card-switch-outcome"
          style={action.outcome}
        >
          <Text style={action.text}>
            Requested{" "}
            {outcome.desired.intent.kind === "setSwitch" &&
            outcome.desired.intent.on
              ? "On"
              : "Off"}
            : {switchOutcomeText(outcome, mode === "demo")}
          </Text>
          {!busy && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Dismiss result for ${entity.name}`}
              onPress={dismissOutcome}
              style={action.dismiss}
            >
              <Text style={action.link}>Dismiss result</Text>
            </Pressable>
          )}
        </View>
      )}
      {allowed && notice && !busy && (
        <Text accessibilityLiveRegion="polite" style={action.text}>
          {notice}
        </Text>
      )}
    </View>
  );
}
const action = StyleSheet.create({
  container: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  button: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.raised,
  },
  buttonText: { ...typography.body, color: colors.text, fontWeight: "600" },
  outcome: { gap: spacing.xs },
  text: { ...typography.secondary, color: colors.text },
  muted: { ...typography.secondary, color: colors.muted },
  dismiss: { minHeight: minTouchTarget, justifyContent: "center" },
  link: { ...typography.secondary, color: colors.accent },
});
