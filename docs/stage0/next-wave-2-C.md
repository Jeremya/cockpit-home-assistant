# Vague 2 — lot C : preuve spatiale native et échecs d'assets bornés

Date : 17 novembre 2026. Agent C. Base `0f6d5fb41e1126d4e5fb82f6626458b96f0e59cb`, worktree `maurice-wave2-C`, branche `work/wave-2-C`. Commit et PR draft autorisés par le propriétaire ; aucune fusion.

## Verdict

| Mission                                                               | État                                                                                                      | Binaire                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------- |
| C1 — placements, labels, marqueur/détail/Back, cycle de vie, fallback | **Observé sur Pixel** ; Seeker non rejoué dans cette vague                                                | Candidat A `66a7f47f…` |
| C2 — Pixel 9 Pro, gate séparée                                        | **Observé** : 17 modèles, 0 repli, médiane 118,7 frames rendues/s                                         | Candidat A `66a7f47f…` |
| C3 — GLB qui ne termine pas                                           | **Reproduit puis corrigé** au niveau navigateur (runner + Jest) ; preuve native en attente du candidat A3 | Arbre de travail C     |

Deux choses distinctes, à ne pas confondre :

- **Recette Pixel réussie sur le candidat `66a7f47f` / source `0f6d5fb`.** Elle établit le rendu spatial natif du code intégré. Elle ne contient pas le correctif de délai.
- **Correctif de délai présent seulement dans la branche `work/wave-2-C`.** Il est prouvé au niveau navigateur et Jest. Aucune preuve native tant qu'un candidat ne l'intègre pas (section « Candidat suivant »).

## C3 — chargement d'asset bloqué

### Reproduction avant correctif

Nouvelle étape `stalled-asset` de `npm run check:spatial-ui` : après la préparation de la fixture, Playwright retient au niveau réseau la requête `loungeSofa*.glb` du serveur d'aperçu local. La requête reste ouverte et ne reçoit aucune réponse ; les autres assets passent normalement.

Résultat sur le code intégré `0f6d5fb`, chromium headless :

- Le canapé reste un volume de repli (16 modèles + 1 repli), sans erreur console.
- Après 17 s d'attente puis un aller-retour d'étage qui reconstruit la scène, il **reste un repli** : le cache garde la promesse pendante, donc aucun nouvel essai n'est possible tant que la page vit (`A later scene build must load the asset that timed out`, attendu `{models:17,fallbacks:0}`, reçu `{models:16,fallbacks:1}`).
- La partie « succès tardif » passait déjà : une réponse libérée après un changement d'étage puis une sortie de la scène n'atterrit pas sur l'étage 2 et est réutilisée au retour sur l'étage 1, sans nouvelle requête.

Le constat P2 de la revue est donc confirmé.

### Correctif

`src/web/assetBytes.ts` uniquement :

- `ASSET_READ_TIMEOUT_MS = 15_000` ; à la borne, la lecture est rejetée (`Asset unavailable`) puis le XHR est annulé.
- Règlement unique (`settled`) : erreur, abandon, borne ou réponse ; une réponse arrivée après la borne est ignorée ; le minuteur est libéré dès la réponse.
- Transport XHR et chemin `file://` inchangés, aucun `fetch`.

Rien d'autre n'est modifié. `loadFurnitureAsset` libérait déjà l'entrée de cache en cas de rejet ; la borne suffit pour qu'une reconstruction de scène ultérieure (changement d'étage, retour sur l'écran, nouvelle page) redemande l'asset. Il n'y a ni boucle de réessai ni second cache. Les gardes `isDisposed()` et `group.parent !== host.content` restent celles qui empêchent un résultat tardif d'atterrir dans une scène détruite ou un autre étage.

### Preuves après correctif

- `npm run check:spatial-ui` (headless SwiftShader, Chromium 156.0.8078.4) : **passed** sur arbre propre ; `checkoutUnchanged: true`, `externalRequests: 0`, aucune erreur console inattendue, un seul renderer vivant.
  - `stalledAsset` : repli visible pendant le blocage ; aucune deuxième requête pendant 17 s (borne + 2 s) ; exactement une nouvelle requête au premier aller-retour d'étage, qui charge le modèle (17/0) ; la réponse libérée ensuite ne change rien.
  - Succès tardif après changement d'étage et destruction de scène : ignoré, puis réutilisé.
