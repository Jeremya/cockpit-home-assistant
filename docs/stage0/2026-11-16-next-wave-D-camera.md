# Vague du 16 novembre — rapport D : transport caméra

Agent D, lot D de [la prochaine vague](../handoff/parallel/2026-11-16-next-wave.md). Base `ebce4f06f730b6311a24634d40e7afc314fedf92`, worktree `../maurice-next-D`, branche `work/next-wave-D`, hors de l'arbre parcouru par Jest. Rapport de travail, pas un relevé de livraison : le coordinateur réconcilie `docs/README.md`, `docs/BACKLOG.md` et les registres.

**Niveau de maturité atteint : Implemented + Automated (Node/Jest).** Rien n'a été construit, installé ni observé sur un appareil. La recette Android est prête, pas exécutée : le téléphone et les builds sont réservés au coordinateur.

## 1. Corrections existantes vérifiées avant tout changement

| Point du handoff | Constat sur `ebce4f0` | Preuve |
| --- | --- | --- |
| Délai global 15 s, limite 5 Mo, cache 24 Mo | Présents dans `src/services/cameraImage.ts` (`CAMERA_TIMEOUT_MS`, `CAMERA_MAX_BYTES`, `MAX_CACHED_CHARS`). Non modifiés | Lecture du code |
| Lecture par `arrayBuffer()`, Blob en repli | Présente (`readBodyBytes`) | Lecture + tests |
| Purge à l'oubli | `SessionManager.forget()` appelle `clearCameraCache` | Tests `SessionManager` |
| `onError` du cadre indécodable | Présent dans `CameraImageCard` | Tests `CameraImageCard` |
| Tests caméra/session | 4 suites, **189 tests** passent | `jest --runTestsByPath` sur `cameraImage`, `CameraImageCard`, `useCameraImage`, `SessionManager` |
| Preuve Node d'origine | `proof:camera` PASS, 3 exécutions | Avant modification |

Aucun bug déjà corrigé n'est rouvert.

## 2. Ce qui a changé (écriture limitée au lot D)

| Fichier | Changement |
| --- | --- |
| `scripts/camera-fixture.mjs` (nouveau) | Fixture publique de transport. Origine A façon Home Assistant (WebSocket minimal, une entité caméra par scénario, `/api/camera_proxy/…`), origine B cible d'une redirection. **Chaque origine consigne elle-même** ce qu'elle reçoit : chemin, présence du credential (booléen, jamais le jeton), durée avant fermeture de connexion. Rapport sur `GET /_proof/camera`, remise à zéro par `POST /_proof/camera/reset`. Mode CLI avec ports fixes et commandes `adb reverse`. Jeton public `maurice-camera-proof`, distinct du jeton de la fixture trial |
| `scripts/prove-camera.ts` | Utilise désormais cette fixture : les **9 scénarios** passent par le vrai `fetchCameraImage`, via un transport Blob seul et via le `fetch` de la plateforme Node (`arrayBuffer()`). Toutes les assertions précédentes sont conservées (octets exacts, credential sur le saut même origine, zéro requête sur B, coupure → `network`, abandon → `network` + connexion fermée). Ajouts : octets indécodables, 401, en-têtes jamais envoyés, absence de credential dans tout résultat, et chaque requête reçue par A porte le credential |
| `scripts/__tests__/camera-fixture.test.mjs` (nouveau, lancé par `test:tooling`) | PNG entier et décodable ; refus d'un autre jeton ; une entité par scénario ; services refusés ; proxy 401 sans credential ; rapport sans jeton ; contact de B bien enregistré ; CLI |

Non modifiés : `cameraImage.ts`, `components/camera/`, `SessionManager`, `package.json`, workflows, `docs/design/camera-images.md` (sa section Vérification décrit encore l'ancienne preuve : à mettre à jour par le coordinateur à l'intégration).

### Scénarios de la fixture

