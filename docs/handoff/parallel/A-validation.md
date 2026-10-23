# Agent A — recette, outillage portable et intégration

Lire le [contrat commun](README.md). Correspondances : UX09, M03/M04/M05, R01/R02. **Ne pas modifier le produit pour obtenir une preuve verte sans bug reproduit.** A est l’intégrateur, pas un second auteur du panneau ou de l’auth.

## A01 — Recette du candidat 1010

**Priorité P0 · taille M · prêt si téléphone disponible · indépendant de B/C.**

Résultat : un registre d’acceptation exact de Trial 1010 sur Seeker, ou une liste courte de défauts reproductibles. Le binaire est construit, pas encore installé. Ne pas le reconstruire pour une modification documentaire.

### Entrées et fichiers

- Lire `docs/design/internal-trial.md`, `docs/handoff/UX09-acceptance.md`, `docs/stage0/power-enrollment-validation.md`, `docs/stage0/return-focus-validation.md`.
- APK et manifeste : `.local/trial/sample/build-1010/`, SHA dans le README commun. Source `e52ac06`, `dirtySource:false`, arm64, sample, 3D fermée.
- Avant interruption : Seeker Android 16, Trial 1007, session HA ready ; baseline `.local/ux09/baseline.json`. Les réglages observés restent à revérifier.
- Helpers privés `.local/ux09/native.py` et `.local/u01/native.py` : **à inspecter et adapter**, pas runners déjà validés pour ce candidat. Certaines attentes/copier-coller viennent d’anciens écrans.
- Rapport public proposé : `docs/stage0/ux09-candidate-validation.md`. Captures/logs privés restent sous `.local/ux09/`.

### Exécution

1. Vérifier appareil, déverrouillage, version/signature installée et paramètres initiaux. Ne pas publier le serial. Relever font scale, TalkBack, veille et connectivité avant de les modifier.
2. Installer **en mise à jour** l’APK signé, sans désinstaller/effacer les données. Vérifier versionCode 1010 et SHA de l’APK installé ; relever que credentials/préférences préexistants se rechargent. Ne pas qualifier une donnée simplement affichée en cache de synchronisation prête.
3. Vérifier release autonome, lancement sans dépendance Metro, absence des entrées 3D/lab dans ce Trial. Le builder vérifie le bundle embarqué ; ce n’est pas une preuve d’exécution native.
4. En démo, Home → On → résultat → dismiss → Off ; le bouton de carte reste distinct du bouton d’ouverture. Ouvrir le détail, retour, favoris, filtrage, plan dépliable, trois étages, pièce non liée et placement/détail/retour. Ne pas écraser des placements démo existants ; sauvegarder/restaurer uniquement les données temporaires créées par la recette.
5. Refaire les cibles 48 dp, les textes à 100/200 %, puis le parcours TalkBack. Avant l’écoute, prévenir l’utilisateur ; enregistrer séparément hiérarchie/focus observés et confirmation humaine des annonces. Sans écoute, cette ligne reste ouverte.
6. Utiliser la fixture fermée pour les résultats et la reconnexion :

```sh
node scripts/trial-ha-fixture.mjs 18129 --power-proof
# Dans un autre terminal, avec le serial choisi localement :
adb -s "$DEVICE_SERIAL" reverse tcp:18129 tcp:18129
```

Connecter l’app à `http://127.0.0.1:18129`, token public `maurice-trial-proof`. Cette URL sur le téléphone fonctionne seulement avec le reverse. Vérifier le contrat du script : aucun trafic n’est transmis au HA réel. Le mode power-proof accepte uniquement ses services simulés.

7. Sur **la carte Home** de la prise fixture : aucun service au rendu, à l’ouverture, à l’enrollment ou à son annulation ; un seul service par appui ; ack sans observation → accepted, puis timeout → unconfirmed ; observation correspondante → confirmed. État affiché conservé jusqu’au rapport. Reconnexion et foreground ne rejouent rien. Révocation et changement d’identité bloquent un ancien handler. Compléter par auth/version terminale qui survit au foreground et Retry/Settings accessibles.
8. Restaurer la connexion du foyer en lecture seule et tous les réglages modifiés ; retirer seulement le reverse créé pour cette recette, arrêter la fixture. Scanner les logs du processus pour nouveaux crashes et secrets sans les imprimer.

