# Query decoder compatibility bridge

`query-string@7.1.3`, used by Expo Router 57, requires the vulnerable CommonJS decoder 0.2.2. The package override selects the unmodified upstream `decode-uri-component@0.5.0` for that consumer. The upstream [security fix](https://github.com/SamVerschueren/decode-uri-component/commit/fa479da) removes recursive malformed-input decoding; [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) identifies 0.5.0 as patched.

The corrected decoder is ESM. Our single-line patch selects its default export from the existing CommonJS consumer. Node 24 supports this synchronous import; Metro/Jest transform the ESM decoder. No decoder source is forked or copied. `query-string` already replaces query `+` characters with spaces before calling it.

Install with `npm ci`, including development dependencies and install scripts. `patch-package --error-on-fail` runs before plan preparation and fails installation if the bridge cannot apply. Do not build from an installation made with `--ignore-scripts` or `--omit=dev`.

Run `npm run proof:dependencies`, the route-decoding tests and both platform exports after any router/query/decoder update. The bounded subprocess proof checks the installed consumer, the pinned decoder, Unicode/plus/repeated-value behavior and three long malformed inputs. The route tests use Expo Router's actual state parser. See the [R01 assessment](../docs/stage0/dependency-maintenance.md) for native validation and remaining advisories.

Remove the override and patch together once an SDK-compatible router/query-string release uses a corrected decoder without this bridge. Re-run the proof and native navigation before accepting that replacement. Keep this patch in build inputs and dependency-cache keys.

# Expo Router web history patch

`expo-router@57.0.28` forks React Navigation's web linking. Two defects break browser history around the detail panel (B02):

- `useLinking.js` records the first history entry with the state before navigators assign keys. Returning there resets every navigator key, so later entries name a dead root and Forward is silently ignored. The patch records the keyed root state when it exists.
- `createMemoryHistory.js` writes `replace()` at an internal index that `popstate` never updates. After Back, a forward entry is overwritten. The patch moves the index to the entry the browser now shows.

Both files are web-only: native resolves `useLinking.native.js`, and `createMemoryHistory` is required only by the web `useLinking.js`. Reproduction and acceptance: `node scripts/check-detail-panel.mjs` gives 20/21 without the patch (Home → device → reading, Back, Back, Forward) and 21/21 with it; `check:ui`, `check:spatial-ui`, Jest, `proof:dependencies` and the Android export with its runtime guard are unchanged. Remove the patch once an SDK-compatible Expo Router release fixes both paths, then re-run those checks.
