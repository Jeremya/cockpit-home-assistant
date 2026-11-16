import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Line,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { Icon, type IconName } from "../../components/EntityIcon";

export const sans = Platform.select({
  ios: "System",
  android: "sans-serif",
  default:
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
});
export const serif = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
});

export function shortShadow(opacity = 0.08, radius = 16, y = 8) {
  return {
    shadowColor: "#1B1A17",
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: y },
    elevation: Math.round(radius / 3),
  } as const;
}

export function SectionHeader({
  title,
  action,
  colors,
}: {
  title: string;
  action?: string;
  colors: { text: string; muted: string };
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {action ? (
        <Text style={[styles.sectionAction, { color: colors.muted }]}>
          {action}
        </Text>
      ) : null}
    </View>
  );
}

export function Toggle({
  value,
  colors,
  onChange,
}: {
  value: boolean;
  colors: { on: string; off: string; knob: string };
  onChange?: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={value ? "Turn off" : "Turn on"}
      onPress={() => onChange?.(!value)}
      style={[
        styles.toggle,
        { backgroundColor: value ? colors.on : colors.off },
      ]}
    >
      <View
        style={[
          styles.toggleKnob,
          {
            backgroundColor: colors.knob,
            transform: [{ translateX: value ? 22 : 0 }],
          },
        ]}
      />
    </Pressable>
  );
}

export function Pill({
  children,
  color,
  background,
}: {
  children: string;
  color: string;
  background: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <Text style={[styles.pillText, { color }]}>{children}</Text>
    </View>
  );
}

export function GlassButton({
  icon,
  color,
  background,
  border,
  size = 40,
  label,
}: {
  icon: IconName;
  color: string;
  background: string;
  border?: string;
  size?: number;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.glassButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background,
          borderColor: border ?? "transparent",
        },
      ]}
    >
      <Icon name={icon} color={color} size={18} />
    </Pressable>
  );
}