| Entité | Comportement serveur | Contrat (et assertion Node) | Question que seul Android tranche |
| --- | --- | --- | --- |
| `camera.fixture_image` | PNG 160 × 120 réel, 8 059 octets | `image`, octets exacts | `arrayBuffer()` Expo rend le cadre ; encodage base64 sous Hermes ; rendu du data URI |
| `camera.fixture_same_redirect` | 302 → `/frames/same-origin.png` | `image` ; second saut avec credential | `redirect: "manual"` honoré, saut même origine |
| `camera.fixture_cross_redirect` | 302 → origine B | `cross_origin_redirect` ; **B : 0 requête** | OkHttp ne suit pas ; B ne voit rien |
| `camera.fixture_not_image` | `text/html` | `not_an_image` | En-têtes natifs lus |
| `camera.fixture_undecodable` | `image/jpeg`, octets aléatoires | `image` (le transport ne décode pas) ; la carte doit afficher le repli | `Image onError` se déclenche-t-il sur Android ? |
| `camera.fixture_truncated` | moitié du PNG puis coupure | `network` | **Défaut soupçonné**, voir §3 |
| `camera.fixture_stalled` | moitié du PNG puis silence | `timeout` (Node : abandon appelant → `network`) | Budget de 15 s ; fermeture de la connexion |
| `camera.fixture_no_answer` | aucun en-tête | `timeout` (idem) | Budget sans en-têtes |
| `camera.fixture_unauthorized` | 401 | `unauthorized` | Statut natif |

Les deux scénarios à 15 s sont terminés par un abandon appelant dans la preuve Node, pour ne pas allonger `proof:camera` en CI ; le délai réel est couvert en Jest (horloges simulées) et sera observé en temps réel sur Android.

## 3. Lecture des sources Expo installées (Read, not run)

`expo` 57.0.30 remplace `fetch` sur natif, sauf `EXPO_PUBLIC_USE_RN_FETCH` (`src/winter/runtime.native.ts`). Dans `android/src/main/java/expo/modules/fetch/` :

