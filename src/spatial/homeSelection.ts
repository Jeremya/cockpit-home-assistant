import type { DeviceSummary } from "../core/deviceSummaries";
import type { HomeSnapshot } from "../core/types";
import type { HousePlan } from "./model";
import { own } from "./selectors";

export type HomeSelection =
  | { kind: "all" }
  | { kind: "area"; areaId: string }
  | { kind: "unassigned" }
  | { kind: "planRoom"; floorId: string; roomId: string };
export interface HomeViewState {
  identity: string;
  floorId: string;
  selection: HomeSelection;
}
type Links = Record<string, string>;

export function initialHomeView(
  identity: string,
  plan: HousePlan,
): HomeViewState {
  return { identity, floorId: plan.floors[0]!.id, selection: { kind: "all" } };
}

/** Resolve explicit links only. Ambiguity never chooses a room by name/order. */
function roomForArea(areaId: string, plan: HousePlan, links: Links) {
  const found = plan.floors.flatMap((floor) =>
    floor.rooms
      .filter((room) => own(links, room.id) === areaId)
      .map((room) => ({ floorId: floor.id, roomId: room.id })),
  );
  return found.length === 1 ? found[0]! : null;
}

export function selectedHomeRoom(
  state: HomeViewState,
  plan: HousePlan,
  links: Links,
) {
  const selection = state.selection;
  if (selection.kind === "area")
    return roomForArea(selection.areaId, plan, links);
  if (
    selection.kind === "planRoom" &&
    plan.floors.some(
      (floor) =>
        floor.id === selection.floorId &&
        floor.rooms.some((room) => room.id === selection.roomId),
    )
  )
    return { floorId: selection.floorId, roomId: selection.roomId };
  return null;
}

export function selectHomeArea(
  state: HomeViewState,
  areaId: string,
  plan: HousePlan,
  links: Links,
): HomeViewState {
  return {
    ...state,
    floorId: roomForArea(areaId, plan, links)?.floorId ?? state.floorId,
    selection: { kind: "area", areaId },
  };
}
export function selectHomeRoom(
  state: HomeViewState,
  floorId: string,
  roomId: string,
  plan: HousePlan,
): HomeViewState {
  return plan.floors.some(
    (floor) =>
      floor.id === floorId && floor.rooms.some((room) => room.id === roomId),
  )
    ? { ...state, floorId, selection: { kind: "planRoom", floorId, roomId } }
    : state;
}
export function selectHomeFloor(
  state: HomeViewState,
  floorId: string,
  plan: HousePlan,
): HomeViewState {
  return plan.floors.some((floor) => floor.id === floorId)
    ? { ...state, floorId, selection: { kind: "all" } }
    : state;
}

/** Cached/missing registries preserve intent; authoritative deletion clears it. */
export function reconcileHomeSelection(
  state: HomeViewState,
  plan: HousePlan,
  snapshot: HomeSnapshot | null,
  identity: string,
  links: Links,
): HomeViewState {
  if (
    state.identity !== identity ||
    !plan.floors.some((floor) => floor.id === state.floorId)
  )
    return initialHomeView(identity, plan);
  const selection = state.selection;
  if (
    (selection.kind === "area" &&
      snapshot?.metadata.areas.kind === "fresh" &&
      !own(snapshot.areas, selection.areaId)) ||
    (selection.kind === "planRoom" && !selectedHomeRoom(state, plan, links))
  )
    return { ...state, selection: { kind: "all" } };
  const room = selectedHomeRoom(state, plan, links);
  return room && room.floorId !== state.floorId
    ? { ...state, floorId: room.floorId }
    : state;
}

/** undefined means no linked area; null means explicitly unassigned. */
export function selectedHomeArea(
  state: HomeViewState,
  links: Links,
): string | null | undefined {
  switch (state.selection.kind) {
    case "area":
      return state.selection.areaId;
    case "unassigned":
      return null;
    case "planRoom":
      return own(links, state.selection.roomId);
    case "all":
      return undefined;
  }
}
export function filterHomeSummaries(
  groups: DeviceSummary[],
  state: HomeViewState,
  links: Links,
): DeviceSummary[] {
  if (state.selection.kind === "all") return groups;
  const area = selectedHomeArea(state, links);
  return area === undefined
    ? []
    : groups.filter((group) => group.roomIds.includes(area));
}
