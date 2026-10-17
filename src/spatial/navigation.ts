import { useCockpit } from "../core/store";
import { resolveAlias } from "../preferences/types";
import { openReading } from "../services/deviceNavigation";
import { housePlanFor } from "./plans";
import { savedPlacements } from "./placements";

/** A delayed scene tap can open only a still-visible placement in the same home, plan and floor. */
export function openPlacement(
  profile: string | null,
  identity: string,
  floorId: string,
  key: string,
) {
  const latest = useCockpit.getState();
  if (!profile || latest.profileId !== profile) return;
  const current = housePlanFor(latest);
  if (current.identity !== identity) return;
  const canonical = resolveAlias(key, latest.preferences.identities.aliases);
  const entry = savedPlacements(
    latest.snapshot,
    latest.preferences,
    current.plan,
    latest.status.kind === "ready",
  ).find(
    (item) =>
      item.key === canonical &&
      item.placement.floorId === floorId &&
      !item.issues.length,
  );
  if (entry) openReading(profile, entry.key);
}
