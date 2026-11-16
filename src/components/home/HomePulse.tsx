import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../ui";
import { layout, radii, spacing, typography } from "../../theme";

export interface HomePulseRoom {
  id: string;
  name: string;
  devices: number;
  alerts: number;
}

/**
 * A composition of real counts, not a health score: room count, device count
 * and the existing attention count. Cached sessions never show a green state.
 */
export function HomePulse({
  rooms,
  devices,
  alerts,
  ready,
  cached = true,
}: {
  rooms: HomePulseRoom[];
  devices: number;
  alerts: number;
  ready: boolean;
  /** False before the first connection: nothing was observed, so nothing is cached. */
  cached?: boolean;
}) {
  // Real households often have more rooms than the ring can show, and many
  // unlinked rooms have no devices. Prioritise the rooms that carry data.
  const relevant = rooms
    .filter((room) => room.devices > 0 || room.alerts > 0)
    .sort(
      (a, b) =>
        b.alerts - a.alerts ||
        b.devices - a.devices ||
        a.name.localeCompare(b.name),
    );
  const shown = relevant.slice(0, 6);
  const listed = relevant.slice(0, 4);
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const segment = shown.length ? circumference / shown.length : 0;
  const dash = segment * 0.7;
  // A narrow column keeps the room list readable by giving up ring, not type.
  const [width, setWidth] = useState(0);
  const ring = width > 0 && width < 350 ? 108 : 132;
  return (
    <View
      style={styles.card}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityLabel={
        ready
          ? `Home pulse: ${alerts} alerts, ${devices} devices, ${rooms.length} rooms`
          : cached
            ? "Home pulse: cached until reconnect"
            : "Home pulse: connect your home"
      }
    >
      <View style={[styles.ringWrap, { width: ring, height: ring }]}>
        <Svg width={ring} height={ring} viewBox="0 0 132 132">
          <Circle
            cx={66}
            cy={66}
            r={radius}
            fill="none"
            stroke={colors.raised}
            strokeWidth={10}
          />
          {shown.map((room, index) => (
            <Circle
              key={room.id}
              cx={66}
              cy={66}
              r={radius}
              fill="none"
              stroke={
                !ready
                  ? colors.muted
                  : room.alerts
                    ? colors.warning
                    : room.devices
                      ? colors.accent
                      : colors.raised
              }
              strokeWidth={10}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={-index * segment}
              transform="rotate(-90 66 66)"
            />
          ))}
        </Svg>
        <View style={styles.ringCenter}>
          {/* Inside a fixed ring: the count is repeated, fully scaled, beside it. */}
          <Text maxFontSizeMultiplier={1.3} style={styles.ringValue}>
            {rooms.length}
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.ringLabel}>
            ROOMS
          </Text>
        </View>
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>HOME PULSE</Text>
        <Text
          style={[
            styles.title,
            !ready
              ? { color: colors.muted }
              : alerts
                ? { color: colors.warning }
                : undefined,
          ]}
        >
          {!ready
            ? "Status unknown"
            : alerts
              ? `${alerts} ${alerts === 1 ? "alert" : "alerts"}`
              : "All quiet"}
        </Text>
        <Text style={styles.meta}>
          {ready
            ? `${devices} ${devices === 1 ? "device" : "devices"} · ${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`
            : cached
              ? "Cached until reconnect"
              : "Connect your home"}
        </Text>
        <View style={styles.roomList}>
          {listed.map((room) => (
            <View key={room.id} style={styles.roomRow}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: !ready
                      ? colors.muted
                      : room.alerts
                        ? colors.warning
                        : room.devices
                          ? colors.accent
                          : colors.raised,
                  },
                ]}
              />
              <Text numberOfLines={1} style={styles.roomName}>
                {room.name}
              </Text>
              <Text style={styles.roomValue}>
                {!ready
                  ? "cached"
                  : room.alerts
                    ? `${room.alerts} alert${room.alerts === 1 ? "" : "s"}`
                    : `${room.devices} ${room.devices === 1 ? "device" : "devices"}`}
              </Text>
            </View>
          ))}
          {!shown.length && (
            <Text style={styles.meta}>No rooms linked yet.</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // Fills a taller cell when it sits beside the filters.
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: layout.cardPadding,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ringWrap: { alignItems: "center", justifyContent: "center" },
  ringCenter: { position: "absolute", alignItems: "center" },
  ringValue: {
    ...typography.display,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  ringLabel: { ...typography.eyebrow, color: colors.muted, marginTop: -4 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { ...typography.eyebrow, color: colors.accent },
  title: { ...typography.headline, color: colors.text },
  meta: { ...typography.caption, color: colors.muted },
  // Bounded so a count stays beside its room on a wide card.
  roomList: { marginTop: spacing.sm, gap: spacing.xs, maxWidth: 320 },
  roomRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3 },
  roomName: {
    ...typography.secondary,
    flex: 1,
    color: colors.text,
    fontWeight: "500",
  },
  roomValue: {
    ...typography.caption,
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
});
