export const COMMAND_DEADLINES_MS = {
  lock: 45_000,
  climate: 30_000,
  fan: 15_000,
  switch: 15_000,
} as const;
export const COMMAND_LATE_WINDOW_MS = 5 * 60_000;
export const COMMAND_MAX_RECORDS = 100;
export const COMMAND_DEBOUNCE_MS = 600;
export const COMMAND_MAX_LANES = 100;