1. **Redirections** — `NativeRequest.start` désactive `followRedirects` **et** `followSslRedirects` pour tout mode autre que `follow`. La réponse 3xx remonte avec son statut et ses en-têtes (`Location` lisible, pas d'« opaqueredirect »), et `url` = URL de la requête. Le code de l'app devrait donc refuser avant tout contact de B. À observer.
2. **Corps coupé : défaut probable confirmé à la lecture.** `pumpResponseBodyStream` attrape l'`IOException` et passe à `ERROR_RECEIVED`, puis `onResponse` passe **sans condition** à `BODY_COMPLETED` ; `arrayBuffer()` n'attend que `BODY_COMPLETED` et résout avec les octets déjà reçus. Un cadre tronqué arriverait donc comme `image`. Le même chemin vaut après une annulation pendant le corps, mais le budget JS y répond déjà par `network`/`timeout`.
3. **`Content-Length`** — `TransparentCompressionInterceptor` retire `Content-Encoding` **et** `Content-Length` quand il décompresse. Sur Android, un `Content-Length` présent décrit donc les octets non décodés : la comparaison avec `byteLength` y est cohérente. Ce n'est pas vrai sur Chrome en cross-origin (`Content-Length` exposé, `Content-Encoding` masqué).
4. **`btoa` sous Hermes 0.17** — rien dans les sources installées ne l'établit ni ne l'exclut. Le scénario `image` tranche : un échec `network` sur ce seul cadre valide désignerait `arrayBuffer()` ou `btoa`.

### Correctif proposé, non appliqué (reproduction d'abord)

Si la recette montre `fixture_truncated` rendu comme image (même partielle) : sur natif seulement, refuser comme `network` un corps dont `byteLength` est inférieur au `Content-Length` déclaré. Le web reste inchangé (point 3). Test de non-régression : réponse à `Content-Length` supérieur aux octets lus → `network` ; réponse sans `Content-Length` → inchangée. Ce changement touche `cameraImage.ts` (lot D) et ne demande pas de modifier la session.

## 4. Recette Android prête à exécuter (créneau natif du coordinateur)

Prérequis : candidat nommé par A (SHA, numéro de build, hash). La caméra n'est pas masquée par `buildFeatures`, et `usesCleartextTraffic` autorise HTTP en loopback. **Ne pas remplacer Trial 1012** ni ajouter ce profil à son installation sans décision explicite ; à défaut d'une installation distincte, demander l'arbitrage.

1. `node scripts/camera-fixture.mjs --port-a 8124 --port-b 8125`, puis les deux `adb reverse` affichés.
2. Dans l'app : connexion à `http://127.0.0.1:8124` avec le jeton public `maurice-camera-proof`.
3. `POST /_proof/camera/reset`. Ouvrir chaque caméra « Fixture camera N » une à une, attendre 20 s, noter ce qu'affiche la carte. Après chaque caméra, relever `GET /_proof/camera` (ou `curl` sur le Mac).
4. Pour `fixture_stalled` et `fixture_no_answer` : chronométrer le message de délai ; `closedAfterMs` doit être proche de 15 000.
5. **Arrière-plan et sortie d'écran** : ouvrir `fixture_stalled`, quitter l'écran (puis, autre essai, passer l'app en arrière-plan) après 3 s. Relever `closedAfterMs` (attendu ≈ 15 000 : le hook ne passe aucun signal d'annulation, limite déjà documentée) et l'absence de nouvelle requête pendant l'arrière-plan.
6. **Changement de profil et oubli** : après une image affichée, se connecter à une autre maison puis revenir (cadre conservé : comportement documenté) ; puis Oublier le profil fixture et se reconnecter (attendu : « Loading image… », pas l'ancien cadre).
7. Après chaque scénario : `originBRequests` doit rester **0**, et chaque requête de A doit avoir `credential: true`.

Grille à remplir, une ligne par scénario : fetch effectif (Expo attendu), résultat de la carte, `closedAfterMs`, requêtes sur A/B, credential, capture **de la fixture seulement**. Sur un échec, consigner la ligne et ne corriger qu'après reproduction.

## 5. Commandes et résultats (Node 24.11.1, macOS, worktree propre installé par `npm ci`)

| Commande | Résultat |
| --- | --- |
| `npm run proof:camera` | PASS, 3 exécutions consécutives |
| Mutation `redirect: "follow"` dans `cameraImage.ts`, puis `proof:camera` | **Échec attendu** : « platform fetch / cross_redirect: origin B contacted » ; mutation annulée |
| `node --test scripts/__tests__/camera-fixture.test.mjs` | 3/3 |
| `npm run test:tooling` | 39/39 |
| `npm test` | 81 suites, 1146 tests |
| `jest --listTests` dans ce worktree | 81 fichiers (aucun worktree parasite) |
| `npm run typecheck`, `lint`, `format:check`, `check:public-inputs` | exit 0 ; plan `sample` |

## 6. Limites et prochain geste

- Aucune preuve Android : redirections, décodage, troncature, délai et oubli restent des **gates ouvertes**. La preuve Node n'est pas la sortie attendue du lot ; elle garantit seulement que la fixture et le contrat concordent.
- Flex consulté (cellule `claude_code`, session `46188142-…`, messages 938 et 1005 ; sous-agent `agent-adda75d8a4375ceb4`, positions 609 et 1233) : leurs constats ont été revérifiés dans le code et les sources installées ci-dessus, pas repris tels quels.
- Pas d'aperçu Home, d'événements caméra, de notification ni de capture privée.
- **Prochain geste :** le coordinateur attribue un créneau Seeker/Pixel sur le candidat de A et exécute le §4 ; si `fixture_truncated` est reproduit, D applique le correctif du §3 avec son test.
