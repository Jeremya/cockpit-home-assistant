# A02 — Recette 3D web reproductible — 2026-10-22

Les preuves navigateur UX07/UX08 dépendaient de scripts ignorés (`.local/ux07`,
`.local/ux08`) et d'un chemin de revue local. `npm run check:spatial-ui` les
remplace par un runner versionné qui fonctionne sur un clone propre après
`npm ci`, sans `.local`, plan privé, token, profil Chrome ou chemin `/tmp`
préexistant. **Aucun fichier produit n'est modifié** : moteur, caméra, hosts,
sélection Home, préférences et façade de commandes sont inchangés.

Base : `0733657` (code identique à `e52ac06`), branche `work/acceptance`.
Node 24.11.1, Playwright 1.64.1.

## Commandes

```sh
npm ci --include=dev
npx --no-install playwright install chromium
npm run check:spatial-ui                       # headless, fonctionnel (CI)
npm run check:spatial-ui -- --headed --performance  # Chrome local, GPU réel
```

Le runner applique la même provenance que `check:ui` : copie allowlistée de la
source (dotfiles et plan généré exclus), `npm ci` isolé avec le correctif R01,
export web **sample** avec source maps, double contrôle de provenance, garde de
dépendances runtime, preview loopback. Chaque contexte navigateur rejette toute
requête HTTP/WebSocket hors de cette origine. Workspace, cache, profil zoom,
navigateurs et serveur sont fermés/supprimés en `finally`, y compris sur SIGINT.
Le plan développeur et `git status` du checkout sont comparés avant/après.

