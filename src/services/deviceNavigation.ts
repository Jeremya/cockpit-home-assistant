import { router } from "expo-router";
import { useCockpit } from "../core/store";
import { deviceSummaries } from "../core/deviceSummaries";
import { isVisible } from "../core/selectors";
import { resolveAlias } from "../preferences/types";
import { detailHref } from "../navigation/detailNavigation";

/** A destination that passed the current-home checks at the moment of the tap. */
export type DeviceDestination = {
  kind: "device";
  profileId: string;
  deviceId: string;
};
export type ReadingDestination = {
  kind: "reading";
  profileId: string;
  entityKey: string;
};

// Every detail is its own Stack entry: one URL and one Back step per opening.
const pushDeviceSummary = (destination: DeviceDestination) =>
  router.push(detailHref(destination));
const pushReading = (destination: ReadingDestination) =>
  router.push(detailHref(destination));

/** Revalidate delayed UI callbacks against the current home and visible membership.
 * An injected opener presents the destination elsewhere; it never skips this check. */
export function openDeviceSummary(
  profile: string,
  id: string,
  open: (destination: DeviceDestination) => void = pushDeviceSummary,
) {
  const state = useCockpit.getState();
  if (state.profileId !== profile || !state.snapshot) return;
  const found = deviceSummaries(
    state.snapshot,
    state.preferences,
    profile,
    state.status.kind === "ready",
  ).some((group) => group.deviceId === id);
  if (found) open({ kind: "device", profileId: profile, deviceId: id });
}
export function openReading(
  profile: string,
  key: string,
  open: (destination: ReadingDestination) => void = pushReading,
) {
  const state = useCockpit.getState();
  if (state.profileId !== profile) return;
  const canonical = resolveAlias(key, state.preferences.identities.aliases);
  const entity = Object.values(state.snapshot?.entities ?? {}).find(
    (entity) => entity.key === canonical,
  );
  if (entity && isVisible(entity, state.preferences))
    open({ kind: "reading", profileId: profile, entityKey: entity.key });
}
