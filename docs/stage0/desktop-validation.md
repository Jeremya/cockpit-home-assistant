# D01 desktop validation — 2026-10-19

The [desktop contract](../design/desktop.md) preserves shared screens, cards, plan components, SessionManager, command policy and preference schema 3. Browser-only differences are the workspace shell/CSS, volatile credential storage and native browser confirmation dialogs. No new package or server-side credential service is introduced.

## Source and isolated browser checks

**634 Jest tests / 41 suites** pass, including the common credential journal exercised with per-page browser stores. TypeScript, lint and formatting pass. **19 tooling tests** pass outside the filesystem/network sandbox; the first sandbox run could not bind loopback (`EPERM`), which also timed out the fixture cases. This was an environment restriction, not a product regression.

The public UI runner checks the full Home/rooms/readings/favorites/plan/placement/power flow at **320/430/768/1440**, plus desktop resize, keyboard navigation, active links and skip-to-content. The original M00 focus assertions stay in place, extended to sixteen assertions across four widths. Public exports use an isolated sample-only install/cache; the developer's prepared plan is preserved. Sample screenshots and aggregate results stay separate from local household checks.

Initial harness corrections put the first-Tab assertion before the pointer-driven demo button, restrict DOM queries to the exposed route when the Stack retains hidden screens, and use the existing `Cancel permission` label. These corrections do not relax focus, credential, command or network assertions. Overview navigation also explicitly dismisses back to the existing Home route.

The closed browser HA fixture uses only its public token and exact loopback endpoint. Its cases check default denial, explicit review/cancel/grant, no service on enrollment, two simulated On/Off requests, network recovery without replay, memory-only credentials, reload requiring a token while preserving preferences/grant, and browser Forget cancel/confirm. It never sends household services.

## Real Chrome and household scope

**Google Chrome 155.0.8059.80 on this Mac**, at localhost:8082 with the local development bundle, connects read-only to the actual HA instance, opens the real HS103 summary with both actions disabled by default, and renders the personal profile plan without horizontal overflow. The token is absent from browser persistence and the URL. **Zero device service requests and zero page errors** are observed. This fresh isolated Chrome context is closed after checking; it does not sign the user's normal Chrome profile in. No personal screenshot, identity, URL or token is committed.

The development server remains local for the user. D01 does not update either phone's installed binary, repeat the authorized M01 physical cycle or establish Chrome physical-control acceptance. M01's Pixel 1009 acceptance remains in its [own ledger](power-enrollment-validation.md). Production 3D/GPU, persistent browser sign-in, fresh offline startup, remote hosting and public distribution remain separate work.

The [safe aggregate](desktop-proof-2026-10-19.json) records final source checks and browser scope. The reviewed dependency policy retains its three tooling exceptions and unchanged 2026-11-02 expiry; strict public release still requires closure.

## Local responsive preview — 2026-10-20