- Jest : `assetBytes.test.ts` (+3 tests : borne et abort, réponse tardive ignorée, minuteur libéré) et nouveau `furnitureLoading.test.ts` (4 tests : déduplication, échec libéré sans réessai automatique, résultat tardif refusé dans une scène détruite, puis après un changement d'étage avec réutilisation). Les deux tests de borne échouaient avant le correctif.
- Suite complète : **86 suites, 1 160 tests passent** ; `tsc --noEmit`, ESLint et Prettier propres ; `npm run test:tooling` 41/41. Le test de découverte de A exige que la nouvelle suite soit suivie par Git : elle est marquée `git add -N` (intention, pas de commit).

### Limites C3

- **15 s est un paramètre technique proposé** (`ASSET_READ_TIMEOUT_MS`), pas une valeur produit approuvée. Il est aligné sur le délai global caméra ; un asset local du bundle se lit normalement en quelques millisecondes. Il reste ajustable sans changement de comportement visible : le repli reste affiché dans tous les cas.
- Le blocage a été reproduit **uniquement sur HTTP** (serveur d'aperçu local + Playwright). Il n'a pas été reproduit sur `file://` dans l'APK, et une lecture `file://` de l'APK ne peut pas être retenue de la même façon. Sur le téléphone, on ne pourra vérifier que la **non-régression** du chargement natif, pas la borne elle-même.

## C1/C2 — Pixel 9 Pro sur le candidat A

### Binaire et appareil

- APK : `com.larrabee.homecockpit.s02proof` 0.1.0 (1), SHA-256 `66a7f47f75e065d5c44929cc0e21ddc69bc022006312de3f437f1bd5df80580d`, construit par A depuis `0f6d5fb` (git archive propre, sample public, 3D actif, signature de preuve). Haché installé vérifié par `pm path --user 0` + `sha256sum`, avant et après l'incident ci-dessous.
- Pixel 9 Pro, Android 17 (`CP3A.261005.005`), WebView 157.0.8103.50, GPU Mali-G715, affichage 120 Hz, rendu 960×2142 à 2,25 dppx. Aucun paquet Maurice n'était présent avant l'installation de A : pas de profil personnel ni de Trial sur ce téléphone.
- Toutes les commandes ont visé ce seul téléphone, avec `--user 0` (un second profil utilisateur bloque les commandes sans utilisateur).
- Hors Metro : bundle DOM servi depuis `file:///android_asset/www.bundle/`.

**Incident** : une première installation de A, bloquée depuis le mode veille, s'est validée à 09:54:59 (heure du téléphone) quand le téléphone a été déverrouillé. Le paquet a été remis à jour en place pendant ma vérification de la perte de contexte et le processus a été tué. Même APK, données conservées, placements intacts. Les étapes terminées avant (marqueur, interactions) restent valides. La perte de contexte et la mesure ont été rejouées après.

### Parcours (profil démo, sample public)

| Vérification              | Résultat                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Placements via le produit | Plan → Place device → recherche → « Place Living room lamp » → pièce Living room → toucher sur le plan → Save position ; idem « Front door » → Kitchen. Les deux sont listés « Placed on this floor » |
| Persistance               | Placements présents après la réinstallation en place et un redémarrage à froid                                                                                                                        |
| Meubles                   | `furniture {models: 17, fallbacks: 0}` à l'ouverture 3D, après Back, après reprise et après Retry                                                                                                     |
| Labels                    | 2/2 dessinés (lamp, front door), dans un canevas de 374×380 CSS px                                                                                                                                    |
| Marqueur → détail → Back  | Toucher réel sur la projection du marqueur lampe → écran « Device » Living room lamp (TP-Link · HS103, observation simulée) → Back système → même plan 3D, 2 marqueurs, 17 modèles, sélection nulle   |
| Sélection                 | Toucher sur la cuisine → `sample-1-1`                                                                                                                                                                 |
| Changement d'étage        | Floor 2 : pièces `sample-2-*`, sélection effacée, 0 marqueur ; Floor 1 : 2 marqueurs                                                                                                                  |
| Arrière-plan/reprise      | Home puis relance : 0 frame cachée, 0 frame au repos sur 3 s                                                                                                                                          |
| Perte de contexte         | `WEBGL_lose_context` réel → « 3D view unavailable », plan 2D avec les deux marqueurs et noms de pièces → « Retry 3D view » → 3D prête en 323 ms, 17 modèles, 2 labels                                 |

### Mesures pendant l'interaction

Protocole : écran Plan, vue 3D (orbit), Floor 1. Sept balayages horizontaux `input swipe` de 5 s, en alternant le sens. Avant chaque balayage, `dumpsys gfxinfo <pkg> reset`, puis lecture. Téléphone en charge, batterie 37,3 → 38,2 °C. Trois sources sont séparées :

| Dimension                     | Source                                                                    | Résultat                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frames rendues par la scène   | sonde `interaction` (requestAnimationFrame de la scène)                   | médiane **118,7/s** ; distribution 102,4 / 118,7 / 118,7 / 118,7 / 118,9 / 119,5 / 119,5 ; p95 intervalle 8,4 ms (16,7 ms sur le premier balayage) |
| Fluidité observée par Android | `gfxinfo` du processus                                                    | 4 052 frames, **2 janky** (1 au premier balayage) ; temps de frame p50 7 ms, p90 8–9 ms, p99 ≤ 10 ms ; 1 vsync manqué                              |
| Temps GPU                     | `gfxinfo` (GPU du thread de rendu de l'app, composition WebView comprise) | p50 1 ms, p99 ≤ 4 ms                                                                                                                               |
| Temps GPU WebGL de la scène   | `EXT_disjoint_timer_query_webgl2`                                         | **non mesurable** : extension absente dans cette WebView                                                                                           |

La scène fait 130 appels de dessin et 14 730 triangles, avec 64 géométries et 12 textures. La cible M04 de ≥ 30 fps est tenue sur ce téléphone et ce binaire pour des gestes courts. Ce n'est ni une mesure thermique soutenue ni un temps GPU isolé de WebGL.

### Seeker

Non manipulé dans cette vague : B l'utilise. Le checkpoint du lot précédent (Seeker, 17 modèles, médiane 119,4 fps sur l'APK C `b8467632…` construit depuis `ebce4f0` + correctif) reste un repère distinct, pas une preuve du candidat A ni du correctif C3.

## Observations nouvelles — tâches séparées

Consignées pour le coordinateur, non traitées dans cette vague :

- **T-C1 (B, accessibilité) :** sur le Pixel, « Place device » (écran Plan) et « Retry 3D view » (après perte de contexte) se trouvent sous la barre d'onglets tant qu'on ne fait pas défiler. Un toucher à cet endroit atteint la barre. Le défilement les rend accessibles ; à classer comme pli ou défaut selon la grille de B2. Transmis à B par A.
- **T-C2 (produit) :** après un redémarrage à froid du processus, l'app revient à l'accueil (« Explore demo home ») plutôt qu'à la démo active. Les données du profil démo sont conservées. Comportement existant, signalé sans jugement produit.
- **T-C3 (mesure) :** campagne thermique soutenue et temps GPU WebGL isolé (`EXT_disjoint_timer_query_webgl2` absent). Non lancée dans cette vague, sur consigne.
- **T-C4 (outillage) :** un `adb install` sans `--user 0` reste en attente côté Pixel et peut se valider plus tard, au déverrouillage. Il faut une procédure d'abandon de session d'installation dans les helpers de A.

## Gates restantes

1. ~~Candidat suivant intégrant le correctif, Pixel puis Seeker~~ : fait sur `adcdd1da` / `948e642` (section ci-dessus), en non-régression native.
2. La borne de 15 s n'est prouvée qu'en HTTP (runner) et en Jest ; aucune preuve native du blocage n'est possible sur `file://`.
3. Fusion dans `main` : non autorisée à ce stade ; un nouvel APK construit après fusion devra être rejoué s'il diffère de `948e642`.
4. Acceptation de la maison personnelle : privée et distincte du sample, non faite ici (OQ-03).

## Candidat suivant

Candidat A `candidate/wave2-1` : source `948e642b4b566244a4a6ea240a300bcbf7494d1a` = `0f6d5fb` + #1 `41b506b` + #2 `816d444` + #3 `9fcf6e8` + #4 (ce lot) `3cff2ba` + #5 `f8b0144`. APK `com.larrabee.homecockpit.s02proof` 0.1.0 (1), SHA-256 `adcdd1da50650303d194f15f13b6ee583836684feb331e44d600d12dd751f83e`, installé par A en mise à jour en place ; haché installé vérifié avant la recette. Campagne locale de A sur ce SHA : 17/17, dont `check:spatial-ui` et Jest 88/1 172.

Portée : **non-régression native** du chargement avec la borne. Le blocage HTTP de C3 n'est pas reproductible sur le `file://` de l'APK et n'est donc pas prouvé sur téléphone.

### Pixel 9 Pro, 17 novembre, 16:48–16:52 UTC

Même appareil, même WebView et même pilote que la recette précédente. Profil démo et ses deux placements conservés par la mise à jour en place.

| Vérification             | Résultat                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ouverture Plan → 3D      | 17 modèles, 0 repli ; 2 labels ; 2 marqueurs ; prête en 711 ms                                                                                                                           |
| Marqueur → détail → Back | Toucher réel sur la lampe → écran « Device » Living room lamp → Back système → même scène, 17/0, 2 marqueurs, sélection nulle                                                            |
| Sélection et étages      | Cuisine sélectionnée au toucher ; Floor 2 efface la sélection (0 marqueur) ; Floor 1 : 2 marqueurs                                                                                       |
| Reprise                  | Home puis relance : 0 frame cachée, 0 frame au repos sur 3 s, 17/0                                                                                                                       |
| Fallback                 | Perte de contexte réelle → « 3D view unavailable » ; reste indisponible après les onglets 2D/3D (pas de réessai automatique) → Retry → 3D en 443 ms, 17/0                                |
| Mesure courte            | 5 balayages de 5 s : médiane 117,8 frames rendues/s (102,5 → 118,7) ; gfxinfo 0 janky sur 2 854, p90 9 ms, p99 ≤ 10 ms ; GPU HWUI p99 ≤ 3 ms ; timer WebGL indisponible ; 36,0 → 35,7 °C |
| Journaux                 | 0 `FATAL` dans logcat                                                                                                                                                                    |

### Seeker, 17 novembre, 17:00–17:06 UTC

Android 16, WebView 157.0.8103.38, Mali-G615 MC2, 1200×2670 à 3 dppx. Même APK `adcdd1da…`, haché installé vérifié. Trial 1012 installé et non touché ; le profil de preuve n'avait plus de placements (fixture de B oubliée).

| Vérification              | Résultat                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Placements via le produit | Recréés par Plan → Place device : lampe → Living room, porte d'entrée → Kitchen, profil démo du paquet de preuve uniquement                                                                                                     |
| Ouverture Plan → 3D       | 17 modèles, 0 repli ; 2 labels ; 2 marqueurs ; prête en 866 ms                                                                                                                                                                  |
| Marqueur → détail → Back  | Écran « Device » de la lampe → Back → même scène, 17/0, 2 marqueurs, sélection nulle                                                                                                                                            |
| Sélection et étages       | Cuisine au toucher ; Floor 2 efface la sélection (0 marqueur) ; Floor 1 : 2 marqueurs                                                                                                                                           |
| Reprise                   | 0 frame cachée, 0 frame au repos, 17/0                                                                                                                                                                                          |
| Fallback                  | Perte de contexte → « 3D view unavailable », stable après les onglets 2D/3D → Retry → 3D en 720 ms, 17/0                                                                                                                        |
| Mesure courte             | 5 balayages de 5 s : médiane 119,0 frames rendues/s (118,6 → 119,5) ; gfxinfo 1 janky sur 5 952 ; durée de frame p50 11 ms, p90 13 ms, p99 ≤ 18 ms ; GPU HWUI p50 5 ms, p99 ≤ 10 ms ; timer WebGL indisponible ; 32,0 °C stable |
| Journaux                  | 0 `FATAL`                                                                                                                                                                                                                       |

Les durées `gfxinfo` mesurent le temps de production d'une frame, pas l'intervalle entre frames. Sur le Seeker, elles dépassent 8,3 ms sans frame perdue côté scène (119 frames rendues/s, 1 janky). Les preuves Pixel et Seeker restent séparées : appareils, écrans et WebView diffèrent.

## Fichiers modifiés

- `src/web/assetBytes.ts` — borne, abort, règlement unique.
- `src/web/__tests__/assetBytes.test.ts` — trois tests de lecture bloquée.
- `src/web/__tests__/furnitureLoading.test.ts` — nouveau, cache et gardes de scène.
- `scripts/check-spatial-ui.mjs` — `holdAsset()` et étape `stalled-asset`.
- `docs/stage0/next-wave-2-C.md` — ce rapport.

Les preuves locales (rapports JSON du runner avant/après et captures natives) sont dans le scratchpad de la session et ne sont pas versionnées. Les captures Pixel montrent la barre d'état du téléphone : ne pas les publier sans recadrage.