Un cycle physique est **facultatif pour avancer A02/B/C**, obligatoire pour déclarer l’effet réel de la nouvelle action Home accepté : demander une nouvelle autorisation explicite sur la lampe précise au moment du cycle, noter l’état initial, le restaurer, puis demander ce que l’utilisateur a réellement vu. Aucun test Petlibro/serrure/chauffage.

### Terminé

Rapport avec source, hash APK, appareil/OS, mode de plan, fonctionnalités activées, checks passés/échoués/non exécutés et restauration. Une ligne en attente n’est pas un succès. Pixel et 3D native restent hors acceptation de ce binaire. Si appareil indisponible, documenter cela puis commencer A02.

### État — 22 octobre 2026 : non exécuté

- **Préflight en lecture seule à 10 h 53 CDT :** Seeker Android 16, Trial 1007 (`0.1.0-trial.7`) installé, déverrouillé et au premier plan ; police 1.0, TalkBack inactif, veille 60 s, écran maintenu sur secteur (`15`), Wi-Fi, aucun `adb reverse`. Le SHA de l’APK 1010 local correspond à celui du manifeste.
- L’utilisateur a autorisé la recette complète **sans lampe**, TalkBack restant à demander à part. Le Seeker a été débranché avant la baseline : un Pixel 9 Pro a été visible un moment, sans être utilisé ; puis plus aucun appareil après 25 min d’attente. **Rien n’a été installé ni modifié sur un téléphone.** Cette autorisation est consommée : il faut la redemander.
- Helper privé préparé, `.local/a01/native.py` : le numéro de série est découvert à l’exécution et jamais affiché ; la commande passe par la carte Home ; la restauration se fait via `.local/ha-token`. Il n’a jamais tourné sur un appareil : les attentes de libellés seront corrigées au premier passage, et ces corrections ne compteront pas comme des réussites.
- Le fixture répond désormais à `auth/current_user` (`e4090d6`), sans effet sur Trial 1010.

**Reprise.** Brancher et déverrouiller le Seeker, accepter l’invite de débogage USB et redemander l’autorisation du cycle. Lancer ensuite `node scripts/trial-ha-fixture.mjs 18129 --power-proof` et une seconde instance sur `18130` pour le changement d’origine. Exécuter, depuis le dépôt principal : `python3 .local/a01/native.py` `baseline` → `install` → `standalone` → `demo` → `fonts` → `fixture-connect` → `fixture-suite` → `identity` → `restore` → `logs`. Écrire le rapport public `docs/stage0/ux09-candidate-validation.md` sans numéro de série. TalkBack (écoute humaine) et un cycle physique éventuel restent des autorisations séparées.

## A02 — Rendre les preuves 3D reproductibles

**Priorité P1 · taille M · prêt maintenant · aucun besoin HA/téléphone.**

Problème constaté : les tests math/host sont versionnés, mais les preuves navigateur UX07/UX08 sont encore dans des scripts ignorés `.local/ux07` et `.local/ux08`. Un agent sur clone propre ne peut pas les relancer.

### Périmètre

Nouveau `scripts/check-spatial-ui.mjs`, helpers/tests d’outillage propres à ce runner ; scripts/lib/public-build.mjs et preview-server.mjs existants à réutiliser. A seul peut modifier `package.json`, workflow et hashes d’audit après revue réelle. Aucun changement de moteur attendu.

### Livrables

