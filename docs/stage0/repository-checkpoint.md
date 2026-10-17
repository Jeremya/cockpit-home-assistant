# Repository checkpoint — 2026-10-17

This checkpoint records the integrated application and public evidence that previously existed only in the working tree after `45df8a4`. It does not implement R01 fixes, enable real controls or close hardware/standalone acceptance gates.

## Recorded commits

| Commit    | Scope                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ec6abf0` | Integrated application and tests: P03/P04, U03/U04, S01/S02 integration, C01–C04 and gated C07a, including loopback protocol proof |
| `3cf13a2` | Documentation, dated reviews, public sample fixtures, screenshots and safe validation aggregates                                   |

The application changes share source/types/navigation dependencies and were preserved as one complete application checkpoint rather than artificial partial feature histories. Documentation and public evidence are a separate commit. A final documentation-only commit records this verification; it does not change the tested application tree.

## Clean-checkout verification

Verification passed against an isolated local clone of `3cf13a2`, created with `git clone --no-hardlinks`. No original `node_modules`, ignored private plan, HA token or `.env.local` was copied. Node 24.11.1, npm 11.11.0 and the committed lockfile are used. `npm ci` completed successfully and its postinstall prepared the public sample automatically.

The first sandboxed install was interrupted because npm could not write its user cache/log directory. The install was repeated with the required filesystem/network permissions and succeeded. This environment failure is not counted as a successful install or an application defect.

| Check                                                  | Result                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| Fresh `npm ci` and automatic public fallback           | Pass; no private plan/token/environment file supplied                |
| TypeScript, lint and configured formatting             | Pass                                                                 |
| Repository tests                                       | **561 tests / 32 suites pass**                                       |
| Official-client loopback protocol proof                | Pass; **18 fake services**, no configured HA                         |
| Public web export                                      | Pass with isolated transform cache                                   |
| Public Android Hermes + DOM export                     | Pass with isolated transform cache                                   |
| Clone Git status after checks                          | Clean; generated files/exports remain ignored                        |
| Original workspace lockfile and private generated plan | Byte-for-byte unchanged                                              |
| Final export scan                                      | 59 files checked; configured token and original-checkout path absent |

The first Android export with the host's shared transform cache failed because Expo's generated DOM entry referred to the previous checkout's scene path. Repeating both web and Android exports with a fresh temporary transform cache passed. This records a build-cache relocation failure and its verified environment-level resolution; it does not claim an upstream package fix. Use the isolated-cache reproduction below when building multiple checkouts on the same machine.

[Safe aggregate proof](repository-checkpoint-proof-2026-10-17.json) records the tested base, application tree identities, checks and encountered failures. Raw logs, clone location, private-value comparisons and local orchestration remain ignored. The final record commit changes documentation only; the validated `app`, `src`, `scripts` and Jest config trees stay identical.

## Privacy and unchanged limits

The 122 initial candidate files were inventoried. Known private token/identifier literals and secret/artifact patterns were checked without printing values; the sole private-IP pattern hit was the README's explicitly labeled LAN example. The three added screenshots were visually inspected and show the public demo. Private household files, generated plan, `.env*`, native generated projects, installed binaries and local scripts/logs remain ignored.

The HS103 activation gate remains false; per-profile/per-device scope and physical acceptance remain open. S02 Pixel acceptance, the recorded development-client Fabric startup incident, current dependency findings, CI and R03a standalone acceptance remain separate tasks. This checkpoint includes no real HA service call, phone manipulation or dependency upgrade.

## Reproduction

From a checkout with Node 24 and no private files:

```sh
checkpoint_cache="$(mktemp -d)"
export TMPDIR="$checkpoint_cache"
npm ci
npm run typecheck
npm run lint
npm test -- --watch=false
npm run format:check
npm run proof:protocol
npx expo export --platform web --output-dir dist-web
npm run export:android
git status --short
```

The protocol proof uses disposable local fake WebSocket origins and needs permission to bind loopback ports. Exports are JavaScript/Hermes/DOM bundle checks, not an APK or phone acceptance. Local build logs remain ignored. Do not run a configured-household proof or copy private configuration to reproduce this checkpoint.
