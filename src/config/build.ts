import Constants from "expo-constants";

const metadata = Constants.expoConfig?.extra?.maurice;
export const buildInfo = {
  trial: metadata?.channel === "internal-trial",
  version: Constants.expoConfig?.version ?? "development",
  number: typeof metadata?.build === "number" ? metadata.build : null,
  revision: typeof metadata?.revision === "string" ? metadata.revision : null,
  plan: metadata?.plan === "private" ? "private" : "sample",
};
// S02's Pixel acceptance is independent of the first standalone trial.
export const buildFeatures = { spatial3d: !buildInfo.trial };