1. Une commande documentée fonctionne après `npm ci`, sans `.local`, plan privé, token ou chemin `/tmp` existant. Snapshot/export **sample isolé**, même politique de provenance que `check:ui`, nettoyage browser/server en `finally`.
2. Cas headless : défaut 3D à 1024/1440, 2D compacte ; choix explicite conservé, sélection/pièce non liée, clavier ciblé scène, retour overview, reduced motion, limites yaw/zoom, resize, marqueur → détail, fallback WebGL absent/perte réelle de contexte, Retry explicite, route inactive, scroll hors viewport, pas de double renderer.
3. Utiliser `sceneProbe` et les compteurs numériques existants ; aucune API de mutation de store/commande ajoutée au produit pour le test. Installer des fixtures publiques de préférences dans un contexte isolé est possible ; reconnecter la démo après reload et **assert nombre de marqueurs + plan attendus avant mesure**.
4. Distinguer les erreurs inattendues des messages WebGL volontairement provoqués ; pas de filtre global qui fait taire toute console.
5. Mode optionnel `--headed --performance` : Chrome local, GPU nommé, viewport/DPR/canvas, trois ouvertures, 3×10 s de geste, médiane ≥30 FPS, ouverture ≤3 s, 2 s idle sans frames. Ce budget matériel n’est pas un critère de CI headless. Le zoom 200 % doit être celui du navigateur, pas `style.zoom`.
6. La visibilité injectée doit être nommée comme telle. L’ancien harness a rencontré les comportements de focus forcé de Playwright ; ne pas transformer cette difficulté en une fausse preuve d’onglet réellement masqué.
7. Les captures/report publics sont bornés et allowlistés ; aucun chemin privé implicitement chargé. Un mode plan privé, s’il est ajouté, est opt-in, sort exclusivement dans `.local` et n’est jamais activé par CI.
8. A raccorde le mode fonctionnel à CI après stabilité. Écrire son exposition et contrôler le frais audit si un fichier épinglé change ; ne pas étendre l’expiration du 2 novembre pour le faire passer.

### Validation

Runner sur sample propre, avec puis sans WebGL ; échec intentionnel si sélection ou compteur est faux ; nettoyage des processus même en échec. Tests Node ciblés uniquement pour les nouvelles limites d’outillage. Vérifier `git diff` vide dans le checkout public après export. Preuve dans `docs/stage0/spatial-browser-validation.md` (nouveau).

### État — 22 octobre 2026

**Livré** sur `work/acceptance` : `npm run check:spatial-ui` (headless, raccordé à un job CI) et `-- --headed --performance` (Chrome local). Preuve : [spatial-browser-validation.md](../../stage0/spatial-browser-validation.md). Restent ouverts : premier passage du job GitHub (aucun push), et le correctif séparé de l’interruption de `check:ui` (workspace temporaire laissé sur SIGINT, reproduit).

## A03 — Intégration des deux fonctionnalités

**Priorité P0 avant livraison · taille M · attend B04 + C04 ; A02 doit être disponible.**

1. Revue des contrats gelés, intégrer les commits par étapes (voir README). Inspecter `SessionManager`, le root layout et les scripts épinglés ; aucun conflit résolu en supprimant une protection.
2. Exécuter typecheck, lint, format, Jest complet, tooling, `proof:dependencies`, `proof:protocol`, smoke UI, recette spatiale, recettes B/C. Export public Android avec source maps et runtime guard. Les exports ne remplacent pas une installation native.
3. Audit frais avant le 2 novembre 2026 : si correctif publié ou périmètre changé, traiter R01 explicitement. Aucun renouvellement automatique. Le statut `passed-with-exceptions` n’est pas un audit sans vulnérabilité ; publication R03b exige le strict.
4. Scénario d’intégration essentiel : auth → Home → appareil → lecture → retour → refresh/reconnexion → même profil et permissions → logout dans un autre onglet → ancien panneau et ancien appui inopérants. Aucune double scène/session, aucun secret dans URL/captures/logs.
5. Construire un **nouveau** numéro de Trial non utilisé depuis la source intégrée propre, plan public. Ne pas appeler ce binaire 1010. Refaire la matrice native applicable ; l’auth web ne donne pas le droit de changer SecureStore ou d’activer la 3D native.
6. Mettre à jour les index `docs/README.md`, `docs/BACKLOG.md`, ce dossier et les preuves, avec SHA et limites. Les preuves GPU privées restent privées. Ne pas lancer de push ou distribution hors autorisation de livraison.

