import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../ui";
import { radii, spacing } from "../../theme";

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
}: {
  rooms: HomePulseRoom[];
  devices: number;
  alerts: number;
  ready: boolean;
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
  return (
    <View
      style={styles.card}
      accessibilityLabel={
        ready
          ? `Home pulse: ${alerts} alerts, ${devices} devices, ${rooms.length} rooms`
          : "Home pulse: cached until reconnect"
      }
    >
      <View style={styles.ringWrap}>
        <Svg width={132} height={132} viewBox="0 0 132 132">
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
          <Text style={styles.ringValue}>{rooms.length}</Text>
          <Text style={styles.ringLabel}>ROOMS</Text>
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
            : "Cached until reconnect"}
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ringWrap: {
    width: 132,
    height: 132,
    alignItems: "center",
    justifyContent: "center",
  },
  ringCenter: { position: "absolute", alignItems: "center" },
  ringValue: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
  },
  ringLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginTop: 1,
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: {
    color: colors.accent,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  meta: { color: colors.muted, fontSize: 10.5 },
  roomList: { marginTop: spacing.sm, gap: 5 },
  roomRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  roomName: { flex: 1, color: colors.text, fontSize: 10.5, fontWeight: "500" },
  roomValue: {
    color: colors.muted,
    fontSize: 9.5,
    fontVariant: ["tabular-nums"],
  },
});
