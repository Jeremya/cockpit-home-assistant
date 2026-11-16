import { useState, type PropsWithChildren, type ReactNode } from "react";
import {
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type PressableStateCallbackType,
  type ScrollViewProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  colors,
  layout,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "../theme";
import { Icon, type IconName } from "./EntityIcon";
import { useResponsiveLayout } from "./layout";
export { colors } from "../theme";

/** React Native Web also reports pointer hover and keyboard focus. */
export type Interaction = PressableStateCallbackType & {
  hovered?: boolean;
  focused?: boolean;
};
export type Tone = "neutral" | "accent" | "warning" | "danger" | "observed";

const toneColor: Record<Tone, string> = {
  neutral: colors.muted,
  accent: colors.accent,
  warning: colors.warning,
  danger: colors.danger,
  observed: colors.comfort,
};

/** Eyebrow: the only uppercase role. Amber and grey mark a qualified source. */
export function Label({
  children,
  tone = "accent",
}: PropsWithChildren<{ tone?: Tone }>) {
  return (
    <Text style={[styles.label, { color: toneColor[tone] }]}>{children}</Text>
  );
}
export function Title({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}
/** A card or section title. */
export function Heading({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return (
    <Text accessibilityRole="header" style={[styles.heading, style]}>
      {children}
    </Text>
  );
}
export function Body({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}
/** Supporting detail one step below Body. */
export function Caption({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[styles.caption, style]}>{children}</Text>;
}
export function Panel({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.panel, style]}>{children}</View>;
}
export function Divider() {
  return <View style={styles.divider} />;
}

/** One scroll owner with the shared gutters and a bounded column. */
export function Screen({
  children,
  width = "wide",
  tabBar = false,
  narrow = false,
  ...scroll
}: PropsWithChildren<
  {
    /** `reading` bounds forms and details; `wide` bounds grids. */
    width?: "reading" | "wide" | number;
    /** Leaves room for the compact tab bar on a primary destination. */
    tabBar?: boolean;
    /** Shown in a column narrower than the window, such as the detail panel. */
    narrow?: boolean;
  } & Omit<ScrollViewProps, "style" | "contentContainerStyle">
>) {
  const { desktop } = useResponsiveLayout();
  const wide = desktop && !narrow;
  return (
    <ScrollView
      {...scroll}
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        styles.screenContent,
        wide && styles.screenContentWide,
        {
          maxWidth:
            width === "reading"
              ? layout.readingMax
              : width === "wide"
                ? layout.contentMax
                : width,
        },
        tabBar && !desktop && { paddingBottom: layout.tabBarClearance },
      ]}
    >
      {children}
    </ScrollView>
  );
}
/** Eyebrow, title and one supporting line: the same top on every screen. */
export function ScreenHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <View style={styles.screenHeader}>
      {!!eyebrow && <Label>{eyebrow}</Label>}
      <Title>{title}</Title>
      {!!description && <Body>{description}</Body>}
    </View>
  );
}
export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
/** Pressed and hovered change the surface; only disabled lowers opacity. */
export function Button({
  title,
  onPress,
  disabled,
  secondary = false,
  variant,
  icon,
  accessibilityExpanded,
  accessibilityLabel,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  /** Overrides `secondary`. */
  variant?: ButtonVariant;
  icon?: IconName;
  accessibilityExpanded?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const kind: ButtonVariant = variant ?? (secondary ? "secondary" : "primary");
  const ink =
    kind === "primary"
      ? colors.onAccent
      : kind === "danger"
        ? colors.danger
        : kind === "quiet"
          ? colors.accent
          : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      // An icon is decoration: the name stays the visible title.
      accessibilityLabel={accessibilityLabel ?? (icon ? title : undefined)}
      accessibilityState={
        accessibilityExpanded === undefined
          ? undefined
          : { expanded: accessibilityExpanded }
      }
      aria-expanded={accessibilityExpanded}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: Interaction) => [
        styles.button,
        kind === "primary"
          ? (pressed || hovered) && styles.buttonPrimaryActive
          : [
              kind === "quiet" ? styles.quiet : styles.secondary,
              kind === "danger" && styles.dangerButton,
              hovered && styles.secondaryHovered,
              pressed && styles.secondaryPressed,
            ],
        disabled && styles.disabled,
        style,
      ]}
    >
      {!!icon && <Icon name={icon} size={18} color={ink} />}
      <Text
        style={[
          styles.buttonText,
          kind !== "primary" && styles.buttonTextQuiet,
          { color: ink },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const noticeIcon: Record<Tone, IconName> = {
  neutral: "info",
  accent: "info",
  warning: "alert-triangle",
  danger: "alert-octagon",
  observed: "check-circle",
};
/** A qualifier the reader must not miss: icon, words and tint together. */
export function Notice({
  tone = "neutral",
  icon,
  title,
  children,
  live,
}: PropsWithChildren<{
  tone?: Tone;
  icon?: IconName;
  title?: string;
  /** Announces a result that appears after an action. */
  live?: boolean;
}>) {
  return (
    <View
      accessibilityLiveRegion={live ? "polite" : undefined}
      style={[
        styles.notice,
        tone === "warning" && styles.noticeWarning,
        tone === "danger" && styles.noticeDanger,
      ]}
    >
      <View style={styles.noticeIcon}>
        <Icon
          name={icon ?? noticeIcon[tone]}
          size={16}
          color={toneColor[tone]}
        />
      </View>
      <View style={styles.noticeCopy}>
        {!!title && (
          <Text
            style={[
              styles.noticeTitle,
              tone !== "neutral" && { color: toneColor[tone] },
            ]}
          >
            {title}
          </Text>
        )}
        {typeof children === "string" ? (
          <Text style={styles.noticeText}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/** A source or state label that never relies on colour alone. */
export function StatusChip({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: Tone;
  icon?: IconName;
}) {
  return (
    <View style={styles.chip}>
      {icon ? (
        <Icon name={icon} size={13} color={toneColor[tone]} />
      ) : (
        <View style={[styles.chipDot, { backgroundColor: toneColor[tone] }]} />
      )}
      <Text style={[styles.label, styles.chipText, { color: toneColor[tone] }]}>
        {label}
      </Text>
    </View>
  );
}

/** One fact per row: what it is on the left, what was reported on the right. */
export function KeyValue({
  label,
  value,
  note,
  tone,
  last = false,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  tone?: Tone;
  last?: boolean;
}) {
  return (
    <View
      style={[styles.fact, last && styles.factLast]}
      {...(Platform.OS !== "web" && typeof value === "string"
        ? { accessible: true, accessibilityLabel: `${label}: ${value}` }
        : null)}
    >
      <View style={styles.factRow}>
        <Text style={styles.factLabel}>{label}</Text>
        {typeof value === "string" ? (
          <Text
            style={[styles.factValue, tone && { color: toneColor[tone] }]}
            selectable
          >
            {value}
          </Text>
        ) : (
          value
        )}
      </View>
      {!!note && <Text style={styles.caption}>{note}</Text>}
    </View>
  );
}

/** Supporting detail one level down; the summary line always stays visible. */
export function Disclosure({
  title,
  children,
  initiallyOpen = false,
}: PropsWithChildren<{ title: string; initiallyOpen?: boolean }>) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={styles.disclosure}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed, hovered }: Interaction) => [
          styles.disclosureHeader,
          hovered && styles.rowHovered,
          pressed && styles.rowPressed,
        ]}
      >
        <Icon
          name={open ? "chevron-down" : "chevron-right"}
          size={16}
          color={colors.accent}
        />
        <Text style={styles.disclosureTitle}>{title}</Text>
      </Pressable>
      {open && <View style={styles.disclosureBody}>{children}</View>}
    </View>
  );
}

/** A setting: short label, one supporting line, the themed switch. */
export function ToggleRow({
  title,
  description,
  warning,
  value,
  onValueChange,
  accessibilityLabel,
  disabled,
}: {
  title: string;
  description?: string;
  /** A consequence of turning it on; shown in amber with its icon. */
  warning?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** The control's name; defaults to the visible title. */
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleTitle}>{title}</Text>
        {!!description && <Text style={styles.caption}>{description}</Text>}
        {!!warning && (
          <View style={styles.toggleWarning}>
            <Icon name="alert-triangle" size={13} color={colors.warning} />
            <Text style={styles.toggleWarningText}>{warning}</Text>
          </View>
        )}
      </View>
      <View style={styles.toggleControl}>
        <ThemedSwitch
          accessibilityLabel={accessibilityLabel ?? title}
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
        />
      </View>
    </View>
  );
}
/** The platform switch in cockpit colours, with a 48 dp target. */
export function ThemedSwitch({
  accessibilityLabel,
  value,
  onValueChange,
  disabled,
}: {
  accessibilityLabel: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Switch
      accessibilityLabel={accessibilityLabel}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      trackColor={{ false: colors.hover, true: colors.accentBorder }}
      thumbColor={value ? colors.accent : colors.muted}
      ios_backgroundColor={colors.hover}
      // React Native Web keeps a separate colour for the checked thumb.
      {...(Platform.OS === "web"
        ? ({ activeThumbColor: colors.accent } as object)
        : null)}
    />
  );
}

