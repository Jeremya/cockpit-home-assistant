import type { CommandRecord } from "../../commands/types";
import type { IconName } from "../EntityIcon";
import type { Tone } from "../ui";

/**
 * How a request's outcome looks. Only a state observed after the request, and
 * not assumed by the integration, gets the observed tone; a later or assumed
 * report stays neutral, and unconfirmed or failed never resemble success.
 */
export function outcomeTone(record: CommandRecord): {
  tone: Tone;
  icon: IconName;
} {
  switch (record.status) {
    case "confirmed":
      return record.confirmation?.kind === "observed" &&
        !record.confirmation.assumed
        ? { tone: "observed", icon: "check-circle" }
        : { tone: "neutral", icon: "info" };
    case "unconfirmed":
      return { tone: "warning", icon: "alert-triangle" };
    case "failed":
      return { tone: "danger", icon: "alert-octagon" };
    default:
      return { tone: "neutral", icon: "clock" };
  }
}
