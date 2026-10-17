import { deviceSummaries } from "../deviceSummaries";
import { presentDevice, readingValue } from "../devicePresentation";
import { emptyPreferences } from "../../preferences/types";
import {
  fixtureEntity,
  fixtureSnapshot,
} from "../../spatial/__tests__/placementFixtures";
import { publicDeviceFixture } from "./deviceFixtures";

const summarize = (snapshot = publicDeviceFixture(), ready = true) =>
  deviceSummaries(snapshot, emptyPreferences(), "public-home", ready);
test("one feeder groups 23 actual members, separately from a plug and a standalone reading", () => {
  const snapshot = publicDeviceFixture();
  for (let i = 7; i < 23; i++)
    snapshot.entities[`sensor.extra_${i}`] = fixtureEntity({
      key: `extra-${i}`,
      entityId: `sensor.extra_${i}`,
      domain: "sensor",
      state: "1",
      name: `Other ${i}`,
      deviceId: "feeder",
    });
  const plug = fixtureEntity({ deviceId: "plug", key: "plug-state" });
  const standalone = fixtureEntity({
    deviceId: null,
    key: "standalone",
    entityId: "sensor.outdoor",
    domain: "sensor",
  });
  snapshot.entities[plug.entityId] = plug;
  snapshot.entities[standalone.entityId] = standalone;
  const groups = summarize(snapshot);
  expect(groups).toHaveLength(3);
  expect(groups.find((g) => g.deviceId === "feeder")?.members).toHaveLength(23);
  expect(groups.filter((g) => g.deviceId)).toHaveLength(2);
});
test("missing device metadata keeps actual membership without guessing a model from names", () => {
  const snapshot = publicDeviceFixture();
  snapshot.devices = {};
  const group = summarize(snapshot)[0]!;
  expect(group.members).toHaveLength(7);
  expect(group.name).toBe("Unnamed device");
  expect(presentDevice(group, snapshot, true).feeder).toBe(false);
});
test("hidden/disabled members stay out even if favored; explicit visibility may include diagnostic readings", () => {
  const snapshot = publicDeviceFixture();
  const members = Object.values(snapshot.entities);
  members[0]!.hiddenInHA = true;
  members[1]!.disabledInHA = true;
  members[2]!.entityCategory = "diagnostic";
  const prefs = emptyPreferences();
  prefs.favorites = [members[0]!.key];
  let group = deviceSummaries(snapshot, prefs, "home", true)[0]!;
  expect(group.members).toHaveLength(4);
  expect(group.favoriteRank).toBeNull();
  prefs.visibility = {
    [members[0]!.key]: "shown",
    [members[1]!.key]: "shown",
    [members[2]!.key]: "shown",
  };
  group = deviceSummaries(snapshot, prefs, "home", true)[0]!;
  expect(group.members).toHaveLength(6);
  expect(group.members).not.toContain(members[1]);
});
test("missing supported observations qualify coverage, excluding hidden, disabled and unsupported registry entries", () => {
  const snapshot = publicDeviceFixture(),
    base = snapshot.registryEntries[0]!;
  snapshot.registryEntries.push(
    { ...base, id: "missing", entity_id: "sensor.missing" },
    { ...base, id: "hidden", entity_id: "sensor.hidden", hidden_by: "user" },
    {
      ...base,
      id: "disabled",
      entity_id: "sensor.disabled",
      disabled_by: "integration",
    },
    { ...base, id: "unsupported", entity_id: "button.feed" },
  );
  const group = summarize(snapshot)[0]!;
  expect(group.coverage.missing).toBe(1);
  expect(presentDevice(group, snapshot, true).qualifiers).toContain(
    "1 missing reading",
  );
});
test("cross-room members and room overrides remain ambiguous instead of changing device membership", () => {
  const snapshot = publicDeviceFixture();
  snapshot.areas.office = { id: "office", name: "Office" };
  const prefs = emptyPreferences();
  prefs.roomOverrides["reading-0"] = "office";
  const group = deviceSummaries(snapshot, prefs, "home", true)[0]!;
  expect(group.roomLabel).toBe("Multiple rooms");
  expect(group.roomIds).toEqual(expect.arrayContaining(["office", "kitchen"]));
  expect(group.members).toHaveLength(7);
});
test("view identity is profile-scoped; alias favorites and entity renames preserve the same group", () => {
  const snapshot = publicDeviceFixture(),
    prefs = emptyPreferences();
  prefs.identities.aliases.old = "reading-0";
  prefs.favorites = ["old"];
  const before = deviceSummaries(snapshot, prefs, "home-a", true)[0]!;
  const member = snapshot.entities["sensor.public_0"]!;
  delete snapshot.entities[member.entityId];
  member.entityId = "sensor.renamed";
  snapshot.entities[member.entityId] = member;
  expect(deviceSummaries(snapshot, prefs, "home-a", true)[0]?.id).toBe(
    before.id,
  );
  expect(before.favoriteRank).toBe(0);
  expect(deviceSummaries(snapshot, prefs, "home-b", true)[0]?.id).not.toBe(
    before.id,
  );
  member.key = "recreated-uuid";
  expect(
    deviceSummaries(snapshot, prefs, "home-a", true)[0]?.favoriteRank,
  ).toBeNull();
});
test("availability and interpretation are independent of a connected member; disconnected data becomes cached", () => {
  const snapshot = publicDeviceFixture();
  snapshot.entities["sensor.public_0"]!.state = "unavailable";
  const group = summarize(snapshot)[0]!,
    display = presentDevice(group, snapshot, true);
  expect(group.coverage).toMatchObject({
    assessed: 1,
    visible: 7,
    unknown: 1,
    unavailable: 1,
  });
  expect(display.qualifiers).toEqual(
    expect.arrayContaining([
      "Partial availability",
      "1 reading needs interpretation",
      "Summary incomplete",
    ]),
  );
  expect(group.members.some((e) => e.state === "low")).toBe(true);
  expect(
    presentDevice(summarize(snapshot, false)[0]!, snapshot, false).qualifiers,
  ).toContain("Cached · current state unknown");
});
test("explicit model/platform/registry role metadata works across translated names and arbitrary entity IDs", () => {
  const snapshot = publicDeviceFixture(),
    group = summarize(snapshot)[0]!;
  const display = presentDevice(
    group,
    snapshot,
    true,
    Date.parse("2026-10-16T15:00:00Z"),
  );
  expect(display.feeder).toBe(true);
  expect(display.rows.find((r) => r.label === "Reported today")?.value).toBe(
    "40 g",
  );
  expect(display.rows.find((r) => r.label === "Connectivity")?.value).toBe(
    "Connected",
  );
  expect(display.headline).toBe(
    new Date("2026-10-16T12:00:00Z").toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  );
  snapshot.registryEntries.forEach((e) => {
    delete e.translation_key;
  });
  expect(presentDevice(summarize(snapshot)[0]!, snapshot, true).feeder).toBe(
    false,
  );
});
test("wrong integration, wrong model and recreated registry UUIDs cannot claim feeder roles", () => {
  for (const variant of ["platform", "model", "id"]) {
    const snapshot = publicDeviceFixture();
    if (variant === "model") snapshot.devices.feeder!.model = "Unknown";
    else
      snapshot.registryEntries.forEach((entry) => {
        if (variant === "platform") entry.platform = "other";
        else entry.id = "recreated-" + entry.id;
      });
    expect(presentDevice(summarize(snapshot)[0]!, snapshot, true).feeder).toBe(
      false,
    );
  }
});
test("missing/ambiguous roles, invalid times and unverified quantity units remain explicit", () => {
  const snapshot = publicDeviceFixture();
  snapshot.entities["sensor.public_0"]!.state = "0";
  snapshot.entities["sensor.public_2"]!.attributes.unit_of_measurement = "cups";
  const display = presentDevice(summarize(snapshot)[0]!, snapshot, true);
  expect(display.headline).toBe("Time not reported");
  expect(display.rows.find((r) => r.label === "Reported today")?.value).toBe(
    "Quantity not verified",
  );
  snapshot.registryEntries[0]!.translation_key = "next_feed_time";
  expect(
    presentDevice(summarize(snapshot)[0]!, snapshot, true).rows[1]?.value,
  ).toBe("Not reported");
});
test("zero quantities remain zero; elapsed announced time and stale metadata do not promise a future feed", () => {
  const snapshot = publicDeviceFixture();
  snapshot.entities["sensor.public_2"]!.state = "0";
  snapshot.metadata.entities = {
    kind: "stale",
    lastLoadedAt: null,
    reason: "timeout",
  };
  const display = presentDevice(
    summarize(snapshot)[0]!,
    snapshot,
    true,
    Date.parse("2026-10-17T00:00:00Z"),
  );
  expect(display.rows[2]?.value).toBe("0 g");
  expect(display.rows[1]?.note).toMatch(/has passed/);
  expect(display.qualifiers).toContain("Device metadata cached");
});
test("malformed timestamps never turn numeric strings into a made-up distribution date", () => {
  const snapshot = fixtureSnapshot();
  for (const state of ["0", "1", "nonsense", "2026-10-16T12:00:00"])
    expect(
      readingValue(
        fixtureEntity({
          domain: "sensor",
          state,
          attributes: { device_class: "timestamp" },
        }),
        snapshot,
      ),
    ).toBe("Time not reported");
});
test("a device alert outranks an uninterpreted reading in the summary", () => {
  const snapshot = publicDeviceFixture();
  const fault = fixtureEntity({
    key: "fault",
    entityId: "lock.fault",
    name: "ZZ fault",
    domain: "lock",
    state: "jammed",
    deviceId: "feeder",
  });
  snapshot.entities[fault.entityId] = fault;
  expect(summarize(snapshot)[0]!.issues[0]!.key).toBe("fault");
});
