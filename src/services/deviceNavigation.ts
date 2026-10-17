import { router } from "expo-router";
import { useCockpit } from "../core/store";
import { deviceSummaries } from "../core/deviceSummaries";
import { isVisible } from "../core/selectors";
import { resolveAlias } from "../preferences/types";

/** Revalidate delayed UI callbacks against the current home and visible membership. */
export function openDeviceSummary(profile: string, id: string) {
  const state = useCockpit.getState();
  if (state.profileId !== profile || !state.snapshot) return;
  const found = deviceSummaries(
    state.snapshot,
    state.preferences,
    profile,
    state.status.kind === "ready",
  ).some((group) => group.deviceId === id);
  if (found)
    router.push({ pathname: "/appliance/[id]", params: { id, profile } });
}
export function openReading(profile: string, key: string) {
  const state = useCockpit.getState();
  if (state.profileId !== profile) return;
  const canonical = resolveAlias(key, state.preferences.identities.aliases);
  const entity = Object.values(state.snapshot?.entities ?? {}).find(
    (entity) => entity.key === canonical,
  );
  if (entity && isVisible(entity, state.preferences))
    router.push({ pathname: "/device/[key]", params: { key: entity.key } });
}
