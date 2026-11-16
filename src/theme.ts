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
};

/** Shared rhythm for Home and its cards; other screens migrate separately. */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radii = { control: 12, card: 22, panel: 26 };
export const typography = {
  secondary: { fontSize: 13, lineHeight: 19 },
  body: { fontSize: 14, lineHeight: 21 },
  name: { fontSize: 16, lineHeight: 22 },
  value: { fontSize: 26, lineHeight: 34 },
  title: { fontSize: 32, lineHeight: 38 },
};
export const minTouchTarget = 48;
