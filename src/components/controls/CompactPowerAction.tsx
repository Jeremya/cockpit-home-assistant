import { Pressable, StyleSheet, Text, View } from "react-native";
import { switchOutcomeText } from "../../commands/switchControl";
import type { EntityRecord, HomeSnapshot } from "../../core/types";
import {
  colors,
  layout,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "../../theme";
import { Icon } from "../EntityIcon";
import type { Interaction } from "../ui";
import { outcomeTone } from "./outcomeTone";
import { useSwitchCommand } from "./useSwitchCommand";

const toneInk = {
  neutral: colors.muted,
  accent: colors.accent,
  warning: colors.warning,
  danger: colors.danger,
  observed: colors.comfort,
} as const;

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
  const look = outcome ? outcomeTone(outcome) : null;
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
          style={({ pressed, hovered }: Interaction) => [
            action.button,
            hovered && action.hovered,
            pressed && action.pressed,
            disabled && action.disabled,
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
      {outcome && look && (
        <View
          accessibilityLiveRegion="polite"
          testID="card-switch-outcome"
          style={action.outcome}
        >
          <View style={action.outcomeRow}>
            <View style={action.outcomeIcon}>
              <Icon name={look.icon} size={14} color={toneInk[look.tone]} />
            </View>
            <Text style={[action.text, action.outcomeText]}>
              <Text style={[action.strong, { color: toneInk[look.tone] }]}>
                Requested{" "}
                {outcome.desired.intent.kind === "setSwitch" &&
                outcome.desired.intent.on
                  ? "On"
                  : "Off"}
              </Text>
              : {switchOutcomeText(outcome, mode === "demo")}
            </Text>
          </View>
          {!busy && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Dismiss result for ${entity.name}`}
              onPress={dismissOutcome}
              style={({ pressed, hovered }: Interaction) => [
                action.dismiss,
                (hovered || pressed) && action.dismissActive,
              ]}
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
    paddingHorizontal: layout.cardPadding,
    paddingBottom: layout.cardPadding,
  },
  button: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.raised,
  },
  hovered: { backgroundColor: colors.hover },
  pressed: { backgroundColor: colors.accentSurface },
  disabled: { opacity: 0.45 },
  buttonText: { ...typography.body, color: colors.text, fontWeight: "600" },
  outcome: { gap: 0 },
  outcomeRow: { flexDirection: "row", gap: spacing.sm },
  outcomeIcon: { paddingTop: 3 },
  text: { ...typography.secondary, color: colors.text },
  outcomeText: { flex: 1 },
  strong: { fontWeight: "600" },
  muted: { ...typography.secondary, color: colors.muted },
  dismiss: {
    minHeight: minTouchTarget,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    marginLeft: 14,
    borderRadius: radii.control,
  },
  dismissActive: { backgroundColor: colors.raised },
  link: { ...typography.secondary, color: colors.accent, fontWeight: "600" },
});
