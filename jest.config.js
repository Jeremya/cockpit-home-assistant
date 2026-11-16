const expoPreset = require("jest-expo/jest-preset");
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  clearMocks: true,
  // Agent worktrees are nested checkouts under .claude/; keep their suites and
  // duplicate package names out of discovery and the module map.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/\\.claude/"],
  modulePathIgnorePatterns: ["<rootDir>/\\.claude/"],
  // Three 0.186 is ESM; test real marker resources without loading its CJS shim.
  moduleNameMapper: {
    "^three$": "<rootDir>/node_modules/three/build/three.module.js",
  },
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) =>
    pattern.replace(".pnpm|", ".pnpm|three|decode-uri-component|"),
  ),
};