export function BottomBar({
  items,
  active,
  colors,
  floating = false,
}: {
  items: { id: string; label: string; icon: IconName }[];
  active: string;
  colors: {
    surface: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
  };
  floating?: boolean;
}) {
  return (
    <View
      style={[
        styles.bottomBar,
        floating ? styles.bottomFloating : styles.bottomDocked,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: floating ? 26 : 0,
          ...(floating
            ? {}
            : {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
              }),
        },
      ]}
    >
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            style={styles.bottomItem}
          >
            <Icon
              name={item.icon}
              size={20}
              color={selected ? colors.accent : colors.muted}
            />
            <Text
              style={[
                styles.bottomLabel,
                { color: selected ? colors.accent : colors.muted },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Light architectural plan used by Concept A; based on the public sample. */
export function LightPlan() {
  return (
    <Svg viewBox="0 0 250 170" width="100%" height="100%">
      <Rect x="0" y="0" width="250" height="170" rx="22" fill="#EDE5D6" />
      <G transform="translate(13,3)">
        <Rect
          x="0"
          y="0"
          width="112"
          height="164"
          rx="5"
          fill="#FAF6EE"
          stroke="#D4C6B2"
          strokeWidth="1.2"
        />
        <Rect
          x="112"
          y="0"
          width="112"
          height="164"
          rx="5"
          fill="#E7EBE2"
          stroke="#D4C6B2"
          strokeWidth="1.2"
        />
        <Line
          x1="112"
          y1="0"
          x2="112"
          y2="78"
          stroke="#C7B9A5"
          strokeWidth="2.2"
        />
        <Line
          x1="112"
          y1="118"
          x2="112"
          y2="164"
          stroke="#C7B9A5"
          strokeWidth="2.2"
        />
        {/* sofa, rug, coffee table */}
        <Rect x="12" y="46" width="30" height="66" rx="8" fill="#DCC6A8" />
        <Rect x="18" y="53" width="18" height="52" rx="6" fill="#E8D7BF" />
        <Rect x="45" y="60" width="50" height="40" rx="9" fill="#E3D2B8" />
        <Rect x="52" y="67" width="36" height="26" rx="6" fill="#F0E3CF" />
        <Circle cx="84" cy="32" r="5.5" fill="#8FAE8C" />
        <Rect x="12" y="128" width="50" height="24" rx="4" fill="#D8C6AC" />
        {/* kitchen run, island, table */}
        <Rect x="124" y="10" width="88" height="22" rx="3" fill="#D3D9CD" />
        <Rect x="124" y="42" width="30" height="30" rx="3" fill="#C9D1C4" />
        <Rect x="152" y="88" width="58" height="34" rx="4" fill="#D8DDD3" />
        <Rect x="166" y="132" width="34" height="20" rx="3" fill="#D3D9CD" />
        <Circle cx="232" cy="116" r="5.5" fill="#8FAE8C" />
        <SvgText
          x="28"
          y="154"
          fill="#8E7F6B"
          fontSize="7"
          letterSpacing="1.4"
          fontFamily={sans}
        >
          LIVING
        </SvgText>
        <SvgText
          x="158"
          y="154"
          fill="#76806F"
          fontSize="7"
          letterSpacing="1.4"
          fontFamily={sans}
        >
          KITCHEN
        </SvgText>
      </G>
    </Svg>
  );
}

/** Dark architectural vignette used by Concepts B and C. */
export function RoomMini({
  kind,
  accent,
}: {
  kind: "living" | "kitchen" | "entry" | "office";
  accent: string;
}) {
  const line = "rgba(245,240,232,0.35)";
  return (
    <Svg viewBox="0 0 120 84" width="100%" height="100%">
      <Rect
        x="0"
        y="0"
        width="120"
        height="84"
        rx="12"
        fill="rgba(255,255,255,0.04)"
      />
      <Rect
        x="12"
        y="10"
        width="96"
        height="64"
        rx="4"
        fill="rgba(255,255,255,0.03)"
        stroke={line}
        strokeWidth="1"
      />
      {kind === "living" ? (
        <>
          <Rect
            x="20"
            y="30"
            width="18"
            height="34"
            rx="4"
            fill={accent}
            opacity="0.55"
          />
          <Rect
            x="42"
            y="42"
            width="26"
            height="16"
            rx="3"
            fill="rgba(255,255,255,0.10)"
          />
          <Circle cx="82" cy="32" r="3.5" fill={accent} />
        </>
      ) : kind === "kitchen" ? (
        <>
          <Rect
            x="20"
            y="18"
            width="80"
            height="12"
            rx="2"
            fill={accent}
            opacity="0.4"
          />
          <Rect
            x="20"
            y="42"
            width="42"
            height="20"
            rx="3"
            fill="rgba(255,255,255,0.10)"
          />
          <Rect
            x="70"
            y="42"
            width="30"
            height="20"
            rx="3"
            fill="rgba(255,255,255,0.08)"
          />
        </>
      ) : kind === "entry" ? (
        <>
          <Line
            x1="30"
            y1="60"
            x2="30"
            y2="22"
            stroke={accent}
            strokeWidth="2"
          />
          <Path
            d="M30 30 Q50 30 50 50"
            fill="none"
            stroke={accent}
            strokeWidth="1.5"
            opacity="0.7"
          />
          <Rect
            x="64"
            y="26"
            width="30"
            height="10"
            rx="2"
            fill="rgba(255,255,255,0.10)"
          />
        </>
      ) : (
        <>
          <Rect
            x="24"
            y="34"
            width="34"
            height="18"
            rx="3"
            fill={accent}
            opacity="0.4"
          />
          <Rect
            x="66"
            y="34"
            width="12"
            height="12"
            rx="2"
            fill="rgba(255,255,255,0.10)"
          />
          <Rect
            x="44"
            y="58"
            width="18"
            height="8"
            rx="2"
            fill="rgba(255,255,255,0.08)"
          />
        </>
      )}
    </Svg>
  );
}

/** Home pulse ring used by Concept C. */
export function StatusRing({
  colors,
  size = 168,
}: {
  colors: {
    track: string;
    ok: string;
    warning: string;
    cool: string;
    text: string;
    muted: string;
  };
  size?: number;
}) {
  const segments = [
    { color: colors.ok, from: 0, length: 74 },
    { color: colors.cool, from: 86, length: 74 },
    { color: colors.ok, from: 172, length: 74 },
    { color: colors.warning, from: 258, length: 74 },
  ];
  return (
    <View style={[styles.ringWrap, { width: size, height: size }]}>
      <Svg viewBox="0 0 168 168" width={size} height={size}>
        <Circle
          cx="84"
          cy="84"
          r="66"
          fill="none"
          stroke={colors.track}
          strokeWidth="13"
        />
        {segments.map((segment) => (
          <Circle
            key={segment.from}
            cx="84"
            cy="84"
            r="66"
            fill="none"
            stroke={segment.color}
            strokeWidth="13"
            strokeLinecap="round"
            strokeDasharray={`${segment.length} ${2 * Math.PI * 66}`}
            strokeDashoffset={-segment.from}
            transform="rotate(-90 84 84)"
          />
        ))}
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={[styles.ringValue, { color: colors.text }]}>4</Text>
        <Text style={[styles.ringLabel, { color: colors.muted }]}>ROOMS</Text>
      </View>
    </View>
  );
}

export function HeroShade({ top = false }: { top?: boolean }) {
  // Only the bands behind the header/caption are shaded; the house must stay bright.
  const height = top ? 170 : 190;
  return (
    <Svg
      pointerEvents="none"
      viewBox={`0 0 390 ${height}`}
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        height,
        ...(top ? { top: 0 } : { bottom: 0 }),
      }}
    >
      <Defs>
        <LinearGradient
          id={top ? "topShade" : "bottomShade"}
          x1="0"
          y1={top ? "0" : "1"}
          x2="0"
          y2={top ? "1" : "0"}
        >
          <Stop
            offset="0"
            stopColor="#080A0E"
            stopOpacity={top ? 0.84 : 0.94}
          />
          <Stop offset="1" stopColor="#080A0E" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect
        x="0"
        y="0"
        width="390"
        height={height}
        fill={`url(#${top ? "topShade" : "bottomShade"})`}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 19, fontWeight: "600", letterSpacing: -0.3 },
  sectionAction: { fontSize: 13, fontWeight: "500" },
  toggle: {
    width: 52,
    height: 30,
    borderRadius: 15,
    padding: 4,
    justifyContent: "center",
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  glassButton: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  bottomDocked: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingBottom: 18,
    paddingHorizontal: 12,
  },
  bottomFloating: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  bottomItem: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  bottomLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.2 },
  ringWrap: {
    width: 168,
    height: 168,
    alignItems: "center",
    justifyContent: "center",
  },
  ringCenter: { position: "absolute", alignItems: "center" },
  ringValue: { fontSize: 34, fontWeight: "700", letterSpacing: -1 },
  ringLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.6,
    marginTop: 2,
  },
});
