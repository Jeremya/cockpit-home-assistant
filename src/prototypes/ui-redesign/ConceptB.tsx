import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Icon, type IconName } from "../../components/EntityIcon";
import { CockpitSceneView } from "../../components/CockpitSceneView";
import { sampleHouse } from "../../spatial/plans";
import { demoHome } from "./data";
import {
  BottomBar,
  GlassButton,
  HeroShade,
  RoomMini,
  Toggle,
  sans,
  serif,
  shortShadow,
} from "./parts";

const c = {
  bg: "#0B0E12",
  surface: "#12171D",
  elevated: "#171D24",
  text: "#F5F0E8",
  muted: "#A29A8F",
  faint: "#8A8177",
  accent: "#D7AA6B",
  accentSoft: "rgba(215,170,107,0.14)",
  success: "#91BFA1",
  warning: "#E1A65B",
  cool: "#8FB6C9",
  border: "rgba(255,255,255,0.09)",
};

const roomTone: Record<string, string> = {
  living: c.accent,
  kitchen: c.success,
  entry: c.warning,
  office: c.cool,
};

function Bedrock({
  icon,
  label,
  value,
  meta,
  tone = c.accent,
  toggle,
}: {
  icon: IconName;
  label: string;
  value: string;
  meta: string;
  tone?: string;
  toggle?: React.ReactNode;
}) {
  return (
    <View style={styles.bedrock}>
      <View style={styles.bedrockTop}>
        <View style={[styles.iconCircle, { backgroundColor: `${tone}1F` }]}>
          <Icon name={icon} size={18} color={tone} />
        </View>
        <Text style={styles.bedrockLabel}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={styles.bedrockValue}>
        {value}
      </Text>
      <View style={styles.bedrockBottom}>
        <Text style={styles.bedrockMeta}>{meta}</Text>
        {toggle}
      </View>
    </View>
  );
}

