import base from "../../app.json";

// Exercise the app config loaded by the real prebuild; secrets must never be in it.
const configure = require("../../app.config");
const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

test("development config keeps the existing identity and features", () => {
  delete process.env.MAURICE_VARIANT;
  expect(configure({ config: base.expo })).toEqual(base.expo);
});

test("trial has an isolated identity, no backup and no signing secrets", () => {
  process.env.MAURICE_VARIANT = "trial";
  process.env.MAURICE_TRIAL_BUILD_NUMBER = "1002";
  process.env.MAURICE_SOURCE_REVISION = "public-revision";
  process.env.MAURICE_SIGNING_PASSWORD = "must-not-appear-in-config";
  delete process.env.MAURICE_TRIAL_PLAN;
  const result = configure({ config: base.expo });
  expect(result.android).toMatchObject({
    package: "com.larrabee.homecockpit.trial",
    allowBackup: false,
    versionCode: 1002,
  });
  expect(result.scheme).toBe("mauricetrial");
  expect(result.version).toBe("0.1.0-trial.2");
  expect(result.extra.maurice).toMatchObject({
    channel: "internal-trial",
    plan: "sample",
  });
  expect(result.updates.enabled).toBe(false);
  expect(JSON.stringify(result)).not.toContain("must-not-appear-in-config");
  expect(result.plugins).toContain("./plugins/withTrialAndroid.js");
});

test.each(["0", "1000", "1001.5", "Infinity", "2100000001", "invalid"])(
  "rejects invalid trial build %s",
  (value) => {
    process.env.MAURICE_VARIANT = "trial";
    process.env.MAURICE_TRIAL_BUILD_NUMBER = value;
    expect(() => configure({ config: base.expo })).toThrow(
      "Trial build number",
    );
  },
);