/** A destination or an in-place action, as one full-width 48 dp row. */
export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  tone,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  tone?: "danger";
}) {
  const ink = tone === "danger" ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      style={({ pressed, hovered }: Interaction) => [
        styles.listRow,
        hovered && styles.rowHovered,
        pressed && styles.rowPressed,
      ]}
    >
      {!!icon && (
        <Icon
          name={icon}
          size={18}
          color={tone === "danger" ? colors.danger : colors.muted}
        />
      )}
      <View style={styles.toggleCopy}>
        <Text style={[styles.toggleTitle, { color: ink }]}>{title}</Text>
        {!!subtitle && <Text style={styles.caption}>{subtitle}</Text>}
      </View>
      <Icon name="chevron-right" size={18} color={colors.muted} />
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: layout.gutter,
    paddingBottom: spacing.xxl + spacing.lg,
    gap: layout.stack,
    ...Platform.select({
      web: { width: "100%", maxWidth: layout.contentMax, alignSelf: "center" },
    } as const),
  },
  screenContent: { gap: layout.section, width: "100%", alignSelf: "center" },
  screenContentWide: {
    padding: layout.gutterWide,
    paddingBottom: spacing.xxl + spacing.lg,
  },
  screenHeader: { gap: spacing.sm },
  label: { ...typography.eyebrow, color: colors.accent },
  title: { ...typography.display, color: colors.text },
  heading: { ...typography.heading, color: colors.text },
  body: { ...typography.body, color: colors.muted },
  caption: { ...typography.caption, color: colors.muted },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: layout.cardPadding,
    gap: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    alignSelf: "stretch",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  button: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    alignItems: "center",
    minHeight: minTouchTarget,
    justifyContent: "center",
  },
  buttonPrimaryActive: { backgroundColor: colors.accentHover },
  secondary: { backgroundColor: colors.raised, borderColor: colors.border },
  quiet: { backgroundColor: "transparent", borderColor: "transparent" },
  dangerButton: { borderColor: colors.dangerBorder },
  secondaryHovered: {
    backgroundColor: colors.hover,
    borderColor: colors.borderStrong,
  },
  secondaryPressed: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.borderStrong,
  },
  disabled: { opacity: 0.45 },
  buttonText: {
    ...typography.body,
    color: colors.onAccent,
    fontWeight: "700",
    textAlign: "center",
    flexShrink: 1,
  },
  buttonTextQuiet: { fontWeight: "600" },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.control,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: minTouchTarget,
    color: colors.text,
    backgroundColor: colors.background,
  },
  error: { ...typography.body, color: colors.danger },
  notice: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.raised,
  },
  noticeWarning: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
  },
  noticeDanger: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
  },
  noticeIcon: { paddingTop: 2 },
  noticeCopy: { flex: 1, minWidth: 0, gap: 2 },
  noticeTitle: {
    ...typography.secondary,
    color: colors.text,
    fontWeight: "600",
  },
  noticeText: { ...typography.secondary, color: colors.text },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { flexShrink: 1 },
  fact: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  factLast: { borderBottomWidth: 0 },
  factRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: spacing.md,
    rowGap: 2,
  },
  factLabel: { ...typography.secondary, color: colors.muted },
  factValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    flexShrink: 1,
  },
  disclosure: { gap: spacing.xs },
  disclosureHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.control,
  },
  disclosureTitle: {
    ...typography.secondary,
    color: colors.accent,
    fontWeight: "600",
    flexShrink: 1,
  },
  disclosureBody: { gap: spacing.sm, paddingBottom: spacing.xs },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: minTouchTarget,
  },
  toggleCopy: { flex: 1, minWidth: 0, gap: 2 },
  toggleTitle: { ...typography.body, color: colors.text, fontWeight: "600" },
  toggleWarning: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  toggleWarningText: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: "600",
    flex: 1,
  },
  toggleControl: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
  },
  rowHovered: { backgroundColor: colors.raised },
  rowPressed: { backgroundColor: colors.hover },
});