Terminé : candidat intégré identifiable, parcours communs et nouveaux flux acceptés sur les clients nommés, limites exactes listées. Si un défaut est trouvé, ouvrir un correctif borné à son auteur ; ne pas empiler une nouvelle fonctionnalité.

### Notes d’intégration reçues — 22 octobre 2026

- **B (B01–B04 `f76a589`…`f058cd7`).** À ≥1280 px, un détail ouvert depuis Home s’affiche dans le panneau et la scène reste vivante. Il faut donc adapter l’étape `marker-detail` de `check:spatial-ui` :
  - à 1440 px : panneau visible, `live == 1`, Close puis Escape ;
  - Escape depuis le titre du panneau, jamais depuis la scène focalisée ;
  - focus rendu à « Around your home » ;
  - relire la position des marqueurs après le rétrécissement du canvas ;
  - à 1024 px : route complète, `noScene` ;
  - recalculer ensuite l’empreinte d’audit.
- **Patch Expo Router (B).** Les deux hunks ne touchent que le web : le natif charge `useLinking.native.js`. Il est adopté en `patches/expo-router+57.0.28.patch` seulement si :
  - la recette passe de 20/21 sans le patch à 21/21 avec ;
  - `check:ui`, `check:spatial-ui` et Jest restent inchangés ;
  - patch-package s’applique proprement depuis `npm ci` ;
  - une revue d’audit l’ajoute aux fichiers revus.

  Sinon, documenter Back/Back/Forward comme défaut web connu. Aucun signalement en amont sans l’accord de l’utilisateur.
- **Raccords.** `check:detail-panel` à brancher dans `package.json`/CI avec revue des empreintes. Ajouter `<Stack.Screen name="auth-callback" options={{ headerShown: false }} />` en fusionnant C02.
- **C.** C02 ne s’intègre pas sans C03 : il refuse la commande en session navigateur avec un libellé générique. La règle de principal est documentée dans `power-enrollment.md` (`5b26bed`). Depuis Settings, `dismissTo("/")` remplace `router.replace("/")` (C03).
- **Natif.** Le groupe de routes ajoute un niveau de Stack. Il faut ré-accepter le retour de focus TalkBack et le bouton Back matériel sur le nouveau candidat.
- **Outillage.** `check:ui` interrompu par SIGINT laisse son workspace temporaire (reproduit en A02) : correctif séparé, avec revue d’audit.

### État d’intégration — 22 octobre 2026 (soir)

Sur `work/acceptance`, sans push :

| Étape | Commit |
| --- | --- |
| Fusion de B01–B04 | `0cd8bc2` |
| Runner 3D adapté au panneau | `6736dcf` |
| Exception sprintf-js retirée (advisory GitHub retiré) | `33b0236` |
| Patch d’historique web Expo Router | `6c04104` |
| `check:detail-panel` dans la CI | `320b563` |
| Fusion de C01–C03 | `13bb790` |
| Route `auth-callback` enregistrée | `7072ce0` |

Sur l’arbre intégré :

- **Passent :** Jest **958/70**, outillage **35/35**, typecheck/lint/format, `check:ui`, `check:spatial-ui` (pic de 1 renderer), `proof:protocol`, `proof:dependencies`, export Android et sa garde runtime (cache Metro isolé), audit `passed-with-exceptions` (51 entrées, braces et node-forge, expiration au 2 novembre inchangée). Les recettes 3D et panneau passent aussi en conteneur Linux arm64.
- **Échoue :** `check:detail-panel` à **19/21**. Settings appelle `router.dismissTo("/")` après Connect et Explore demo ; cela retire l’entrée de détail que Back doit retrouver. Avec `router.replace("/")`, la recette fait 21/21. Le correctif est demandé à C (fichier de C). Ce changement venait d’une suggestion de B relayée par A.

**Mise à jour :** C a rétabli `router.replace("/")` (`e893965`, intégré en `590aec0`). Sur cet arbre : `check:detail-panel` **21/21**, `check:ui` passe, Jest **959/70**, typecheck, lint et format passent. C04 part de `590aec0`.

