import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Icon } from "../../components/EntityIcon";
import { demoHome, quickActions } from "./data";
import {
  BottomBar,
  GlassButton,
  LightPlan,
  SectionHeader,
  Toggle,
  sans,
  shortShadow,
} from "./parts";

const c = {
  bg: "#F5F2EB",
  surface: "#FFFFFF",
  alt: "#EAE3D6",
  text: "#1D1B17",
  muted: "#625E56",
  faint: "#736D64",
  accent: "#1F6F5C",
  accentSoft: "#DCECE4",
  warning: "#A65A24",
  warningSoft: "#F5E3D3",
  cool: "#3B6B80",
  coolSoft: "#E2EEF3",
  border: "#E9E3D8",
  shadow: "#47443D",
};

const tint = {
  ok: c.accent,
  warning: c.warning,
  neutral: c.faint,
};

function Action({
  label,
  detail,
  icon,
  background,
  color,
}: {
  label: string;
  detail: string;
  icon: Parameters<typeof Icon>[0]["name"];
  background: string;
  color: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${detail}`}
      style={styles.action}
    >
      <View style={[styles.actionCircle, { backgroundColor: background }]}>
        <Icon name={icon} size={22} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionDetail}>{detail}</Text>
    </Pressable>
  );
}

export function ConceptA() {
  const [lampOn, setLampOn] = useState(true);
  const active = "home";
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={styles.brandRow}>
              <Text style={styles.wordmark}>MAURICE</Text>
              <View style={styles.demoPill}>
                <Text style={styles.demoText}>DEMO</Text>
              </View>
            </View>
            <Text style={styles.greeting}>{demoHome.greeting}</Text>
          </View>
          <GlassButton
            icon="sliders"
            label="Settings"
            color={c.muted}
            background={c.surface}
            border={c.border}
            size={42}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="1 thing needs attention"
          style={styles.statusRow}
        >
          <View style={styles.alertDot} />
          <Text style={styles.statusText}>{demoHome.attentionLabel}</Text>
          <Icon name="chevron-right" size={16} color={c.faint} />
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>MY HOME</Text>
            <Text style={styles.heroTitle}>Maison</Text>
            <Text style={styles.heroMeta}>
              {demoHome.rooms.length} rooms · Floor 1
            </Text>
            <View style={styles.heroLink}>
              <Text style={styles.heroLinkText}>Open house</Text>
              <Icon name="arrow-up-right" size={14} color={c.accent} />
            </View>
          </View>
          <View style={styles.heroArt}>
            <LightPlan />
          </View>
        </View>

        <View style={styles.actions}>
          {quickActions.map((action) => (
            <Action
              key={action.id}
              label={action.label}
              detail={
                action.id === "lights"
                  ? lampOn
                    ? "1 on"
                    : "All off"
                  : action.detail
              }
              icon={action.icon}
              background={
                action.id === "lights"
                  ? c.accentSoft
                  : action.id === "climate"
                    ? c.coolSoft
                    : action.id === "security"
                      ? c.warningSoft
                      : c.alt
              }
              color={
                action.id === "lights"
                  ? c.accent
                  : action.id === "climate"
                    ? c.cool
                    : action.id === "security"
                      ? c.warning
                      : c.muted
              }
            />
          ))}
        </View>

        <SectionHeader title="Favorites" action="Edit" colors={c} />
        <View style={styles.grid}>
          <View style={[styles.card, styles.favorite]}>
            <View style={styles.cardTop}>
              <View
                style={[styles.iconCircle, { backgroundColor: c.accentSoft }]}
              >
                <Icon name="toggle-right" size={18} color={c.accent} />
              </View>
              <Text style={styles.cardName}>Lamp</Text>
            </View>
            <Text style={styles.cardValue}>{lampOn ? "On" : "Off"}</Text>
            <View style={styles.cardBottom}>
              <Text style={styles.cardMeta}>
                Living room · {lampOn ? "Confirmed" : "Off"}
              </Text>
              <Toggle
                value={lampOn}
                onChange={setLampOn}
                colors={{ on: c.accent, off: "#D8D2C7", knob: "#FFFFFF" }}
              />
            </View>
          </View>

          <View style={[styles.card, styles.favorite]}>
            <View style={styles.cardTop}>
              <View
                style={[styles.iconCircle, { backgroundColor: c.warningSoft }]}
              >
                <Icon name="unlock" size={18} color={c.warning} />
              </View>
              <Text style={styles.cardName}>Front door</Text>
            </View>
            <View style={styles.valueRow}>
              <View style={[styles.dot, { backgroundColor: c.warning }]} />
              <Text style={styles.cardValue}>Unlocked</Text>
            </View>
            <View style={styles.cardBottom}>
              <Text style={styles.cardMeta}>Entryway · read-only</Text>
              <Icon name="chevron-right" size={16} color={c.faint} />
            </View>
          </View>

          <View style={[styles.card, styles.favorite]}>
            <View style={styles.cardTop}>
              <View
                style={[styles.iconCircle, { backgroundColor: c.coolSoft }]}
              >
                <Icon name="thermometer" size={18} color={c.cool} />
              </View>
              <Text style={styles.cardName}>Fridge</Text>
            </View>
            <Text style={styles.cardValue}>4°C</Text>
            <View style={styles.cardBottom}>
              <Text style={styles.cardMeta}>Kitchen · door closed</Text>
              <Icon name="chevron-right" size={16} color={c.faint} />
            </View>
          </View>

          <View style={[styles.card, styles.favorite]}>
            <View style={styles.cardTop}>
              <View
                style={[styles.iconCircle, { backgroundColor: c.coolSoft }]}
              >
                <Icon name="thermometer" size={18} color={c.cool} />
              </View>
              <Text style={styles.cardName}>Climate</Text>
            </View>
            <Text style={styles.cardValue}>21.5°</Text>
            <View style={styles.cardBottom}>
              <Text style={styles.cardMeta}>Office · 45% humidity</Text>
              <Icon name="chevron-right" size={16} color={c.faint} />
            </View>
          </View>
        </View>

        <SectionHeader title="Rooms" action="All rooms" colors={c} />
        <View style={styles.grid}>
          {demoHome.rooms.map((room) => (
            <Pressable
              key={room.id}
              accessibilityRole="button"
              accessibilityLabel={`${room.name}, ${room.status}`}
              style={[styles.card, styles.roomCard]}
            >
              <View style={styles.roomTop}>
                <Text style={styles.roomName}>{room.name}</Text>
                <View
                  style={[styles.dot, { backgroundColor: tint[room.tone] }]}
                />
              </View>
              <Text style={styles.roomMeta}>
                {room.devices} {room.devices === 1 ? "device" : "devices"}
              </Text>
              <Text style={styles.roomStatus}>{room.status}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.footnote}>Demo home · simulated observations</Text>
      </ScrollView>

      <BottomBar
        active={active}
        colors={{
          surface: "#FFFFFF",
          border: c.border,
          text: c.text,
          muted: c.faint,
          accent: c.accent,
        }}
        items={[
          { id: "home", label: "Home", icon: "home" },
          { id: "rooms", label: "Rooms", icon: "grid" },
          { id: "activity", label: "Activity", icon: "activity" },
          { id: "settings", label: "Settings", icon: "sliders" },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: {
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 150,
    gap: 18,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
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
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1.2,
    color: c.text,
    marginTop: 3,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  alertDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.warning,
  },
  statusText: {
    fontFamily: sans,
    fontSize: 14,
    fontWeight: "500",
    color: c.muted,
  },
  hero: {
    height: 176,
    borderRadius: 28,
    backgroundColor: c.alt,
    overflow: "hidden",
    flexDirection: "row",
    ...shortShadow(0.1, 22, 10),
  },
  heroCopy: { width: "42%", padding: 16, justifyContent: "space-between" },
  eyebrow: {
    fontFamily: sans,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2.2,
    color: c.muted,
  },
  heroTitle: {
    fontFamily: sans,
    fontSize: 27,
    fontWeight: "700",
    letterSpacing: -0.9,
    color: c.text,
  },
  heroMeta: {
    fontFamily: sans,
    fontSize: 12,
    color: c.muted,
  },
  heroLink: { flexDirection: "row", alignItems: "center", gap: 5 },
  heroLinkText: {
    fontFamily: sans,
    fontSize: 12,
    fontWeight: "700",
    color: c.accent,
  },
  heroArt: { flex: 1, padding: 8, paddingLeft: 0, paddingRight: 12 },
  demoPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: c.alt,
  },
  demoText: {
    fontFamily: sans,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: c.muted,
  },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1, alignItems: "center", gap: 6 },
  actionCircle: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontFamily: sans,
    fontSize: 12,
    fontWeight: "600",
    color: c.text,
  },
  actionDetail: { fontFamily: sans, fontSize: 10, color: c.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    backgroundColor: c.surface,
    borderRadius: 22,
    padding: 14,
    ...shortShadow(0.06, 16, 8),
  },
  favorite: { width: "48.3%", minHeight: 118, justifyContent: "space-between" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: {
    fontFamily: sans,
    fontSize: 13,
    fontWeight: "600",
    color: c.muted,
    flexShrink: 1,
  },
  cardValue: {
    fontFamily: sans,
    fontSize: 23,
    fontWeight: "700",
    letterSpacing: -0.6,
    color: c.text,
  },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  cardMeta: { fontFamily: sans, fontSize: 10.5, color: c.faint, flexShrink: 1 },
  roomCard: { width: "48.3%", minHeight: 96, justifyContent: "space-between" },
  roomTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roomName: {
    fontFamily: sans,
    fontSize: 15,
    fontWeight: "600",
    color: c.text,
  },
  roomMeta: { fontFamily: sans, fontSize: 11, color: c.faint },
  roomStatus: {
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
    marginTop: 2,
  },
});
