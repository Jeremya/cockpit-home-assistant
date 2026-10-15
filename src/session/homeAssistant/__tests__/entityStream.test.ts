import { applyEntityStream } from "../entityStream";
import { mapSnapshot } from "../mapSnapshot";
import { emptyIdentity } from "../../../preferences/types";
import type { EntityRegistryEntry } from "../../../core/types";
const initial = () =>
  applyEntityStream(
    {},
    {
      a: {
        "climate.home": {
          s: "heat",
          a: { temperature: 71, current_temperature: 70 },
          lc: 100,
        },
      },
    },
    true,
  );
test("attribute-only changes preserve state time, remove attributes and retain unrelated objects", () => {
  const before = initial();
  const next = applyEntityStream(before, {
    c: {
      "climate.home": {
        "+": { a: { temperature: 72 }, lu: 110 },
        "-": { a: ["current_temperature"] },
      },
    },
  });
  expect(next["climate.home"]?.state).toBe("heat");
  expect(next["climate.home"]?.attributes).toEqual({ temperature: 72 });
  expect(next["climate.home"]?.last_changed).toBe(
    before["climate.home"]?.last_changed,
  );
  expect(next["climate.home"]?.last_updated).not.toBe(
    before["climate.home"]?.last_updated,
  );
  expect(before["climate.home"]?.attributes.temperature).toBe(71);
});
test("a fresh initial snapshot removes entities missed during a disconnect", () => {
  expect(applyEntityStream(initial(), { a: {} }, true)).toEqual({});
  expect(applyEntityStream(initial(), { r: ["climate.home"] })).toEqual({});
});
const entry: EntityRegistryEntry = {
  id: "stable-id",
  entity_id: "climate.home",
  device_id: null,
  area_id: null,
  entity_category: null,
  hidden_by: null,
  disabled_by: null,
  name: "Home",
};
test("identity survives an outage and does not override a successful registry removal", () => {
  const known = mapSnapshot(initial(), [entry], true);
  const outage = mapSnapshot(initial(), [], false, known.identities);
  expect(outage.entities["climate.home"]?.key).toBe("stable-id");
  const removal = mapSnapshot(initial(), [], true, known.identities);
  expect(removal.entities["climate.home"]?.key).toBe("entity:climate.home");
});
test("fallback identities gain aliases; recreated entries do not inherit the old UUID", () => {
  const fallback = mapSnapshot(initial(), [], false, emptyIdentity());
  const registered = mapSnapshot(initial(), [entry], true, fallback.identities);
  expect(registered.identities.aliases["entity:climate.home"]).toBe(
    "stable-id",
  );
  const recreated = mapSnapshot(
    initial(),
    [{ ...entry, id: "different-id" }],
    true,
    registered.identities,
  );
  expect(recreated.entities["climate.home"]?.key).toBe("different-id");
  expect(recreated.identities.aliases["entity:climate.home"]).toBe("stable-id");
});
test("unchanged normalized records retain identity through unrelated emissions", () => {
  const raw = initial();
  const first = mapSnapshot(raw, [entry], true);
  const next = mapSnapshot(
    { ...raw },
    [entry],
    true,
    first.identities,
    first.entities,
  );
  expect(next.entities["climate.home"]).toBe(first.entities["climate.home"]);
});
