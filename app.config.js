module.exports = ({ config }) => {
  const variant = process.env.MAURICE_VARIANT;
  if (!variant) return config;
  if (variant !== "trial") throw new Error("Unknown Maurice build variant");
  const build = Number(process.env.MAURICE_TRIAL_BUILD_NUMBER ?? 1001);
  if (!Number.isSafeInteger(build) || build < 1001 || build > 2100000000)
    throw new Error(
      "Trial build number must be an integer from 1001 to 2100000000",
    );
  const plan = process.env.MAURICE_TRIAL_PLAN ?? "sample";
  if (!["sample", "private"].includes(plan))
    throw new Error("Invalid trial plan source");
  return {
    ...config,
    name: "Maurice Trial",
    version: `0.1.0-trial.${build - 1000}`,
    scheme: "mauricetrial",
    updates: { enabled: false },
    android: {
      ...config.android,
      package: "com.larrabee.homecockpit.trial",
      versionCode: build,
      allowBackup: false,
      blockedPermissions: [
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
      ],
    },
    extra: {
      ...config.extra,
      maurice: {
        channel: "internal-trial",
        build,
        revision: process.env.MAURICE_SOURCE_REVISION ?? "unrecorded",
        plan,
      },
    },
    plugins: [
      ...(config.plugins ?? []).filter(
        (entry) =>
          !["expo-secure-store", "expo-dev-client"].includes(
            Array.isArray(entry) ? entry[0] : entry,
          ),
      ),
      ["expo-secure-store", { configureAndroidBackup: false }],
      ["expo-dev-client", { addGeneratedScheme: false }],
      "./plugins/withTrialAndroid.js",
    ],
  };
};