The [phone-frame preview](../design/desktop.md#shared-interface-and-phone-preview) was checked in Google Chrome **155.0.8059.85**, in a fresh context using public demo data. All five viewports (**360×800, 412×915, 430×932, 768×1024, 1280×900**) fit the surrounding stage without horizontal overflow in the app. Room selection survives every size change. Rotation works from the keyboard; crossing the desktop breakpoint adds/removes the existing sidebar. Resizing while an appliance detail is open retains its route and document lifetime. Resizing the outer window scales the frame while preserving the selected inner viewport.

There is one iframe throughout. No external requests, device commands or uncaught page errors were observed. The development app does emit nine React DOM warnings about native responder/accessibility props and `onPress`; its visible LogBox is not suppressed by the preview. Cleaning up those shared SVG/web properties remains separate work. The preview check does not certify SVG hit testing, production 3D, HMR behavior after an edit, native rendering or Android accessibility.

Scoped preview ESLint/Prettier checks and TypeScript passed. No app dependency or native runtime source was changed for the preview. Local reproduction script, report and demo screenshots are in ignored `.local/responsive-preview/`; they are not a new CI acceptance claim. Launch instructions are in the README.

## Local file login and development warnings — 2026-10-20

The follow-up implements the [opt-in local token loader](../design/desktop.md#local-token-loading-development-only). Chrome **155.0.8059.85** loaded the existing local file, required HTTP trust before connecting, authenticated with actual HA, and displayed synchronized observations at compact and wide widths. Reload cleared the input/session credential; a second explicit load reused the file. The token was absent from browser local/session storage and URL. **Zero service calls, external requests, page errors or console errors** were observed. No household screenshots or credentials were captured. This acceptance used an isolated browser context, not the user's normal Chrome profile.

The nine development warnings reported above are corrected: `FloorPlanView` keeps native accessibility props off DOM SVG; `PlanRoomPolygon` shares its geometry/styling props while adapting native press to DOM click; the desktop anchor adapter removes Expo Link's redundant native `onPress` while retaining its web click, href and ref. No warning suppression was introduced. All five preview sizes pass again, with actual SVG room selection by pointer and room-button selection by keyboard at compact and wide widths, and zero console warnings.

The HTTP regression test uses public fake tokens and checks exact Origin/Host, the non-simple request header, preflight, denied methods/body injection, file permissions, missing/invalid/oversized files, symlink rejection and token rotation. Client tests cover memory-only loading, invalid responses, timeouts and disabled release behavior. Native screen regressions retain the shared room/placement interactions; no new on-device binary acceptance is claimed.

Final scoped checks pass: **41 Jest tests / 4 suites**, **2 HTTP tooling tests**, TypeScript, scoped ESLint/Prettier and diff whitespace checks. The browser client suite supplies Node's standard URL parser because Expo's native lazy URL polyfill expects a TextEncoder absent from jsdom; actual URL handling was also exercised in Chrome above.

Ignored local checks: `.local/local-connection/check.mjs` and its safe aggregate report, plus the extended `.local/responsive-preview/check.mjs`. Source changes and evidence are local; no remote CI or push is implied.

## UX00 checkpoint — 2026-10-20

[UX00](../handoff/UX00-checkpoint.md) consolidates the uncommitted preview, local loader, DOM/SVG corrections and CSS declaration without redesigning a screen. Every expected file was present in this workspace; nothing was reimplemented. The only source addition is the portable preview process test below. Initial implementation status: **local only, uncommitted**; see the final UX00/UX01 review below for the Git checkpoint.

Full source checks on the working tree (HEAD `42d833d` plus local changes):

| Command                     | Result                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`         | pass                                                                                                                                                                                  |
| `npm run lint`              | pass                                                                                                                                                                                  |
| `npm run format:check`      | pass                                                                                                                                                                                  |
| `npm test -- --watch=false` | **643 tests / 42 suites** pass                                                                                                                                                        |
| `npm run test:tooling`      | **23 tests** pass (21 before the new preview test), run outside the sandbox                                                                                                           |
| `npm run check:ui`          | passed: 320/430/768/1440, desktop layout, closed HA fixture; 0 page errors, 0 external requests, 0 physical service calls; developer plan unchanged; Playwright Chromium 156.0.8078.4 |

**Clean-checkout typecheck and Android JS.** An isolated public snapshot (same `copyPublicSource`/`publicEnvironment` as `check:ui`, fresh `npm ci`, sample plan) had **no `expo-env.d.ts` and no `.expo/types`** before checking. `npm run typecheck` passed. As a control in that snapshot only, removing `src/types/styles.d.ts` makes `tsc` fail with TS2882 on `./desktop.css`, so the declaration is required. `npm run export:android -- --source-maps` and `npm run check:runtime-dependencies -- dist android` passed; the plan stayed the public sample. This is a JS/Hermes/DOM validation, not an accepted APK. No file in the user's environment was removed.

**Chrome preview.** The ignored `.local/responsive-preview/check.mjs` ran again in Google Chrome **155.0.8059.85** against the running dev server and preview, using only **Explore demo home**: 360/412/430/768/1280, keyboard rotation, resize while an appliance detail is open (same URL and document `timeOrigin`), outer-window resize, one iframe, SVG room selection by pointer and room button by keyboard at 1280 and 412. **0 console warnings/errors, 0 page errors, 0 external requests.** LogBox is not suppressed. The helper was running with `--local-ha`, but this check never calls `/local-connection` or HA.

**Portable preview test.** `scripts/__tests__/preview-devices.test.mjs` spawns the real script on a free port with a fake app server in the test. It checks GET/HEAD of the three assets and their headers (CSP `frame-src` = app origin, `no-store`, `nosniff`), the substituted iframe origin, 404 for other paths and methods, `/local-connection` absent without `--local-ha`, clean SIGTERM exit (code 0, port closed), and CLI refusal before listening for non-loopback, `0.0.0.0`, credential, path, query or `file:` app origins, an app port equal to the preview port, and a privileged port. It never passes `--local-ha` and never reads `.local/ha-token`. The handler's allowed/refused reads stay in `local-connection.test.mjs`.

**Audit.** `npm run check:audit`: `passed-with-exceptions`, npm exit 1 with **56 entries / 3 advisories** (braces, node-forge, sprintf-js). These are exactly the reviewed tooling exceptions expiring **2026-11-02**. The network is reachable, the advisories match the policy (no drift), and the exceptions are not expired. `check:audit:strict` fails as expected (`strict_audit_findings`); public release stays blocked. No fresh remote CI was run.

Excluded from any delivery: `.local/`, `.env*`, `artifacts/`, generated plan and Expo types.

## UX01 shared Home — 2026-10-20

[UX01](../handoff/UX01-shared-home.md) is presentation only (M03). Initial implementation status: **local only, uncommitted**, on top of UX00; see the final UX00/UX01 review below for the Git checkpoint. M03 is not complete: direct card action remains (UX02, then UX03).

- `src/theme.ts` adds `spacing` (4–32), `radii` (control 12, card 20, panel 24), `typography` (secondary 13/19, body 15/22, name 16/22, value 26/34, title 30/36) and `minTouchTarget` (48). Colors are unchanged. Only Home, `DeviceSummaryCard` and `HousePlanCard` use them, plus the `CardGrid` gap.
- Home has one tree for every width: header (Settings on compact, Refresh on desktop, as before) → session banner → attention panel → `HousePlanCard` → “Around your home”, filters, favorites, room groups. On desktop the attention panel (360 px) and the expanded house card sit side by side in that same order (`home-overview`). The house card stays compact on phones. Each card is rendered once. Headings expose the header role.
- `CardGrid` derives its columns from its measured width (1–3, min 320 px) instead of the desktop breakpoint, so 768 px now shows two columns.
- Cards: wrapping names (`minWidth: 0`), tabular figures for values, the same `presentDevice` rows (two generic supporting rows, the existing Petlibro rows) and every qualifier shown as text. The card stays one press target that opens the detail only.

| Command                                                     | Result                                                                                                                                                                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Targeted Jest (Home, EntityCard, deviceSummaries)           | **23 tests** pass, including two new ones: compact and wide reading order with identical single cards, favorites not repeated in All rooms or under a room filter                                                    |
| `npm test -- --watch=false`                                 | **645 tests / 42 suites** pass                                                                                                                                                                                       |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | pass                                                                                                                                                                                                                 |
| `npm run check:ui`                                          | passed: 320/430/768/1440, desktop layout (testID renamed to `home-overview`), 48 px targets, no overflow; 0 page errors, 0 external requests, 0 physical service calls; public sample plan; developer plan unchanged |

**Public captures before/after.** `home-430` and `home-1440` were compared with the previous public run. At 430 px the house card moved from below the whole list to just after attention, and the first device card is still on the first screen. At 1440 px attention now precedes the house in both the DOM and the visual order.

**Zoom and long names (dev server, demo only, nothing captured).** Playwright Chromium at 720×466 (1440 at 200 %), 215×466 (430 at 200 %), 320 and 768, with one card's name replaced in the DOM by a 74-character name: no horizontal overflow, the name wraps and the card grows, and reading order is preserved. This is a Chrome simulation. Large-font phone verification belongs to UX09.

## UX03 card action — 2026-10-20

[UX03](../handoff/UX03-card-action.md) finishes M03's quick action on top of [UX02](../handoff/UX02-switch-controller.md)'s `useSwitchCommand`. Source checkpoint: **`8ea4e2a`, committed locally, not pushed**. UX02 and UX03 were done in this same working tree by two sessions, one after the other; UX02's state on disk was kept as-is.

- `DeviceSummaryCard` is now a plain `View` with two sibling regions: the **Open device** target (`openDeviceSummary`, unchanged) and, for the unique existing `primarySwitch`, `components/controls/CompactPowerAction.tsx`. No target is nested in another and the card makes no service call.
- The action is shown only when `switchControlRestriction` allows this device in this home (the demo lamp; an enrolled HS103 in HA). Its single button sends the intent from the displayed observation (Off → `Turn … on`, On → `Turn … off`). Unknown/unavailable shows a disabled **Power unavailable** with no assumed inverse. Cached, background, `sending` and `accepted` disable it with an explanation. Revocation or lost identity removes it; a result for that identity stays readable (polite live region, `switchOutcomeText`, **Dismiss result for …**).
- The switch headline uses the active color only for a ready, qualified On observation; a sent or accepted request never colors the card.
- `useSwitchCommand` additionally returns `restriction`; the captured target stays private. [M01](../design/power-enrollment.md) and the [control contract](../design/switch-controls.md) are amended.

| Command                                                                                    | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DeviceSummaryCard.test.tsx` (new, real `SessionManager`: demo plus the closed HA fixture) | **10 tests** pass: open → navigation with zero commands; action → one command with zero navigation; two synchronous presses → one send; unknown/unavailable; cached and background; old session/epoch callback refused; acknowledgement without observation (headline Off, muted, then "not confirmed"); external On changes headline and next intent; HA grant absent/allowed/revoked (result kept); another HS103 and an ambiguous device get no action |
| UX02 regressions + Home + EntityCard + DeviceSummaryScreen (8 suites)                      | **170 tests** pass                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Full Jest, with `--modulePathIgnorePatterns='<rootDir>/.local/'`                           | **656 tests / 43 suites** pass. Without this flag, Jest resolves a second React from `.local/ux-review/candidate/node_modules` (a copy that appeared around 14:56, created neither by this session nor by the UX02 session) and fails                                                                                                                                                                                                                     |
| `npm run typecheck`, `npm run lint`, `npm run format:check`                                | pass                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `npm run test:tooling`                                                                     | **23 tests** pass                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `npm run check:ui`                                                                         | passed at 320/430/768/1440 with the new `cardPowerKeyboardWithoutNavigation` and `cardOpenWithoutCommand` flags (Enter for On, Space for Off, same URL, results dismissed, then Enter on **Open device** shows the summary, lamp still Off, no outcome). The 48 px target, the existing M00 focus assertions and the M01 summary flow still pass; 0 page errors, 0 external requests, 0 physical service calls; developer plan unchanged                  |
| `npm run check:audit`                                                                      | first `reviewed_inputs_changed` (`scripts/check-ui.mjs` only); after the [card action review](../design/dependency-policy.md#card-action-review--2026-10-20) and the new fingerprint: `passed-with-exceptions`, same 56 entries / 3 advisories, expiry 2026-11-02 unchanged                                                                                                                                                                               |

Keyboard checks in Jest are not possible on `Pressable`; Enter/Space are covered by the public Chrome smoke. No real lamp was operated; the one-press physical effect and phone/TalkBack checks belong to UX09.

## UX00/UX01 precommit review — 2026-10-20

**Reviewed local Git checkpoint; no push or remote CI.** The candidate contains
UX00's preview/local-loader/DOM prerequisites, the handoff documentation and
UX01's shared Home presentation. It was frozen from `42d833d` plus those explicit
paths and installed separately with `npm ci`. Concurrent UX02/UX03 source,
command tests and smoke additions are excluded; results below belong to this
candidate, not to the evolving combined workspace.

### Findings corrected

- **CI blocker:** UX01 changed the pinned smoke selector from `desktop-overview`
  to `home-overview` without its exposure review. `check:audit` reproduced
  `reviewed_inputs_changed`. Inspection confirmed that one string replacement
  was the only pinned-input change. The [dated rationale](../design/dependency-policy.md#shared-home-review--2026-10-20)
  and fingerprint now match. No dependency, graph, advisory, exception or expiry
  changed; public release still requires the strict audit.
- **Handoff status:** the main entry points still told the next model to start
  UX00/UX01 despite their implementation. They now distinguish this reviewed
  checkpoint from UX02/UX03's separate work and next integration review.

No further blocking defect was found in the reviewed scope. Home retains the
same device grouping, favorites, qualifiers, session banner and detail routes;
UX01 introduces no new command dispatch. The development loader remains opt-in,
loopback-only, exact-origin, bounded-file and memory-only.

### Fresh verification of this candidate

| Check | Result |
| --- | --- |
| Fresh install, TypeScript, lint, format | Pass; TypeScript checked before generated Expo ambient types existed |
| Jest | **645 tests / 42 suites**, including local loading and Home order/favorites |
| Portable tooling | **23 tests**, including real preview child process and fake-token HTTP boundaries |
| Public browser smoke | **320/430/768/1440**, desktop resize/keyboard, 16 return-focus checks, closed HA fixture; **0 page errors, 0 external requests, 0 physical services**; Chromium 156.0.8078.4 |
| Development phone frame | Chrome **155.0.8059.85**, isolated Expo/preview on ports 8092/8093, **360/412/430/768/1280**, rotation, room and detail preserved, SVG pointer/room keyboard; **0 warnings/errors/external requests**; demo only, local HA loading disabled |
| Android source export | Hermes plus DOM export/source maps pass; runtime guard passes on **2 maps / 1,630 sources**; public sample plan |
| Web runtime guard | Pass on **1 map / 963 sources**; reviewed tooling excluded |
| Reviewed dependency audit | **passed-with-exceptions**, raw **56 entries / 3 advisories**, unchanged **2026-11-02** expiry |
| Strict dependency audit | Fails with **strict_audit_findings**, as required while those findings remain |

The first browser run hit sandbox `listen EPERM`; the authorized rerun passed.
The first strict audit attempt was unavailable in the sandbox; the network-enabled
retry reported the actual findings. Neither environment failure was classified
as a passing check. Public 430/1440 captures were inspected: the house precedes
the list and a first device is visible at 430×932.

### Remaining boundaries

No new APK, TalkBack/large-native-font acceptance, real HA login or physical
actuation was performed in this review. The earlier reduced CSS viewport/long-name
check is a reflow simulation, **not actual Chrome 200% zoom acceptance**; actual
zoom and native large fonts remain explicit acceptance work in UX09. UX02/UX03
need their own review/tests on the integrated code. UX03 also changes the pinned
smoke: its final diff needs a separate exposure review/fingerprint update before
claiming its audit passes. Do not copy this candidate's hash over later changes.

Only reviewed source/docs are committed. No `.local`, credentials, generated
plan, generated Expo types, bundles or screenshots are included.

## UX02/UX03 review — 2026-10-20

Reviewed `8ea4e2a`. The shared hook preserves the previous dispatch guards,
manager-owned outcomes and exact-device permission checks. Card targets are
siblings, and the smoke's additional interactions retain the closed demo/fixture
boundary and reviewed audit expiry.

**Reproduced and corrected:** a verified primary plug with three alphabetically
earlier sensor readings had a power action but no visible On/Off observation.
The generic presenter chose “4 readings” and its bounded supporting rows omitted
the switch. The card now prioritizes the existing unique `primarySwitch` for its
headline, while retaining issue qualifiers, supporting observations and the
unchanged permission path. A real-manager regression first failed on the missing
Off value, then passes for Off, an external On observation and the matching next
intent. Ambiguous devices and feeder presentation keep their existing rules.

The original **656 tests / 43 suites** pass with the normal `npm test` command.
The previous review's temporary checkout has been moved outside the repository;
the local duplicate-React workaround in the implementation note is no longer
needed. No physical device was operated. UX04 configuration and UX05 spatial
selection follow separately; no native acceptance is inferred from this review.

The corrected card also keys supporting rows by their entity key rather than
their display name; two identically named readings remain distinct without a
React duplicate-key warning. The focused card/Home suites pass **20 tests**;
the four control/card/Home suites passed **39 tests** before this key correction,
and TypeScript plus targeted ESLint pass.


## UX04 — Configuration Chrome dédiée — 2026-10-21

Le client choisi par l’utilisateur est Chrome sur ce Mac. La configuration a été réalisée par les écrans existants dans **un profil Chrome dédié** (`.local/ux04/chrome-profile`), à l’origine locale de développement. Il ne s’agit pas du profil Chrome habituel ni d’une synchronisation avec les téléphones.

Le plan déjà sauvegardé a été conservé sans reset. Résultat vérifié : **8 liens explicites, 2 placements de lectures représentatives, 2 favoris et 23 lectures de démonstration masquées**. Les positions sont des repères de pièce, pas des coordonnées mesurées. Les grants et la géométrie sauvegardée sont inchangés. Un rechargement puis un redémarrage du navigateur avec reconnexion confirment les préférences ; zéro appel de service, zéro requête externe et zéro erreur de page. Le token reste en mémoire de page ; après fermeture, Settings → Load local connection → Connect reste nécessaire. D02 n’est pas livré.

Les identifiants, noms, positions, préférences et compte rendu détaillé restent dans `.local/ux04/`. Aucune capture de la maison privée n’est ajoutée au dépôt. M02 est clôturé pour ce profil Chrome uniquement.

## UX05 — Sélection partagée — 2026-10-21

Home utilise la même sélection typée pour ses filtres, son étage et son plan 2D. Les liens sont explicites ; les pièces non liées restent vides avec accès à l’écran des liens. Le registre temporairement absent conserve l’intention, une suppression fraîche la réinitialise. Un appareil multi-zones reste unique dans All et accessible sous chaque zone. Les marqueurs utilisent la validation P04 et aucun choix de pièce n’envoie de commande.

La recette Chrome a reproduit la perte de sélection au retour de `/house-links` : Expo remonte le layout racine. Correction : une seule session UI bornée en mémoire, exposée par `HomeViewProvider`, sans observations ni autorisations copiées. Elle suit profil/plan/révision et invalide les callbacks d’anciens écrans. Aucun filtre ajouté à l’URL ou aux préférences. Sur compact, le plan se déplie pour conserver un accueil léger.

Chrome **155.0.8059.85**, export sample isolé, 430/1440 px : pièce non liée, liaison via l’UI, puce → étage/pièce, polygone → filtre, clavier, détail → Back, resize et changement d’étage passent. Zéro erreur de page/console, zéro requête externe et zéro service. Preuve locale : `.local/ux05/report.json`. Les images de cette recette utilisent uniquement le sample. La nouvelle suite pure et les régressions Home couvrent en plus les suppressions, registres cached, identités, multi-zones et anciens callbacks.

La validation ne vaut pas acceptation d’un nouvel APK, TalkBack ou performances 3D. La vue reste 2D par défaut ; UX07/UX08 suivent.


## UX06 — Cadrage maquette pur — 2026-10-21

`src/web/modelCamera.ts` calcule une pose en tuples monde avec FOV 26°, élévation 48°, azimut 35° ±40°, distance normalisée 1–1,25 et marges 20 px +10 % par bord. Le fit inclut la profondeur des huit coins et ajuste les plans near/far. Les entrées invalides ou numériquement non représentables retournent null. Aucun renderer, RAF, DOM ou état HA n’est utilisé.

Les sept tests projettent réellement les huit coins avec `THREE.PerspectiveCamera` : 5 boîtes (dont haute, excentrée, ponctuelle et très grande), 5 azimuts, 2 facteurs de distance et 4 viewports, soit **200 poses**. Ils vérifient les marges NDC et le clipping, puis les bornes, translations, resize et entrées invalides.

Validation intégrée UX05/UX06 : **681 tests Jest / 45 suites**, **23 tests d’outillage**, TypeScript, lint et format passent. Le smoke public isolé passe à 320/430/768/1440 px, avec sélection/focus P03/P04/M00, commandes démo et fixture HA fermée ; zéro service physique, zéro requête externe, plan développeur inchangé. Les dix avertissements d’ordre d’import dans les deux fichiers de tests ajoutés ont été corrigés et le lint ciblé repasse sans avertissement. La caméra visible reste inchangée ; UX07/UX08 sont nécessaires avant la maquette par défaut.


## UX07 — Cycle de vie web et repli — 2026-10-21

Home et `/house` proposent la 3D manuelle, avec les mêmes marqueurs/sélection. Le host distingue échec durable et readiness propre à chaque moteur ; la 2D reste utilisable pendant le chargement. La visibilité navigateur et le focus de route démontent le renderer, le scroll hors champ suspend seulement les frames. Les échecs survivent aux changements d’étage, de vue, de largeur et au retour navigateur. Seul Retry relance dans le même scope. Le build Trial conserve sa porte 3D fermée.

Recette Chrome headless sur export public sample (`.local/ux07/report.json`) : Home 3D → 2D → 3D → House 3D → Home, document caché puis visible, scroll hors champ, perte réelle de contexte WebGL, changement d’étage, 2D/3D, resize, détail de connexion → Back et Retry passent. **6 renderers créés, 5 disposés avant la capture finale, pic de 1 vivant** ; le dernier est détruit à la fermeture du navigateur. Le DOM de l’ancien moteur confirme disposal des contrôles, déconnexion de l’observer, zéro listener et aucun RAF en attente. Les compteurs restent stables pendant les pauses cachée/hors viewport.

Une seconde page force WebGL indisponible : repli 2D, sélection des pièces et cycle **simulé** On/Off restent utilisables. Zéro erreur de page/console et zéro requête externe dans le parcours principal. Aucune connexion au HA du foyer ni service physique. Les 62 tests ciblés (6 suites) couvrent les hosts, scope/attempt, Home, House et la restriction Trial ; type/lint/format passent. Les mesures GPU du Mac et l’acceptation native restent distinctes : aucun défaut 3D activé dans ce lot.

## UX08 — Caméra maquette desktop — 2026-10-21

La caméra maquette est intégrée à Home et au plan complet sur web ≥1024 CSS px.
`auto` choisit la 3D à cette largeur, la 2D sur compact/natif. Les choix explicites
2D/3D survivent aux breakpoints et le repli durable UX07 reste prioritaire. Le
mobile explicite 3D garde orbit ; les APK Trial conservent leur porte 3D fermée.

Un contrôleur unique applique le fit UX06 : élévation fixe, azimut 35° ±40°,
distance 1–1,25, pan interdit, clavier Gauche/Droite par pas de 5°, roue/pinch
bornés. Pièce → transition 220 ms ; Échap ou vide → étage entier et orientation
initiale. Resize et geste manuel interrompent/recalculent la transition. Reduced
motion applique directement la pose. Les RAF cessent après convergence. Le
conteneur est nommé, tabulable quand prêt et possède un contour de focus visible.

Chrome **155.0.8059.85 visible**, Mac **Apple M4 / ANGLE Metal**, viewport
1440×1000, DPR 2, canvas Home 734×260 : plan sample puis plan privé local, **deux
marqueurs de démo** sur chaque premier étage. Export local déjà préparé, cache
réutilisé, contexte de test neuf ; ces délais sont ceux de l’ouverture de la vue,
pas du téléchargement à froid de toute l’application.

| Plan | Clic → vue prête, 3 ouvertures | FPS, 3 interactions de 10 s | Médiane |
| --- | --- | --- | --- |
| Sample | 108 / 163 / 166 ms | 57,3 / 58,3 / 57,8 | 57,8 |
| Privé local | 376 / 97 / 98 ms | 55,1 / 57,8 / 55,1 | 55,1 |

Les deux budgets (≤3 s / ≥30 FPS médianes) passent. Zéro frame supplémentaire
pendant 2 s au repos. Le gestionnaire de visibilité est exercé par événement
`visibilitychange` avec propriété `document.hidden` contrôlée : renderer détruit,
aucune frame pendant 2 s, recréation au retour. **Ce point est une injection de
visibilité**, pas une mesure de masquage naturel d’onglet : Playwright maintient
le focus de ses pages. Les timings et FPS, eux, viennent du vrai GPU en fenêtre
visible. Le test UX07 vérifie séparément route inactive et scroll hors champ.

430/1024/1280/1440 : bornes yaw/zoom, overview même déjà désélectionné, pièce,
resize pendant transition, choix explicite, caméra compacte et reduced motion
passent. Le vrai zoom Chrome **200 %** est sélectionné dans Appearance d’un
profil de test : largeur CSS 1440→720, DPR 2→4, disposition compacte et zéro
débordement ; retour à 100 % ensuite. Aucun zoom CSS n’est présenté comme cette
preuve. Rapports/captures dans `.local/ux08/` ; géométrie privée injectée seulement
dans le profil démo jetable, jamais dans le bundle public. Zéro service physique,
zéro requête externe, zéro erreur de page/console dans la recette GPU finale.

Tests de contrôleur : transitions terminées, retargeting, annulation manuelle,
resize conservant yaw/zoom, overview réinitialisant, bornes et reduced motion.
La régression Home vérifie sélection + choix explicite lors des breakpoints.
L’acceptation native et la semaine d’usage appartiennent à UX09.

### Checkpoint final et relais — 22 octobre 2026

Le code UX08 est commité en **`e52ac06`**. Vérifications locales finales : **692
Jest / 47 suites**, **23 tests d’outillage**, TypeScript/lint/format passent.
Le smoke public sur cette source propre passe à 320/430/768/1440, avec fixture
HA navigateur, contrôle de dépendances du bundle web, zéro requête externe et
zéro service physique ; le plan développeur est inchangé. La recette sélectionne
explicitement 2D pour ses parcours SVG, y compris après son reload de persistance.
L’audit frais passe **avec les trois exceptions existantes**, expiration inchangée
au 2 novembre. La recette UX07 sur le défaut 3D final mesure un pic de 1 renderer
vivant (7 créations, 6 destructions avant fermeture), fallback/retry/sélection et
cycle simulé utilisables.

**Trial 1010 est construit, pas installé/accepté dans cette passe.** Source propre
`e52ac067242959a89b5321cfae7b57b8eba7b8a3`, plan sample, arm64,
3D désactivée, power default-denied après enrollment explicite. Le builder a
vérifié release non debuggable, bundle embarqué, absence du dev launcher et backup
désactivé. APK SHA-256 :
`007c552b9f854ae5defc8df9ced9c6ff20d65cdeb66cd7f29cbdc7e7a8832fb4`.
Le préflight Seeker Android 16/Trial 1007 a retrouvé une session HA ready, sans
service physique. Le manifeste/baseline sont locaux ; la recette restante passe
à [l’agent A](../handoff/parallel/A-validation.md). Le [nouveau backlog parallèle](../handoff/parallel/README.md)
distingue cette recette, le panneau de détail et l’auth web. Aucun push, nouvelle
CI distante, nouvelle écoute TalkBack ni sept jours d’usage ne sont attestés ici.
