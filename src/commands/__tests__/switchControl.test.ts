import {
  switchControlRestriction,
  switchOutcomeText,
  switchBinding,
  primarySwitch,
} from "../switchControl";
import { emptyPreferences } from "../../preferences/types";
import { entity, snapshot } from "./fixtures";
import type { CommandRecord } from "../types";

function authorization(
  value: ReturnType<typeof entity>,
  home: ReturnType<typeof snapshot>,
) {
  return {
    profileId: "public-home",
    preferences: {
      ...emptyPreferences(),
      switchEnrollments: {
        [value.key]: switchBinding(value, home, "public-home"),
      },
    },
  };
}
function fixture() {
  const value = entity({ deviceId: "plug" });
  const home = snapshot([value]);
  home.devices.plug = {
    id: "plug",
    name: "Lamp",
    manufacturer: "TP-Link",
    model: "HS103",
    areaId: null,
    entityIds: [value.entityId],
  };
  home.registryEntries = [
    {
      id: value.key,
      entity_id: value.entityId,
      device_id: "plug",
      area_id: null,
      entity_category: null,
      hidden_by: null,
      disabled_by: null,
      name: null,
      platform: "tplink",
    },
  ];
  return { value, home };
}
test("a physical HS103 requires exact profile and device enrollment", () => {
  const { value, home } = fixture();
  expect(switchControlRestriction(value, home, "homeAssistant")).toMatch(
    /Allow power control/,
  );
  expect(
    switchControlRestriction(
      value,
      home,
      "homeAssistant",
      authorization(value, home),
    ),
  ).toBeNull();
});
test.each([
  "model",
  "manufacturer",
  "platform",
  "device",
  "identity",
  "category",
  "disabled",
  "hidden",
  "stale-devices",
  "stale-entities",
  "domain",
  "mode",
])("keeps %s outside the accepted switch scope", (change) => {
  const { value, home } = fixture();
  if (change === "model") home.devices.plug!.model = "HS105";
  if (change === "manufacturer") home.devices.plug!.manufacturer = "PETLIBRO";
  if (change === "platform") home.registryEntries[0]!.platform = "demo";
  if (change === "device") home.devices.plug!.entityIds = [];
  if (change === "identity") home.registryEntries[0]!.id = "different";
  if (change === "category") value.entityCategory = "config";
  if (change === "disabled") value.disabledInHA = true;
  if (change === "hidden") value.hiddenInHA = true;
  if (change === "stale-devices")
    home.metadata.devices = {
      kind: "stale",
      lastLoadedAt: null,
      reason: "timeout",
    };
  if (change === "stale-entities")
    home.metadata.entities = {
      kind: "stale",
      lastLoadedAt: null,
      reason: "error",
    };
  if (change === "domain") value.domain = "lock";
  expect(
    switchControlRestriction(
      value,
      home,
      change === "mode" ? null : "homeAssistant",
      authorization(value, home),
    ),
  ).not.toBeNull();
});
test("demo scope enables only the public lamp and cannot enable hardware", () => {
  const { value, home } = fixture();
  expect(switchControlRestriction(value, home, "demo")).not.toBeNull();
  value.key = "demo-switch.living_lamp";
  value.deviceId = "demo-plug";
  home.devices["demo-plug"] = { ...home.devices.plug!, id: "demo-plug" };
  home.registryEntries[0] = {
    ...home.registryEntries[0]!,
    id: value.key,
    device_id: value.deviceId,
  };
  expect(switchControlRestriction(value, home, "demo")).toBeNull();
});
test.each(["profile", "device", "registry", "model", "capability"])(
  "enrollment cannot transfer after %s changes",
  (change) => {
    const { value, home } = fixture();
    const auth = authorization(value, home);
    if (change === "profile") auth.profileId = "other-home";
    if (change === "device")
      auth.preferences.switchEnrollments[value.key]!.deviceId = "other-plug";
    if (change === "registry")
      value.key = home.registryEntries[0]!.id = "recreated";
    if (change === "model") home.devices.plug!.model = "HS103(US)";
    if (change === "capability")
      auth.preferences.switchEnrollments[value.key]!.capability =
        "fan" as "switch";
    expect(
      switchControlRestriction(value, home, "homeAssistant", auth),
    ).not.toBeNull();
  },
);
test("primary action is unique, explicit and never selected from names or a hidden sibling", () => {
  const { value, home } = fixture();
  const prefs = emptyPreferences();
  expect(primarySwitch("plug", home, prefs, "homeAssistant")).toBe(value);
  const sibling = {
    ...value,
    key: "other",
    entityId: "switch.other",
    name: "Primary switch",
  };
  home.entities[sibling.entityId] = sibling;
  expect(primarySwitch("plug", home, prefs, "homeAssistant")).toBeNull();
  prefs.visibility[sibling.key] = "hidden";
  expect(primarySwitch("plug", home, prefs, "homeAssistant")).toBeNull();
});
test.each([
  "sending",
  "accepted",
  "confirmed",
  "failed",
  "unconfirmed",
] as const)("outcome %s has distinct simulated provenance", (status) => {
  const record = {
    status,
    error: "private raw backend error",
    confirmation: { kind: "observed", assumed: false },
  } as CommandRecord;
  expect(switchOutcomeText(record, true)).toMatch(/simulated/i);
  expect(switchOutcomeText(record, true)).not.toMatch(/Home Assistant|private/);
});
test("late and assumed evidence stays qualified", () => {
  const record = {
    status: "confirmed",
    confirmation: { kind: "reconciled", assumed: true },
  } as CommandRecord;
  expect(switchOutcomeText(record, false)).toMatch(/observed later/);
  expect(switchOutcomeText(record, false)).toMatch(/assumed/);
  expect(switchOutcomeText(record, false)).toMatch(
    /does not establish what caused/,
  );
});