export function ConceptB() {
  const [lampOn, setLampOn] = useState(true);
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Text style={styles.wordmark}>MAURICE</Text>
            <View style={styles.simPill}>
              <Text style={styles.simText}>SIMULATED</Text>
            </View>
            <View style={{ flex: 1 }} />
            <GlassButton
              icon="sliders"
              label="Settings"
              color={c.muted}
              background="rgba(255,255,255,0.06)"
              border={c.border}
            />
          </View>
          <Text style={styles.date}>{demoHome.date}</Text>
          <Text style={styles.title}>My home</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={demoHome.attentionLabel}
            style={styles.statusRow}
          >
            <View style={styles.alertDot} />
            <Text style={styles.status}>{demoHome.attentionLabel}</Text>
            <Icon name="chevron-right" size={15} color={c.faint} />
          </Pressable>
        </View>

        <View style={styles.hero}>
          <CockpitSceneView
            floor={sampleHouse.floors[0]!}
            markers={[]}
            selectedRoomId={null}
            onRoomPress={() => undefined}
            onMarkerPress={() => undefined}
            height={360}
            cameraMode="model"
            visible
          />
          <HeroShade top />
          <HeroShade />
          <View pointerEvents="none" style={styles.heroTop}>
            <Text style={styles.heroEyebrow}>FLOOR 1 · 4 ROOMS</Text>
            <Text style={styles.heroLabel}>Architectural view</Text>
          </View>
          <View style={styles.heroBottom}>
            <View>
              <Text style={styles.heroCaption}>Ma maison</Text>
              <Text style={styles.heroRoom}>Living room · Kitchen</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open the full floor plan"
              style={styles.openPlan}
            >
              <Text style={styles.openPlanText}>Open plan</Text>
              <Icon name="arrow-up-right" size={15} color={c.accent} />
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Now</Text>
            <Text style={styles.sectionAction}>1 active</Text>
          </View>
          <View style={styles.bedrockRow}>
            <Bedrock
              icon="toggle-right"
              label="Lamp"
              value={lampOn ? "On" : "Off"}
              meta="Living room · confirmed"
              toggle={
                <Toggle
                  value={lampOn}
                  onChange={setLampOn}
                  colors={{
                    on: c.accent,
                    off: "rgba(255,255,255,0.16)",
                    knob: "#F8F3EA",
                  }}
                />
              }
            />
            <Bedrock
              icon="unlock"
              label="Front door"
              value="Unlocked"
              meta="Entryway · read-only"
              tone={c.warning}
              toggle={<Icon name="chevron-right" size={17} color={c.faint} />}
            />
          </View>
        </View>

        <View style={styles.roomRail}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.roomRailContent}
          >
            {demoHome.rooms.map((room) => (
              <Pressable
                key={room.id}
                accessibilityRole="button"
                accessibilityLabel={`${room.name}: ${room.status}`}
                style={styles.roomCard}
              >
                <View style={styles.roomArt}>
                  <RoomMini
                    kind={room.id as never}
                    accent={roomTone[room.id]!}
                  />
                </View>
                <View style={styles.roomCopy}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  <Text style={styles.roomStatus}>{room.status}</Text>
                </View>
                <View
                  style={[
                    styles.tinyDot,
                    { backgroundColor: roomTone[room.id] },
                  ]}
                />
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Elsewhere</Text>
            <Text style={styles.sectionAction}>3 readings</Text>
          </View>
          <View style={styles.list}>
            {[
              demoHome.devices[2]!,
              demoHome.devices[3]!,
              demoHome.devices[4]!,
            ].map((device, index) => (
              <Pressable
                key={device.id}
                accessibilityRole="button"
                accessibilityLabel={`${device.name}: ${device.state}`}
                style={[
                  styles.listRow,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: c.border,
                  },
                ]}
              >
                <View style={styles.listIcon}>
                  <Icon name={device.icon} size={17} color={c.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listName}>{device.name}</Text>
                  <Text style={styles.listMeta}>{device.room}</Text>
                </View>
                <Text
                  style={[
                    styles.listValue,
                    device.tone === "warning" && { color: c.warning },
                  ]}
                >
                  {device.state}
                </Text>
                <Icon name="chevron-right" size={15} color={c.faint} />
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.footnote}>Demo home · simulated observations</Text>
      </ScrollView>

      <Svg
        pointerEvents="none"
        viewBox="0 0 390 130"
        preserveAspectRatio="none"
        style={styles.navScrim}
      >
        <Defs>
          <LinearGradient id="navFade" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={c.bg} stopOpacity="1" />
            <Stop offset="1" stopColor={c.bg} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="390" height="130" fill="url(#navFade)" />
      </Svg>
      <BottomBar
        floating
        active="home"
        colors={{
          surface: "#12171D",
          border: c.border,
          text: c.text,
          muted: c.faint,
          accent: c.accent,
        }}
        items={[
          { id: "home", label: "Home", icon: "home" },
          { id: "rooms", label: "Rooms", icon: "grid" },
          { id: "plan", label: "Plan", icon: "layers" },
          { id: "settings", label: "Settings", icon: "sliders" },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingTop: 14, paddingBottom: 140 },
  navScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 130,
  },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  wordmark: {
    fontFamily: sans,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.6,
    color: c.faint,
  },
  simPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  simText: {
    fontFamily: sans,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
    color: c.muted,
  },
  date: {
    fontFamily: sans,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.8,
    color: c.faint,
    marginTop: 12,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: serif,
    fontSize: 38,
    fontWeight: "500",
    letterSpacing: -1.4,
    color: c.text,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 6,
  },
  alertDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.warning,
  },
  status: { fontFamily: sans, fontSize: 13, color: c.muted },
  hero: {
    marginHorizontal: 16,
    height: 360,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#0A0E1A",
    ...shortShadow(0.42, 26, 14),
  },
  heroTop: { position: "absolute", top: 18, left: 18, right: 18 },
  heroEyebrow: {
    fontFamily: sans,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
    color: c.accent,
  },
  heroLabel: {
    fontFamily: serif,
    fontSize: 22,
    color: c.text,
    marginTop: 3,
  },
  heroBottom: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroCaption: {
    fontFamily: sans,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.6,
    color: c.muted,
    textTransform: "uppercase",
  },
  heroRoom: {
    fontFamily: sans,
    fontSize: 14,
    fontWeight: "600",
    color: c.text,
    marginTop: 2,
  },
  openPlan: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: "rgba(15,19,24,0.82)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  openPlanText: {
    fontFamily: sans,
    fontSize: 12,
    fontWeight: "700",
    color: c.text,
  },
  roomRail: { marginTop: 24 },
  roomRailContent: { paddingHorizontal: 16, gap: 10 },
  roomCard: {
    width: 164,
    height: 124,
    borderRadius: 20,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    overflow: "hidden",
  },
  roomArt: { height: 72 },
  roomCopy: { paddingHorizontal: 11, paddingVertical: 7, gap: 1 },
  roomName: {
    fontFamily: sans,
    fontSize: 13,
    fontWeight: "600",
    color: c.text,
  },
  roomStatus: { fontFamily: sans, fontSize: 11, color: c.muted },
  tinyDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  section: { paddingHorizontal: 16, marginTop: 24 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: serif,
    fontSize: 24,
    color: c.text,
    letterSpacing: -0.5,
  },
  sectionAction: {
    fontFamily: sans,
    fontSize: 11,
    fontWeight: "600",
    color: c.faint,
  },
  bedrockRow: { flexDirection: "row", gap: 10 },
  bedrock: {
    flex: 1,
    minHeight: 152,
    borderRadius: 22,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    padding: 13,
    justifyContent: "space-between",
  },
  bedrockTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  bedrockLabel: {
    fontFamily: sans,
    fontSize: 12,
    fontWeight: "600",
    color: c.muted,
  },
  bedrockValue: {
    fontFamily: serif,
    fontSize: 24,
    color: c.text,
    letterSpacing: -0.8,
    marginTop: 6,
  },
  bedrockBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  bedrockMeta: { fontFamily: sans, fontSize: 10, color: c.faint, flex: 1 },
  list: {
    borderRadius: 22,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    overflow: "hidden",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 58,
  },
  listIcon: {
    width: 30,
    height: 30,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  listName: {
    fontFamily: sans,
    fontSize: 13,
    fontWeight: "600",
    color: c.text,
  },
  listMeta: { fontFamily: sans, fontSize: 10.5, color: c.faint },
  listValue: {
    fontFamily: sans,
    fontSize: 13,
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
