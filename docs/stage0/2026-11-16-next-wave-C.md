# Vague du 16 novembre — lot C : rendu spatial — 2026-11-16

Agent C, mandat [`docs/handoff/parallel/2026-11-16-next-wave.md`](../handoff/parallel/2026-11-16-next-wave.md) §C.
Base `ebce4f06f730b6311a24634d40e7afc314fedf92`, worktree isolé `../maurice-next-C`
(branche `work/next-wave-C`, hors de l'arbre parcouru par Jest), `npm ci` propre.
Node 24.11.1, Playwright 1.64.1. Rien n'est commité ni poussé.

## Verdict

- **Défaut natif reproduit et corrigé.** Dans l'APK autonome, **aucun meuble GLB ne se chargeait** :
  la scène montrait seulement les volumes de repli. `GLTFLoader.load()` passe par `fetch()`, que
  la WebView Android refuse sur le bundle embarqué `file:///android_asset/www.bundle/`. Le
  correctif lit les octets par `XMLHttpRequest` et les donne à `GLTFLoader.parse()`. Sur
  le Seeker : **17 modèles / 0 repli** après correctif, contre des volumes de repli seulement avant.
- **Coût GPU de la scène meublée sur le Seeker :** médiane **119,4 fps** sur 7 orbites natives de
  5 s, 0 frame au repos. La cible M04 (≥30 fps) est tenue **sur ce téléphone et ce binaire**.
- **Web :** runner spatial vert. Il couvre maintenant les petites largeurs en 3D, le changement
  d'étage avec un renderer actif, la parité des pièces 2D/3D et les meubles réellement chargés.
  Aucun défaut web reproduit.
- **Gates encore ouvertes :** Pixel 9 Pro non branché, donc S02/M04 Pixel restent ouvertes.
  Marqueur → détail → Back natif non rejoué sur le binaire corrigé. Aucune recette TalkBack ni
  candidat de release.

Niveau atteint : **Implemented + Automated** (Jest et runner web) et **Installed + exercé** sur le
Seeker, dans un paquet de preuve isolé. Ce n'est pas un candidat accepté ; la 3D reste désactivée
dans Trial (`build.ts`), sans changement.

## Contradiction à réconcilier (coordinateur)

ADR-17 (§P1) et OQ-09 affirment qu'un APK construit le 28 octobre « contained all 23 and rendered
the furnished sample offline on the Seeker ». La première affirmation est vraie : l'APK de ce lot
contient les 23 GLB sous `assets/www.bundle/assets/assets/furniture/`. La seconde est **contredite
à `ebce4f0`** : le bundle DOM demande l'URL relative `assets/assets/furniture/<nom>.<md5>.glb`.
Résolue sous `file:///android_asset/www.bundle/`, elle échoue avec `fetch` (« TypeError: Failed
to fetch ») et réussit avec XHR (statut 200, 7 576 octets pour `pottedPlant`). La capture du
binaire non corrigé montre des boîtes à la place des modèles.

Je ne sais pas ce que l'observation d'octobre a vu exactement : des volumes de repli pris pour
des meubles, ou une autre WebView. Le rapport ne réécrit pas l'ADR. Le coordinateur décide
de l'annotation de l'ADR-17 et de l'OQ-09.

## Correctif (périmètre C : `src/web/`)

| Fichier | Changement |
| --- | --- |
| `src/web/assetBytes.ts` (nouveau) | `readAssetBytes(url)` : XHR `arraybuffer`. Accepte 2xx, ou statut 0 avec un corps non vide (lecteurs `file://`) ; rejette sur erreur, statut non 2xx ou corps vide |
| `src/web/furnitureScene.ts` | `loadFurnitureAsset` = `readAssetBytes` puis `GLTFLoader.parse(bytes, extractUrlBase(url))`. Le cache et le retry restent inchangés. Chaque meuble est marqué `userData.furniture = "fallback"`, puis `"model"` une fois remplacé. `furnitureState(content)` les compte |
| `src/web/CockpitScene.tsx` | La sonde en lecture seule expose `furniture: { models, fallbacks }` |
| `src/web/__tests__/assetBytes.test.ts`, `furnitureState.test.ts` (nouveaux) | Transport sans `fetch`, statut 0 avec corps, échec fermé ; comptage modèles/replis |

Un seul transport sert le web et Android. Ne changent pas : géométrie persistée, catalogue,
échelles, matériaux, `MODEL_FILL`, caméra, permissions et gates de build.

## Runner spatial (`scripts/check-spatial-ui.mjs`, `scripts/lib/spatial-ui.mjs`)

Ajouts, sans refaire le cadrage existant :

| Étape | Vérifié |
| --- | --- |
| `default-view` | Les meubles finissent tous en modèles (`fallbacks: 0`, 17 modèles sur l'étage 1 du sample) |
| `compact-widths` (nouvelle) | Le choix explicite de la 3D survit au retour à 430×932 et 320×700. Orbite, contour d'étage dans le canvas, étiquettes visibles dans le canvas et sans chevauchement (`labelProblems`), pas de débordement horizontal, un seul renderer. Canvas 372×200 et 262×200, 2 étiquettes dessinées |
| `floor-switch` (nouvelle) | À 430 (orbite) puis 1440 (maquette) : une pièce sélectionnée, étage 2 puis étage 1. Pièces 3D égales aux ids du plan et autant que d'onglets de pièce 2D, sélection effacée, marqueurs limités à leur étage, contour dans le canvas, **0 renderer créé** par changement d'étage |

`withFixturePlacements` renvoie aussi `floors`. Tests outillage : 37/37.

## Résultats web

| Exécution | Navigateur / WebGL | Résultat |
| --- | --- | --- |
| Headless, base `ebce4f0` intacte | Chromium / SwiftShader | passed ; 0 inattendu, 2 provoqués, 4 avis driver |
| Headless, runner étendu (avant correctif) | idem | passed, nouvelles étapes vertes |
| Headless, runner étendu + correctif | idem | passed ; `furnitureModels: 17` ; 0 inattendu |
| `--headed --performance` ×3 (avant correctif) | Chrome 157.0.8103.51 / ANGLE Metal, Apple M4, écran 60 Hz | passed ×3 ; FPS 50,9/47,4/49,2 · 49,5/51,9/54,3 · 52,3/56,6/53,6 (**médiane 51,9**, min 47,4) ; ouvertures 95–132 ms ; 0 frame au repos |

Sur le web, les GLB chargeaient déjà par HTTP avant le correctif ; ces mesures GPU incluent donc
les meubles. Le passage `--headed --performance` n'a pas été rejoué après le correctif : seul le
transport change, la scène dessinée est identique. Pour mémoire, l'A02 (avant P1/P2) mesurait une
médiane de 58,7 FPS sur Chrome 155 : le coût web a augmenté d'environ 7 FPS sur M4, tout en
restant au-dessus du budget de 30.

## Preuve native — Seeker

**Appareil :** Seeker, Android 16, WebView 157.0.8103.38, GPU Mali-G615 MC2, 1200×2670 à densité 3.

**Binaires :** construits depuis le worktree C (`expo prebuild`, puis build Gradle `s02Proof` =
release, `applicationIdSuffix .s02proof`, signature debug, `EXPO_PUBLIC_S01_PROOF=1` pour
l'inspecteur). Plan sample (`COCKPIT_PLAN_FILE=src/spatial/sample-plan.json`, `sample-home` dans
le bundle), sans variante trial, donc 3D active. Bundle embarqué par `export:embed` ; aucun Metro,
`location.href` = `file:///android_asset/www.bundle/…`.

| APK | Source | Octets | SHA-256 |
| --- | --- | ---: | --- |
| base | `ebce4f0` + runner modifié (aucun fichier app modifié) | 44 746 485 | `7240f9cb20bf45b4a0d85cf61179afe54080b5c614c6daceebf54a68c7fe0917` |
| corrigé | `ebce4f0` + ce lot (arbre sale) | 44 746 757 | `b84676322fd3f6e73bcff30481791a12db4e0c87b03aa26f4374a0867d286594` |

Le hash installé (`pm path` puis `sha256sum`) correspond à l'APK dans les deux cas. Les APK et les
captures restent locaux et ignorés ; ils ne sont pas des candidats de release.

**Isolement :** le paquet `.s02proof` remplace seulement l'ancienne preuve S02 du 16 octobre.
`com.larrabee.homecockpit` et `com.larrabee.homecockpit.trial` (Trial) n'ont pas été touchés :
Trial était au premier plan au départ et y a été remis à la fin. Le profil démo de la preuve avait
été semé le 16 octobre avec un plan sans meubles, conformément au principe 8 (semis unique, aucune
migration silencieuse). Il a été réinitialisé par le chemin produit Settings → Diagnostics →
« Reset plan to default » → « RESET » ; la boîte de dialogue annonce le retrait des liens et
placements. Aucun appareil HA, jeton ou plan personnel n'est intervenu.

| Mesure | APK base (profil d'octobre, sans meubles) | APK base (après reset) | APK corrigé (après reset) |
| --- | --- | --- | --- |
| Meubles | aucun dans le plan | 17 **volumes de repli** (capture) | **17 modèles / 0 repli** (sonde + capture) |
| Renderer prêt | 772 ms | 442 ms | 455 ms |
| Orbites ADB de 5 s | 5 : 117,8 → 119,5, **médiane 118,4** | — | 7 : 118,5 → 119,9, **médiane 119,4** |
| P95 espacement de frames | 8,4 ms | — | 8,4 ms |
| Frames au repos (3 s) | 0 | — | 0 |
| Dernière frame | 18 appels / 4 398 triangles | — | 122 appels / 13 986 triangles ; 60 géométries, 10 textures |
| Canvas Home compact | 342×200 CSS px, orbite, cadrage 0,76 × 0,80 | idem | idem |
| Étiquettes | 2 dessinées (« Side door », « Fridge temperature »), lisibles, séparées (capture) | 0 marqueur après reset | 0 marqueur |

Les fps sont les frames rendues pendant le geste, divisées par sa durée, comme dans S01/S02. Ce
n'est ni un temps GPU ni un fps du compositeur Android. Il s'agit de mesures courtes et
successives, sans essai thermique ni grande maison.

**Interactions natives (APK corrigé) :** un vrai toucher ADB sur le point projeté de la cuisine
sélectionne `sample-1-1`. Les onglets natifs Floor 2 puis Floor 1 montrent les pièces de l'étage
et effacent la sélection. Home Android puis relance : renderer de nouveau prêt, 0 frame en
arrière-plan, 0 frame au repos ensuite.

**Observation, non corrigée :** sur Home compact, la scène fait 200 px de haut et sa moitié basse
passe sous la barre d'onglets tant qu'on ne fait pas défiler. C'est une question de mise en page
partagée (lot B / ADR-18), pas un défaut du rendu spatial.

## Vérifications locales sur l'arbre final

- `jest --runInBand` : **1150 tests / 83 suites passent**. Worktree hors `.claude/`, donc aucune
  contamination.
- `tsc --noEmit` ; ESLint sur `src/web` et le runner ; Prettier sur les fichiers modifiés ;
  `npm run test:tooling` 37/37.
- `npm run check:spatial-ui` (headless) passed avec le correctif.

## Non exécuté / limites

- **Pixel 9 Pro** : non branché. La gate Pixel de S02/M04 reste ouverte ; le Seeker ne la clôt pas.
- Marqueur → détail → Back natif et étiquettes natives sur le binaire **corrigé** : le reset a
  retiré les placements de la preuve, et je n'ai pas posé de nouveaux placements au placement
  editor. Les étiquettes ont été observées sur le binaire base uniquement.
- Perte de contexte WebGL native et repli 2D natif non rejoués (couverts sur web).
- Plan personnel : non chargé, conformément au principe 6. Le rendu de la vraie maison reste à
  observer par le propriétaire.
- Pas de build `export --platform android` / OTA : le résidu OQ-09 est inchangé. Le correctif ne
  dépend pas du schéma d'URL.
- La CI distante n'a pas tourné (aucun push).

## Prochain geste

1. Le coordinateur intègre le correctif après A (socle). Le transport touche le chargement web : à
   rejouer dans la campagne complète du SHA intégré.
2. Annoter l'ADR-17 (P1) et l'OQ-09 : l'APK contenait les GLB, mais ne les chargeait pas avant ce
   correctif.
3. Créneau Pixel 9 Pro : même protocole sur un APK `.s02proof` du SHA intégré. Ajouter le
   placement de deux marqueurs et le parcours marqueur → détail → Back.
4. Décision produit OQ-03 inchangée : rien ici n'active la 3D dans Trial.
