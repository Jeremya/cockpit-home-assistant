import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import { Icon, type IconName } from "../../components/EntityIcon";
import { demoHome, quickActions } from "./data";
import {
  BottomBar,
  GlassButton,
  Pill,
  StatusRing,
  Toggle,
  sans,
  shortShadow,
} from "./parts";

const c = {
  bg: "#06090F",
  surface: "#0D141E",
  elevated: "#121B27",
  text: "#F2F7FC",
  muted: "#9AABBD",
  faint: "#7D8C9E",
  accent: "#7DD3FC",
  accentSoft: "rgba(125,211,252,0.12)",
  mint: "#5EEAD4",
  warning: "#F0B35E",
  danger: "#FF8A9B",
  border: "rgba(255,255,255,0.08)",
  track: "#1A2534",
};

const roomTone: Record<string, string> = {
  living: c.accent,
  kitchen: c.mint,
  entry: c.warning,
  office: c.muted,
};

function QuickTile({
  icon,
  label,
  detail,
  tone,
  active,
}: {
  icon: IconName;
  label: string;
  detail: string;
  tone: string;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${detail}`}
      style={[
        styles.quick,
        active && { borderColor: `${tone}66`, backgroundColor: `${tone}14` },
      ]}
    >
      <View style={[styles.quickIcon, { backgroundColor: `${tone}1F` }]}>
        <Icon name={icon} size={19} color={tone} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
      <Text style={[styles.quickDetail, active && { color: tone }]}>
        {detail}
      </Text>
    </Pressable>
  );
}

function DeviceRow({
  icon,
  name,
  meta,
  value,
  tone,
  control,
  first,
}: {
  icon: IconName;
  name: string;
  meta: string;
  value: string;
  tone?: string;
  control?: React.ReactNode;
  first?: boolean;
}) {
  return (
    <View
      style={[
        styles.deviceRow,
        !first && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.border,
        },
      ]}
    >
      <View
        style={[
          styles.deviceIcon,
          { backgroundColor: `${tone ?? c.accent}14` },
        ]}
      >
        <Icon name={icon} size={17} color={tone ?? c.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.deviceName}>{name}</Text>
        <Text style={styles.deviceMeta}>{meta}</Text>
      </View>
      <Text
        style={[
          styles.deviceValue,
          tone === c.warning && { color: c.warning },
          tone === c.mint && { color: c.mint },
        ]}
      >
        {value}
      </Text>
      {control ?? <Icon name="chevron-right" size={15} color={c.faint} />}
    </View>
  );
}

export function ConceptC() {
  const [lampOn, setLampOn] = useState(true);
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Svg
        pointerEvents="none"
        viewBox="0 0 390 420"
        preserveAspectRatio="none"
        style={styles.ambient}
      >
        <Defs>
          <RadialGradient id="glowA" cx="0.2" cy="0" r="0.8">
            <Stop offset="0" stopColor={c.accent} stopOpacity="0.20" />
            <Stop offset="0.55" stopColor={c.accent} stopOpacity="0.04" />
            <Stop offset="1" stopColor={c.accent} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="glowB" cx="0.9" cy="0.1" r="0.7">
            <Stop offset="0" stopColor={c.mint} stopOpacity="0.12" />
            <Stop offset="1" stopColor={c.mint} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="78" cy="30" rx="220" ry="180" fill="url(#glowA)" />
        <Ellipse cx="360" cy="50" rx="180" ry="160" fill="url(#glowB)" />
      </Svg>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Text style={styles.wordmark}>MAURICE</Text>
            <Pill color={c.accent} background={c.accentSoft}>
              DEMO
            </Pill>
            <View style={{ flex: 1 }} />
            <GlassButton
              icon="sliders"
              label="Settings"
              color={c.muted}
              background="rgba(255,255,255,0.05)"
              border={c.border}
            />
          </View>
          <Text style={styles.greeting}>Good evening</Text>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Your home</Text>
            <View style={styles.statusPill}>
              <View style={styles.alertDot} />
              <Text style={styles.statusPillText}>1 ALERT</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>{demoHome.quietLabel}</Text>
        </View>

        <View style={styles.pulse}>
          <View style={styles.pulseLeft}>
            <StatusRing
              size={146}
              colors={{
                track: c.track,
                ok: c.mint,
                warning: c.warning,
                cool: c.accent,
                text: c.text,
                muted: c.faint,
              }}
            />
          </View>
          <View style={styles.pulseCopy}>
            <Text style={styles.eyebrow}>HOME PULSE</Text>
            <Text style={styles.pulseTitle}>1 alert</Text>
            <Text style={styles.pulseMeta}>1 device on · 3 quiet rooms</Text>
            <View style={styles.pulseBars}>
              {demoHome.rooms.map((room) => (
                <View key={room.id} style={styles.pulseBarRow}>
                  <View
                    style={[
                      styles.pulseBarDot,
                      { backgroundColor: roomTone[room.id] },
                    ]}
                  />
                  <Text style={styles.pulseBarLabel}>{room.name}</Text>
                  <Text style={styles.pulseBarValue}>{room.status}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.quickRow}>
          {quickActions.map((action) => (
            <QuickTile
              key={action.id}
              icon={action.icon}
              label={action.label}
              detail={
                action.id === "lights"
                  ? lampOn
                    ? "1 on"
                    : "All off"
                  : action.detail
              }
              tone={
                action.id === "lights"
                  ? c.accent
                  : action.id === "climate"
                    ? c.mint
                    : action.id === "security"
                      ? c.warning
                      : c.muted
              }
              active={action.id === "lights" && lampOn}
            />
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Rooms</Text>
          <Text style={styles.sectionAction}>View all</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.roomRail}
        >
          {demoHome.rooms.map((room) => {
            const filled = room.on;
            return (
              <Pressable
                key={room.id}
                accessibilityRole="button"
                accessibilityLabel={`${room.name}: ${room.status}`}
                style={styles.roomCard}
              >
                <View
                  style={[
                    styles.roomAccent,
                    { backgroundColor: roomTone[room.id] },
                  ]}
                />
                <View style={styles.roomCardTop}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  <View
                    style={[
                      styles.roomDot,
                      { backgroundColor: roomTone[room.id] },
                    ]}
                  />
                </View>
                <Text style={styles.roomStatus}>{room.status}</Text>
                <View style={styles.roomSegments}>
                  {Array.from({ length: room.devices }).map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.roomSegment,
                        {
                          backgroundColor:
                            index < filled ? roomTone[room.id] : c.track,
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.roomMeta}>
                  {room.devices} {room.devices === 1 ? "device" : "devices"}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Devices</Text>
          <Text style={styles.sectionAction}>5 devices</Text>
        </View>
        <View style={styles.deviceList}>
          <DeviceRow
            first
            icon="toggle-right"
            name="Living room lamp"
            meta="Living room · confirmed"
            value={lampOn ? "On" : "Off"}
            tone={c.accent}
            control={
              <Toggle
                value={lampOn}
                onChange={setLampOn}
                colors={{
                  on: c.accent,
                  off: "rgba(255,255,255,0.16)",
                  knob: "#F4FAFF",
                }}
              />
            }
          />
          <DeviceRow
            icon="unlock"
            name="Front door"
            meta="Entryway · read-only"
            value="Unlocked"
            tone={c.warning}
          />
          <DeviceRow
            icon="thermometer"
            name="Kitchen fridge"
            meta="Kitchen · door closed"
            value="4°C"
            tone={c.mint}
          />
          <DeviceRow
            icon="thermometer"
            name="Hallway climate"
            meta="Office · 45% humidity"
            value="21.5°C"
            tone={c.accent}
          />
          <DeviceRow
            icon="clock"
            name="Cat feeder"
            meta="Kitchen · last fed 08:00"
            value="18:00"
            tone={c.muted}
          />
        </View>

        <Text style={styles.footnote}>Demo home · simulated observations</Text>
      </ScrollView>

      <BottomBar
        active="home"
        colors={{
          surface: "#090E15",
          border: c.border,
          text: c.text,
          muted: c.faint,
          accent: c.accent,
        }}
        items={[
          { id: "home", label: "Home", icon: "home" },
          { id: "rooms", label: "Rooms", icon: "grid" },
          { id: "devices", label: "Devices", icon: "cpu" },
          { id: "activity", label: "Activity", icon: "activity" },
          { id: "settings", label: "Settings", icon: "sliders" },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  ambient: { position: "absolute", top: 0, left: 0, right: 0, height: 420 },
  content: { paddingTop: 22, paddingHorizontal: 18, paddingBottom: 124 },
  header: { paddingHorizontal: 2 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  wordmark: {
    fontFamily: sans,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.6,
    color: c.faint,
  },
  greeting: {
    fontFamily: sans,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: c.muted,
    marginTop: 20,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  title: {
    fontFamily: sans,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1.2,
    color: c.text,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(240,179,94,0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(240,179,94,0.3)",
  },
  alertDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.warning,
  },
  statusPillText: {
    fontFamily: sans,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.warning,
  },
  subtitle: { fontFamily: sans, fontSize: 13, color: c.muted, marginTop: 5 },
  pulse: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
    padding: 14,
    borderRadius: 26,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    ...shortShadow(0.35, 24, 12),
  },
  pulseLeft: { width: 146 },
  pulseCopy: { flex: 1, gap: 3 },
  eyebrow: {
    fontFamily: sans,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.8,
    color: c.faint,
  },
  pulseTitle: {
    fontFamily: sans,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.8,
    color: c.text,
  },
  pulseMeta: { fontFamily: sans, fontSize: 10.5, color: c.muted },
  pulseBars: { marginTop: 8, gap: 6 },
  pulseBarRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  pulseBarDot: { width: 5, height: 5, borderRadius: 3 },
  pulseBarLabel: { fontFamily: sans, fontSize: 9.5, color: c.muted, flex: 1 },
  pulseBarValue: {
    fontFamily: sans,
    fontSize: 9.5,
    fontWeight: "600",
    color: c.faint,
  },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  quick: {
    flex: 1,
    minHeight: 96,
    borderRadius: 20,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    padding: 10,
    justifyContent: "space-between",
  },
  quickIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    fontFamily: sans,
    fontSize: 11,
    fontWeight: "600",
    color: c.text,
    marginTop: 4,
  },
  quickDetail: { fontFamily: sans, fontSize: 9.5, color: c.faint },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: sans,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: c.text,
  },
  sectionAction: {
    fontFamily: sans,
    fontSize: 11,
    fontWeight: "600",
    color: c.faint,
  },
  roomRail: { gap: 10, paddingRight: 4 },
  roomCard: {
    width: 156,
    minHeight: 132,
    borderRadius: 20,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    padding: 12,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  roomAccent: {
    position: "absolute",
    left: 0,
    top: 14,
    bottom: 14,
    width: 2,
    borderRadius: 2,
  },
  roomCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roomDot: { width: 6, height: 6, borderRadius: 3 },
  roomName: {
    fontFamily: sans,
    fontSize: 13,
    fontWeight: "600",
    color: c.text,
  },
  roomStatus: {
    fontFamily: sans,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: c.text,
    marginTop: 4,
  },
  roomSegments: { flexDirection: "row", gap: 3, marginTop: 8 },
  roomSegment: { flex: 1, height: 3, borderRadius: 2 },
  roomMeta: { fontFamily: sans, fontSize: 9.5, color: c.faint, marginTop: 6 },
  deviceList: {
    borderRadius: 22,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    overflow: "hidden",
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
    minHeight: 60,
  },
  deviceIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  deviceName: {
    fontFamily: sans,
    fontSize: 12.5,
    fontWeight: "600",
    color: c.text,
  },
  deviceMeta: { fontFamily: sans, fontSize: 10, color: c.faint },
  deviceValue: {
    fontFamily: sans,
    fontSize: 12,
    fontWeight: "600",
    color: c.muted,
  },
  footnote: {
    fontFamily: sans,
    fontSize: 10,
    color: c.faint,
    textAlign: "center",
    marginTop: 20,
  },
});
