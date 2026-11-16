import type { FurnitureKind, FurnitureVariant } from "../spatial/model";

/**
 * Presentation-only catalog for the 3D furniture. Heights are approximate
 * preview targets in metres; the plan footprint remains the 2D source of truth.
 * Asset files are Kenney Furniture Kit (CC0 1.0); see
 * `assets/furniture/KENNEY-LICENSE.txt`.
 */
export interface FurnitureCatalogEntry {
  /** Normalized height in metres; a flat rug uses the plan footprint instead. */
  height: number;
  /** Flat textiles are stretched to the plan footprint and do not cast shadows. */
  flat?: boolean;
  /** One module repeated along the plan width (kitchen counter run). */
  tile?: boolean;
  /** Fallback volume material when a GLB cannot load. */
  fallback: "fabric" | "wood" | "stone" | "metal" | "plant";
}

export const furnitureCatalog: Record<FurnitureVariant, FurnitureCatalogEntry> =
  {
    sofa: { height: 0.85, fallback: "fabric" },
    armchair: { height: 0.8, fallback: "fabric" },
    coffeeTable: { height: 0.42, fallback: "wood" },
    diningTable: { height: 0.75, fallback: "wood" },
    chair: { height: 0.9, fallback: "wood" },
    desk: { height: 0.75, fallback: "wood" },
    deskChair: { height: 0.9, fallback: "fabric" },
    tvStand: { height: 0.5, fallback: "wood" },
    floorLamp: { height: 1.55, fallback: "metal" },
    plant: { height: 0.9, fallback: "plant" },
    rug: { height: 0.02, flat: true, fallback: "fabric" },
    rugRound: { height: 0.02, flat: true, fallback: "fabric" },
    counter: { height: 0.9, tile: true, fallback: "wood" },
    stove: { height: 0.9, fallback: "metal" },
    sink: { height: 0.9, fallback: "metal" },
    fridge: { height: 1.8, fallback: "metal" },
    bed: { height: 0.55, fallback: "fabric" },
    nightstand: { height: 0.55, fallback: "wood" },
    wardrobe: { height: 1.9, fallback: "wood" },
    bathroomSink: { height: 0.85, fallback: "stone" },
    toilet: { height: 0.75, fallback: "stone" },
    bathtub: { height: 0.55, fallback: "stone" },
    shower: { height: 2, fallback: "stone" },
  };

const UNSUPPORTED =
  /\b(bikes?|bicycle|wagon|suitcase|luggage|boxes?|hook rail|fireplace|cooktop|hob|ottoman|pouf|folding chairs?)\b/;

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Resolves the 3D model for an existing furniture footprint. An explicit plan
 * variant always wins. Older plans (the photo-derived household plan) only have
 * a name and a kind, so this is a **presentation** fallback: it never affects a
 * device, a room link or a command, and the 2D footprint stays authoritative.
 *
 * Legacy items are fitted to their drawn footprint; a missing match returns
 * null so unsupported garage/utility items stay in 2D instead of becoming a
 * wrong 3D object.
 */
export function resolveFurnitureVariant(item: {
  name: string;
  kind: FurnitureKind;
  shape: "rect" | "ellipse";
  variant?: FurnitureVariant;
}): { variant: FurnitureVariant; fitToFootprint: boolean } | null {
  if (item.variant) return { variant: item.variant, fitToFootprint: false };
  const name = normalizeName(item.name);
  const resolved = (variant: FurnitureVariant) => ({
    variant,
    fitToFootprint: true,
  });
  if (UNSUPPORTED.test(name)) return null;
  if (name.includes("toilet") || name.includes("wc")) return resolved("toilet");
  if (name.includes("bathtub") || name.includes("bath tub"))
    return resolved("bathtub");
  if (name.includes("shower")) return resolved("shower");
  if (
    name.includes("bathroom sink") ||
    name.includes("lavabo") ||
    name.includes("washbasin")
  )
    return resolved("bathroomSink");
  if (name.includes("sink"))
    return resolved(item.kind === "fixture" ? "bathroomSink" : "sink");
  if (name.includes("fridge") || name.includes("refrigerator"))
    return resolved("fridge");
  if (name.includes("stove") || name.includes("oven")) return resolved("stove");
  if (
    name.includes("armchair") ||
    name.includes("rattan") ||
    name.includes("fauteuil") ||
    name.includes("lounge chair")
  )
    return resolved("armchair");
  if (
    name.includes("loveseat") ||
    name.includes("sofa") ||
    name.includes("settee") ||
    name.includes("canape")
  )
    return resolved("sofa");
  if (
    name.includes("dining chair") ||
    name.includes("chair") ||
    name.includes("chaise")
  )
    return resolved("chair");
  if (name.includes("coffee table") || name.includes("table basse"))
    return resolved("coffeeTable");
  if (name.includes("dining table")) return resolved("diningTable");
  if (
    name.includes("side table") ||
    name.includes("nightstand") ||
    name.includes("chevet")
  )
    return resolved("nightstand");
  if (name.includes("desk chair") || name.includes("office chair"))
    return resolved("deskChair");
  if (name.includes("desk") || name.includes("bureau")) return resolved("desk");
  if (name.includes("bed")) return resolved("bed");
  if (name.includes("wardrobe") || name.includes("armoire"))
    return resolved("wardrobe");
  if (name.includes("tall cabinet")) return resolved("wardrobe");
  if (name.includes("console")) return resolved("tvStand");
  if (
    name.includes("built-in") ||
    name.includes("sideboard") ||
    name.includes("buffet")
  )
    return resolved("counter");
  if (name.includes("island") || name.includes("counter"))
    return resolved("counter");
  if (
    name.includes("rug") ||
    name.includes("runner") ||
    name.includes("carpet")
  )
    return resolved(item.shape === "ellipse" ? "rugRound" : "rug");
  if (name.includes("plant") || name.includes("fig") || name.includes("ficus"))
    return resolved("plant");
  if (name.includes("tv") || name.includes("television"))
    return resolved("tvStand");
  if (name.includes("lamp")) return resolved("floorLamp");
  if (name.includes("table")) return resolved("diningTable");
  switch (item.kind) {
    case "seating":
      return resolved("armchair");
    case "table":
      return resolved("diningTable");
    case "rug":
      return resolved(item.shape === "ellipse" ? "rugRound" : "rug");
    case "counter":
      return resolved("counter");
    case "plant":
      return resolved("plant");
    case "storage":
    case "appliance":
    case "fixture":
      return null;
  }
}

/** Highest preview target on a floor, used to frame above tall furniture. */
export function tallestFurniture(
  variants: Iterable<FurnitureVariant | undefined>,
) {
  let tallest = 0;
  for (const variant of variants) {
    if (variant && furnitureCatalog[variant])
      tallest = Math.max(tallest, furnitureCatalog[variant].height);
  }
  return tallest;
}
