import type {
  DeviceDestination,
  ReadingDestination,
} from "../services/deviceNavigation";

/** What the detail shows; owned by the route, distinct from Home's spatial selection. */
export type DetailTarget = DeviceDestination | ReadingDestination;

export type DetailLayout = { kind: "panel"; width: number } | { kind: "route" };

const panel = { min: 360, max: 440, share: 0.32, homeMin: 640 };

/** A side panel only in the web desktop layout, where the measured workspace
 * keeps Home readable beside it. A compact window never gets one. */
export function detailLayout(
  width: number,
  { desktop, hostsHome }: { desktop: boolean; hostsHome: boolean },
): DetailLayout {
  if (!desktop || !hostsHome) return { kind: "route" };
  const size = Math.min(
    panel.max,
    Math.max(panel.min, Math.round(width * panel.share)),
  );
  return width - size >= panel.homeMin
    ? { kind: "panel", width: size }
    : { kind: "route" };
}

/** Canonical routes; every link the app creates names its home. */
export function detailHref(target: DetailTarget) {
  return target.kind === "device"
    ? {
        pathname: "/appliance/[id]" as const,
        params: { id: target.deviceId, profile: target.profileId },
      }
    : {
        pathname: "/device/[key]" as const,
        params: { key: target.entityKey, profile: target.profileId },
      };
}

const text = (value: unknown) =>
  typeof value === "string" && value ? value : null;

/** A legacy reading link without a home resolves only in the home it was bound to. */
export function detailTargetFromRoute(
  route: { name: string; params?: object },
  boundProfile: string | null,
): DetailTarget | null {
  const params = (route.params ?? {}) as Record<string, unknown>;
  const profile = text(params.profile);
  if (route.name === "appliance/[id]") {
    const id = text(params.id);
    return id && profile
      ? { kind: "device", profileId: profile, deviceId: id }
      : null;
  }
  if (route.name === "device/[key]") {
    const key = text(params.key);
    const home = profile ?? boundProfile;
    return key && home
      ? { kind: "reading", profileId: home, entityKey: key }
      : null;
  }
  return null;
}

const originPrefix = "detail-origin-";

/** A stable UI key for the element that opened a detail, safe as a DOM id. */
export function focusOriginId(kind: "device" | "reading", key: string) {
  return `${originPrefix}${kind}-${encodeURIComponent(key)}`;
}
export function focusOriginOf(id: string | null | undefined) {
  return id?.startsWith(originPrefix) && id.length <= 512 ? id : null;
}

export type EscapeContext = {
  /** Another handler, such as the focused camera, already used the key. */
  handled: boolean;
  inScene: boolean;
  editing: boolean;
  /** A cancelable confirmation is pending in the detail. */
  confirmation: boolean;
  open: boolean;
};

/** One Escape, one action: a confirmation first, then the detail. The camera
 * owns Escape only while the scene itself is focused. */
export function escapeAction(context: EscapeContext) {
  if (context.handled || context.inScene || context.editing) return "none";
  if (context.confirmation) return "cancelConfirmation";
  return context.open ? "closeDetail" : "none";
}
