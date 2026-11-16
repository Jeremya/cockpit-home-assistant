/** Maurice cockpit identity. Semantic roles stay stable across the migration. */
export const colors = {
  background: "#06090f",
  surface: "#0d141e",
  raised: "#121b27",
  text: "#f2f7fc",
  muted: "#9aabbd",
  accent: "#7dd3fc",
  border: "rgba(255,255,255,0.08)",
  warning: "#f0b35e",
  danger: "#ff8a9b",
  comfort: "#5eead4",
  security: "#b9a7ff",
  sensor: "#9be7c4",
  accentSurface: "#0f1a26",
  /** Hovered or pressed surface, one step above `raised`. */
  hover: "#182433",
  /** Emphasised hairline: hovered cards, actionable controls. */
  borderStrong: "rgba(255,255,255,0.16)",
  /** A boundary that must be seen: text fields. 3.5:1 on surface. */
  outline: "#5f6d7e",
  /** Text and icons on an accent fill. */
  onAccent: "#06121c",
  /** The primary button under the pointer or the finger. */
  accentHover: "#a4e0fd",
  accentBorder: "rgba(125,211,252,0.42)",
  /** Behind a selected icon or tab; the shape marks the selection. */
  accentTint: "rgba(125,211,252,0.14)",
  /** Tinted surfaces behind a qualifier; the text and icon carry the meaning. */
  warningSurface: "rgba(240,179,94,0.07)",
  warningBorder: "rgba(240,179,94,0.28)",
  dangerSurface: "rgba(255,138,155,0.07)",
  dangerBorder: "rgba(255,138,155,0.3)",
};

/** One 4-pt rhythm for every screen. */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
/** One card language: `panel` keeps its name and now shares the card radius. */
export const radii = { control: 12, card: 22, panel: 22, pill: 999 };

/**
 * Where the rhythm applies: 16 between siblings in a group, 32 between the
 * sections of a screen, 16 inside a card. Reading and form columns are bounded.
 */
export const layout = {
  gutter: spacing.lg,
  gutterWide: spacing.xxl,
  stack: spacing.lg,
  section: spacing.xxl,
  cardPadding: spacing.lg,
  /** Clears the compact tab bar. */
  tabBarClearance: 112,
  contentMax: 1200,
  readingMax: 760,
};

/**
 * The type scale: 40 · 32 · 24 · 18 · 16 · 14 · 13 · 12 · 11.
 * `title`, `value`, `name`, `body` and `secondary` predate the scale and keep
 * their names; the later roles carry their weight and tracking.
 */
export const typography = {
  secondary: { fontSize: 13, lineHeight: 19 },
  body: { fontSize: 14, lineHeight: 21 },
  name: { fontSize: 16, lineHeight: 22 },
  value: { fontSize: 24, lineHeight: 30 },
  title: { fontSize: 32, lineHeight: 38 },
  /** The one observed value a detail is about. */
  hero: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: "600",
    letterSpacing: -1,
  },
  /** Screen title. */
  display: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  /** Section title on a screen, and a card's leading value. */
  headline: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  /** Card or panel title. */
  heading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  /** Metadata under a name or a value. */
  caption: { fontSize: 12, lineHeight: 17 },
  /** The only uppercase role; never smaller than 11. */
  eyebrow: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
} as const;

export const minTouchTarget = 48;