**Mise à jour (B) :** `957e366` et `d7ac3fc` sont intégrés : un seul Home quel que soit le seuil, panneau à partir de 1224 px, runner sans option de patch et interruption propre. `check:detail-panel` **22/22**, `check:ui` passe, `check:spatial-ui` passe 2/2 (10 renderers créés, pic 1), Jest **960/70**, outillage 35/35. Runner ré-épinglé, audit `passed-with-exceptions`.

**Mise à jour (C04, A03 navigateur) :** C04 (`d3860ce`) et la ligne A03 (`162b174`) sont intégrés ; `check:web-auth` est branché sur la CI et épinglé.

- **Arbre final `4230f52` :** `check:web-auth` **12/12**. Scénario A03 : une scène et un renderer ; panneau, lecture, Back puis Close avec le focus sur la carte d’origine ; même profil et autorisation identique après reload, sans nouveau code ; sign-out dans l’onglet B → panneau et appui de l’onglet A inopérants ; 0 appel de service ; une socket par onglet ; aucun token dans les URL de requête.
- **Batterie complète sur `bd37ebc`** (code applicatif identique à `4230f52`) : Jest 960/70, outillage 36/36, typecheck, lint et format, `check:ui`, `check:spatial-ui`, `check:detail-panel` 22/22, `proof:protocol`, `proof:dependencies`, export Android et garde runtime.
- **Linux arm64 :** `check:detail-panel`, `check:web-auth` et `check:spatial-ui` passent en conteneur.
- **Interruption :** `check:ui` nettoie désormais correctement (`93ef7d2`).
- **`main` :** avancé en fast-forward sur `4230f52`, localement, sans push.

**Candidat intégré — Trial 1011 (construit, non installé).**

- **Source :** propre `4230f52260e7f4b4f4e10280913ac6a1c8a0215b2`, `dirtySource:false`, plan sample, arm64.
- **Fonctions :** commande d’alimentation par enrollment HS103, refusée par défaut ; 3D fermée. Le builder a vérifié : bundle embarqué, release non debuggable, sans dev launcher, backup désactivé.
- **Signature :** certificat `7191b909…1153`, le même que 1010, donc mise à jour en place possible.
- **APK SHA-256 :** `4eebee063ac4015de857da1910cd9caa0b3ea9269e109df8231812f6e0773009`. Manifeste local : `.local/trial/sample/build-1011/`.
- **Contenu natif :** panneau (route group et focus de B) et principal de commande inclus. La connexion navigateur de C n’existe que sur le web ; le natif garde le token SecureStore. 1010 ne certifie aucun de ces changements.

**Reste avant A03 terminé :**

1. Recette native de 1011 sur le Seeker, avec une autorisation donnée au moment du cycle. Helper : `MAURICE_TRIAL_BUILD=1011 python3 .local/a01/native.py …`. Elle couvre la matrice A01, le Back matériel et le retour de focus TalkBack, qui exige une écoute humaine. A01 pour 1010 devient facultatif si 1011 est accepté directement : à décider avec l’utilisateur.
2. Aucun push ni distribution sans autorisation de livraison.

Problème connu accepté : un Home caché en double dans la pile après une connexion depuis Settings (comportement antérieur à B).

## A04 — Sept jours et décision suivante

**Terrain, pas développement · commence après acceptation réelle.**

Utiliser `.local/ux09/usage-journal.md` s’il existe, sinon créer le tableau décrit par UX09. Laisser les dates/jours vides tant que non observés. Noter visites utiles, action/lecture, retour Kasa/Petlibro et raison, état trompeur, HA disponible. Un résultat automatique ne remplace pas l’écoute ni l’effet physique.

À l’issue : un court bilan avec trois irritants classés et un seul prochain chantier recommandé (H02, U02, finition D03, ou catégorie H01 vérifiée). Le nouvel auth durable de C doit être évalué dans l’usage ; ne pas certifier que le problème est réglé seulement parce que le stockage contient une clé.
