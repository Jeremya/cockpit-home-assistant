import { minimumHomeAssistantVersionLabel } from "../config/homeAssistant";
import type { SessionStatus, UnreachableCause } from "./types";

const possibleCauses: Record<UnreachableCause, string> = {
  not_on_network: "The phone may be outside your home network.",
  local_network_permission:
    "Local network access may be blocked in phone settings.",
  server_stopped: "The Home Assistant server may be stopped or unavailable.",
  tls_certificate:
    "The server's HTTPS certificate may not be trusted by this phone.",
  cleartext_blocked: "The phone may be blocking the connection over HTTP.",
  dns: "The server address may not resolve on this network.",
};

export function sessionPresentation(
  status: Exclude<SessionStatus, { kind: "ready" }>,
) {
  const cached =
    "Displayed values are cached until a fresh synchronization completes.";
  if (status.kind !== "error") {
    return {
      title:
        status.kind === "idle"
          ? "Maurice is off duty"
          : status.kind === "synchronizing"
            ? "Maurice is doing his rounds…"
            : status.kind === "reconnecting"
              ? "Maurice is reconnecting…"
              : status.kind === "authenticating"
                ? "Maurice is checking access…"
                : "Maurice is calling Home Assistant…",
      detail:
        status.kind === "reconnecting"
          ? `Reconnecting automatically. ${cached}`
          : "House status is unknown until a fresh synchronization completes.",
      causes: [],
    };
  }
  const { error, retrying } = status;
  let title: string;
  let detail: string;
  switch (error.code) {
    case "auth_invalid":
      title = "Maurice was refused entry: access token rejected";
      detail =
        "Create a new token in Home Assistant, then update Connection settings.";
      break;
    case "ha_version_unsupported": {
      const version =
        error.haVersion.length < 40 &&
        /^\d{4}\.\d{1,2}(?:\.\d+)?(?:[ab]\d+)?$/.test(error.haVersion)
          ? error.haVersion
          : "unrecognized version";
      title = "Maurice needs a newer Home Assistant";
      detail = `Detected: ${version}. Home Assistant ${minimumHomeAssistantVersionLabel} or later is required. Update the server, then retry.`;
      break;
    }
    case "unreachable":
      title = retrying
        ? "Maurice is reconnecting…"
        : "Maurice cannot reach Home Assistant";
      detail =
        "The connection error does not identify its cause. Check the address, network and server.";
      break;
    case "sync_timeout":
      title = "Synchronization timed out";
      detail = "A fresh Home Assistant snapshot has not arrived yet.";
      break;
    case "invalid_url":
      title = "Check the Home Assistant address";
      detail =
        "Use the server's http:// or https:// address in Connection settings.";
      break;
    case "storage":
      title = "Saved connection data is unavailable";
      detail =
        "Check available phone storage, then retry or open Connection settings.";
      break;
    default:
      title = "Maurice could not open this connection";
      detail =
        "Retry or check the address and access token in Connection settings.";
  }
  return {
    title,
    detail: `${detail} ${retrying ? "Reconnecting automatically. You can also retry now. " : ""}${cached}`,
    causes:
      error.code === "unreachable"
        ? [...new Set(error.likelyCauses)].flatMap((cause) =>
            Object.hasOwn(possibleCauses, cause) ? [possibleCauses[cause]] : [],
          )
        : [],
  };
}
