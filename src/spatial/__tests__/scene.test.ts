import { placementSceneMarkers } from "../scene";
import { savedPlacements } from "../placements";
import { openPlacement } from "../navigation";
import { housePlanFor } from "../plans";
import { useCockpit } from "../../core/store";
import { router } from "expo-router";
import {
  fixtureEntity,
  fixturePreferences,
  fixtureSnapshot,
  publicPlan,
  location,
} from "./placementFixtures";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

test("only eligible saved placements cross the bridge, with shared cached/unknown conditions", () => {
  const snapshot = fixtureSnapshot([
    fixtureEntity({
      state: "unknown",
      name: "n".repeat(100),
      attributes: { token: "secret" },
    }),
  ]);
  const prefs = fixturePreferences({
    stable: location,
    missing: location,
    outside: { ...location, position: { x: 999, z: 999 } },
  });
  const markers = placementSceneMarkers(
    savedPlacements(snapshot, prefs, publicPlan, true),
    location.floorId,
  );
  expect(markers).toHaveLength(1);
  expect(Object.keys(markers[0]!)).toEqual([
    "key",
    "floorId",
    "position",
    "icon",
    "label",
    "condition",
  ]);
  expect(markers[0]).toMatchObject({
    key: "stable",
    icon: "switch",
    condition: "unknown",
  });
  expect(markers[0]!.label).toHaveLength(80);
  expect(JSON.stringify(markers)).not.toContain("secret");
  expect(
    placementSceneMarkers(
      savedPlacements(snapshot, prefs, publicPlan, false),
      location.floorId,
    )[0]!.condition,
  ).toBe("stale");
  expect(
    placementSceneMarkers(
      savedPlacements(snapshot, prefs, publicPlan, true),
      "another-floor",
    ),
  ).toEqual([]);
  prefs.visibility.stable = "hidden";
  expect(
    placementSceneMarkers(
      savedPlacements(snapshot, prefs, publicPlan, true),
      location.floorId,
    ),
  ).toEqual([]);
});

test("delayed placement navigation revalidates removal, floor, visibility, aliases and the profile", () => {
  const preferences = fixturePreferences({ old: location });
  preferences.identities.aliases.old = "stable";
  useCockpit.setState({
    mode: "demo",
    profileId: "demo",
    preferences,
    snapshot: fixtureSnapshot(),
    status: { kind: "ready", haVersion: "Demo", readySince: "" },
  });
  const identity = housePlanFor(useCockpit.getState()).identity;
  const open = () => openPlacement("demo", identity, location.floorId, "old");
  open();
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: "/device/[key]",
    params: { key: "stable" },
  });
  jest.mocked(router.push).mockClear();
  useCockpit.setState({
    preferences: {
      ...preferences,
      spatial: { ...preferences.spatial, placements: {} },
    },
  });
  open();
  expect(router.push).not.toHaveBeenCalled();
  useCockpit.setState({
    preferences: { ...preferences, visibility: { stable: "hidden" } },
  });
  open();
  expect(router.push).not.toHaveBeenCalled();
  useCockpit.setState({ preferences });
  openPlacement("demo", identity, "another-floor", "old");
  expect(router.push).not.toHaveBeenCalled();
  useCockpit.setState({ profileId: "other" });
  open();
  expect(router.push).not.toHaveBeenCalled();
  useCockpit.setState({ profileId: "demo", snapshot: fixtureSnapshot([]) });
  open();
  expect(router.push).not.toHaveBeenCalled();
});
