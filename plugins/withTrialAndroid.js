const { mkdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
} = require("expo/config-plugins");

// Values are read only by Gradle. Neither passwords nor key paths enter app config.
const signing = `
// @maurice-trial-signing begin
def trialKey = System.getenv("MAURICE_SIGNING_STORE")
def trialPassword = System.getenv("MAURICE_SIGNING_PASSWORD")
if (!trialKey || !trialPassword) {
    throw new GradleException("Trial signing environment is required; use npm run build:trial:android")
}
android {
    signingConfigs {
        mauriceTrial {
            storeFile file(trialKey)
            storePassword trialPassword
            keyAlias "maurice-trial"
            keyPassword trialPassword
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.mauriceTrial
            debuggable false
        }
    }
}
// @maurice-trial-signing end
`;
const exclusions = ["root", "file", "database", "sharedpref", "external"]
  .map((domain) => `    <exclude domain="${domain}" path="." />`)
  .join("\n");

module.exports = function withTrialAndroid(config) {
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy")
      throw new Error("Trial signing requires the Expo Groovy template");
    mod.modResults.contents =
      mod.modResults.contents.replace(
        /\n\/\/ @maurice-trial-signing begin[\s\S]*?\/\/ @maurice-trial-signing end\n?/g,
        "",
      ) + signing;
    return mod;
  });
  config = withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(
      mod.modResults,
    );
    app.$["android:allowBackup"] = "false";
    app.$["android:fullBackupContent"] = "@xml/maurice_trial_backup";
    app.$["android:dataExtractionRules"] = "@xml/maurice_trial_extraction";
    return mod;
  });
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const xml = join(
        mod.modRequest.platformProjectRoot,
        "app/src/main/res/xml",
      );
      await mkdir(xml, { recursive: true });
      await writeFile(
        join(xml, "maurice_trial_backup.xml"),
        `<full-backup-content>\n${exclusions}\n</full-backup-content>\n`,
      );
      await writeFile(
        join(xml, "maurice_trial_extraction.xml"),
        `<data-extraction-rules>\n  <cloud-backup>\n${exclusions}\n  </cloud-backup>\n  <device-transfer>\n${exclusions}\n  </device-transfer>\n</data-extraction-rules>\n`,
      );
      return mod;
    },
  ]);
};
