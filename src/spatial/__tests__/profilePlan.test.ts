import sample from "../sample-plan.json";
import { parseHousePlan, type HousePlan } from "../model";
import {
  defaultPlanChanged,
  planForProfile,
  resetSpatial,
  seedSpatial,
} from "../profilePlan";
import { emptySpatial } from "../../preferences/types";

const bundled = parseHousePlan(sample)!;
const revised = (plan: HousePlan, revision: number): HousePlan => ({
  ...structuredClone(plan),
  revision,
});

test("an unseeded profile receives a private copy of the default plan once", () => {
  const seeded = seedSpatial(emptySpatial(), bundled);
  expect(seeded.plan).toEqual(bundled);
  expect(seeded.plan).not.toBe(bundled);
  expect(seeded.seededFrom).toEqual({ planId: "sample-home", revision: 1 });
  seeded.plan!.floors[0]!.name = "Edited";
  expect(bundled.floors[0]!.name).not.toBe("Edited");
  expect(seedSpatial(seeded, revised(bundled, 2))).toBe(seeded);
});

test("a new bundled revision is reported but never replaces saved geometry", () => {
  const saved = seedSpatial(emptySpatial(), bundled);
  saved.plan!.floors[0]!.name = "My edit";
  const next = revised(bundled, 2);
  expect(defaultPlanChanged(saved, bundled)).toBe(false);
  expect(defaultPlanChanged(saved, next)).toBe(true);
  expect(defaultPlanChanged(saved, { ...next, id: "other", revision: 1 })).toBe(
    true,
  );
  expect(planForProfile(saved, next).floors[0]!.name).toBe("My edit");
  expect(defaultPlanChanged(emptySpatial(), next)).toBe(false);
});

test("reset replaces only spatial data with a fresh seed", () => {
  const saved = {
    ...seedSpatial(emptySpatial(), bundled),
    areaLinks: { room: "area" },
    placements: {
      lamp: { floorId: "f", roomId: null, position: { x: 1, z: 1 } },
    },
  };
  const next = revised(bundled, 3);
  const reset = resetSpatial(next);
  expect(reset).toEqual({
    plan: next,
    seededFrom: { planId: "sample-home", revision: 3 },
    areaLinks: {},
    placements: {},
  });
  expect(reset.plan).not.toBe(next);
  expect(saved.areaLinks).toEqual({ room: "area" });
});

test("an unseeded profile falls back to the bundled default", () => {
  expect(planForProfile(emptySpatial(), bundled)).toBe(bundled);
});