Les deux marqueurs de démo (lampe, porte d'entrée) sont posés sur l'étage 1 en
écrivant le fichier de préférences schéma 3 d'un contexte isolé, une seule fois,
avant un reload ; la démo est reconnectée puis **le plan sample, les deux pièces
et exactement ces deux marqueurs** sont vérifiés via `sceneProbe` avant toute
mesure. Aucune API de test n'est ajoutée au produit.

## Couverture headless

| Étape             | Vérifié                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Défaut            | 3D maquette à 1440 et 1024 ; 2D à 1023 (disclosure compacte) ; retour 3D à 1440                                                              |
| Clavier/bornes    | Flèches hors scène sans effet ; yaw −5°/75°, zoom 1–1,25 ; Échap remet 35° et zoom 1 ; contour dans le canvas à 1024/1280/1440               |
| Sélection         | Pièce non liée sélectionnée (`Room not linked`) ; resize conserve yaw/zoom/pièce ; Échap désélectionne ; tap vide remet l'overview           |
| Reduced motion    | Contrôle : la transition anime sans préférence ; avec `reduce`, aucune frame animée                                                          |
| Marqueur → détail | Clic sur le marqueur projeté → détail, renderer libéré, retour → même scène                                                                  |
| Route inactive    | Plan complet en 3D par défaut, retour Home, jamais deux renderers vivants                                                                    |
| Hors viewport     | Scroll : frames suspendues **même pendant un resize**, renderer conservé ; retour visible → nouvelles frames                                 |
| Visibilité        | **Injectée** (`document.hidden` + `visibilitychange`) : renderer détruit, compteurs figés, recréé ; ce n'est pas un onglet réellement masqué |
| Choix explicite   | 2D conservée à 1023/1440 ; 3D explicite à 430 en orbit, puis maquette à 1440                                                                 |
| Perte de contexte | `WEBGL_lose_context` réel ; l'échec survit à étage/vue/largeur/route ; seul Retry recrée                                                     |
| WebGL absent      | Repli durable avec message, sélection de pièce, Retry qui échoue fermé, cycle **simulé** On/Off, zéro renderer créé                          |

Console : toute `pageerror`, erreur ou avertissement inconnu fait échouer.
Seuls deux messages Three.js sont tolérés **pendant** la perte de contexte
provoquée ; hors de cette fenêtre ils échouent. Les avis de performance du
driver GL Chromium (lectures SwiftShader) sont comptés à part, pas masqués.

## Résultats

| Exécution                                         | Navigateur / WebGL                           | Résultat                                                                                                                              |
| ------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| macOS, headless ×3 consécutives + finale          | Chromium 156.0.8078.4 / SwiftShader          | passed, ~30 s chacune ; 10 créations, 9 destructions, **pic 1** ; 0 requête externe, 0 erreur ; 2 messages provoqués, 3–4 avis driver |
| Linux arm64, conteneur `playwright:v1.64.1-noble` | Chromium 156 / SwiftShader                   | séquence du job CI (`npm ci`, `check:public-inputs`, `check:spatial-ui`) passed ; aucun fichier suivi modifié                         |
| macOS, `--headed --performance`                   | Chrome 155.0.8059.85 / ANGLE Metal, Apple M4 | suite fonctionnelle + budget passed                                                                                                   |

Mesure GPU (plan sample, deux marqueurs, viewport Playwright 1440×1000 DPR 2,
canvas 734×260) : clic → vue prête **48 / 38 / 39 ms** (renderer 19 / 16 / 17 ms),
interaction 3×10 s **60 / 58,7 / 58,1 FPS, médiane 58,7**, **0 frame** en 2 s de
repos. Budgets : ouverture ≤3 s, médiane ≥30 FPS, GPU non logiciel. Zoom
**200 % réel de Chrome** (préférence `default_zoom_level` d'un profil jetable,
jamais `style.zoom`) : CSS 1440→720, DPR 2→4, Home compacte, 3D orbit, zéro
débordement. Ce budget n'est pas un critère de CI ; la CI n'a qu'un WebGL
logiciel.

Captures publiques bornées (≤10 MiB, liste fermée) dans `artifacts/spatial-ui/` :
`home-3d-1440.png`, `fallback-1440.png`, et en mode performance
`performance-1440.png`, `zoom200.png`. La capture page de Playwright rogne une
fenêtre zoomée au quart supérieur gauche (l'ancienne `.local/ux08/zoom200.png`
en souffre ; ses mesures restent valides) : `zoom200.png` passe donc par CDP
`Page.captureScreenshot`.

## Échecs intentionnels et nettoyage

Mutations temporaires non commitées, restaurées et vérifiées par `cmp` :

- pièce attendue fausse → `failed`, étape `selection`, `failure.png` produite ;
- compteur `peakLive` exigé à 0 → `failed`, étape `inactive-route` ;
- SIGINT pendant la phase navigateur → exit 1, `interrupted: true`, rapport
  écrit, 0 navigateur et 0 workspace restants.

Deux défauts du runner ont été trouvés ainsi et corrigés avant commit : le
contexte était fermé avant la capture d'échec, et le handler SIGINT de
Playwright appelait `exit(130)` avant le nettoyage (désactivé via
`handleSIGINT/SIGTERM/SIGHUP: false`). Les chemins source, temporaire et home
sont masqués dans `failure`.

**Constat hors périmètre :** `check:ui` a le même défaut d'interruption,
reproduit : SIGINT pendant la phase navigateur → exit 130, workspace
`maurice-public-ui-*` laissé dans le répertoire temporaire, aucun rapport. La
documentation « Interruption closes the browser and cancels an active build »
reste vraie pour le navigateur et le build, pas pour le nettoyage. Correctif
borné proposé (A, fichier épinglé, revue d'audit) : mêmes options de signaux. **Corrigé le 22 octobre** : SIGINT en phase navigateur → exit 1, workspace supprimé, rapport écrit.

## Outillage, CI et audit

`scripts/lib/spatial-ui.mjs` porte les helpers purs ; 5 tests Node couvrent
options, injection de placements (sample/schéma 3 obligatoires), classification
console, budget de performance et compteurs. `test:tooling` passe **28/28**.
Typecheck, lint, format et **Jest 692 / 47 suites** passent (inchangés).

`package.json` gagne `check:spatial-ui` ; `public-checks.yml` gagne un job
**Public 3D web lifecycle (headless)** qui téléverse seulement le rapport et
trois captures nommées pendant 7 jours. L'audit frais a reproduit
`reviewed_inputs_changed` sur ces deux fichiers épinglés, avec les mêmes
**56 entrées / 3 advisories** (braces, node-forge, sprintf-js) et versions
amont inchangées. Les empreintes sont mises à jour et le runner + sa lib sont
ajoutés aux fichiers revus ; `check:audit` repasse `passed-with-exceptions`,
expiration **2026-11-02 inchangée**. Ce n'est pas un audit strict.

## Intégration du panneau de détail (B01–B04)

Après fusion de `work/detail-panel`, l’étape `marker-detail` reflète le
contrat de B :

- à 1440 px, le marqueur ouvre le détail **dans le panneau** ; Home et sa scène
  restent (même renderer, `live == 1`) ;
- Escape depuis le titre du panneau, puis le bouton **Close details**, ramènent
  à Home ; le focus revient à « Around your home » ;
- à 1024 px, le détail reste une route complète qui libère le renderer.

Les positions des marqueurs sont relues une fois la taille du canvas stable.

Après la fusion, deux effets du nouvel espace de travail ont été mesurés :

- Home calcule sa disposition en deux passes (largeur mesurée). Le contrôle du
  contour attend donc la convergence du cadrage, et le runner laisse l’espace de
  travail se re-mesurer après chaque redimensionnement.
- Franchir le seuil du panneau remontait `HomeScreen` : l’état local était perdu
  et le parcours créait 17 renderers au lieu de 10, avec un pic toujours à 1.
  **B l’a corrigé** (`d7ac3fc`) : un seul Home pour les deux présentations, et
  un panneau seulement à partir de 1224 px. Sur l’arbre intégré (`d7ac3fc` +
  correctif Settings), le même parcours revient à **10 créations, pic 1**.

Résultat sur l’arbre intégré : 3/3 avant le correctif de B, puis 2/2 après.

## Limites

- Le job GitHub n'a **pas** tourné : aucun push. La parité Linux est prouvée en
  conteneur arm64, pas sur le runner x86_64 Ubuntu 24.04.
- Headless = WebGL SwiftShader : fonctionnel, pas une preuve GPU. Le budget GPU
  n'est prouvé que sur ce Mac M4 en Chrome visible, plan sample.
- La mesure du plan privé (55,1 FPS, UX08) reste locale ; aucun mode privé n'est
  ajouté au runner.
- Visibilité injectée, pas masquage naturel d'onglet. Pas de preuve native, ni
  Android, ni TalkBack.
- Les futures modifications de B (panneau) et C (auth) devront repasser ce
  runner ; ce résultat ne les certifie pas.

## Reprise

Après chaque intégration touchant Home, le plan, les routes ou le layout :
`npm run check:spatial-ui`. Avant une recette 3D sur Mac : ajouter
`-- --headed --performance` (Chrome installé, fenêtre visible ~1–2 min). Si un
libellé change (`3D view`, `Select … on plan`, `Retry 3D view`), adapter le
runner dans le même lot et refaire la revue d'audit de ses empreintes.
