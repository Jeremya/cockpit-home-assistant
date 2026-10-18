const expoPreset = require("jest-expo/jest-preset");
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  clearMocks: true,
  // Three 0.186 is ESM; test real marker resources without loading its CJS shim.
  moduleNameMapper: {
    "^three$": "<rootDir>/node_modules/three/build/three.module.js",
  },
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) =>
    pattern.replace(".pnpm|", ".pnpm|three|decode-uri-component|"),
  ),
};
