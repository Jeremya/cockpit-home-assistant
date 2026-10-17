import type {
  CaptureResult,
  CommandFacade,
  CommandIntent,
  CommandReference,
  CommandResult,
} from "./types";

/** No transport or generic HA service method escapes this boundary. */
export function createCommandFacade(
  capture: (key: string) => CaptureResult,
  dispatch: (
    reference: CommandReference,
    intent: CommandIntent,
  ) => CommandResult,
): CommandFacade {
  return Object.freeze({
    capture,
    setLockState: (reference, state, code) =>
      dispatch(reference, { kind: "setLockState", state, code }),
    setClimateTarget: (reference, target) =>
      dispatch(reference, { kind: "setClimateTarget", target }),
    setHvacMode: (reference, mode) =>
      dispatch(reference, { kind: "setHvacMode", mode }),
    setFanOn: (reference, on) => dispatch(reference, { kind: "setFanOn", on }),
    setFanPercentage: (reference, percentage) =>
      dispatch(reference, { kind: "setFanPercentage", percentage }),
    setFanPreset: (reference, preset) =>
      dispatch(reference, { kind: "setFanPreset", preset }),
    setSwitch: (reference, on) =>
      dispatch(reference, { kind: "setSwitch", on }),
  } satisfies CommandFacade);
}
