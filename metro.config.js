const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Furniture GLBs are fetched at runtime by the shared Three.js DOM scene.
if (!config.resolver.assetExts.includes("glb"))
  config.resolver.assetExts.push("glb");

module.exports = config;
