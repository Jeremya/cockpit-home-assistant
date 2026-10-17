import type { SavedPlacement } from "./placements";
import type { MarkerIcon, SceneMarker } from "../web/sceneModel";

/** Allowlisted view data only; never pass an EntityRecord or its attributes to the DOM. */
export function placementSceneMarkers(
  entries: SavedPlacement[],
  floorId: string,
): SceneMarker[] {
  return entries.flatMap((entry) => {
    if (
      !entry.entity ||
      entry.issues.length ||
      entry.placement.floorId !== floorId
    )
      return [];
    const domain = entry.entity.domain;
    return [
      {
        key: entry.key,
        floorId,
        position: { ...entry.placement.position },
        icon: (["lock", "climate", "fan", "switch", "camera", "event"].includes(
          domain,
        )
          ? domain
          : "sensor") as MarkerIcon,
        label:
          entry.entity.name.length > 80
            ? entry.entity.name.slice(0, 79) + "…"
            : entry.entity.name,
        condition: entry.condition,
      },
    ];
  });
}
