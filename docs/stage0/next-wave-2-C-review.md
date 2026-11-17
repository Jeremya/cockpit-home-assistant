# Vague 2 — agent C : revue de #3 et #5, recette caméra Pixel

Date : 2026-11-17. Revue en lecture seule : aucune ligne de code applicatif n'est modifiée par ce document. Les preuves 3D de #4 sont conservées telles quelles ; aucune campagne GPU ou thermique n'a été relancée.

## Verdicts

| Objet                                                                          | Revision lue                           | Verdict                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #3 (B) — focus de route web, interrupteur 48 dp, grille mesurée avant peinture | `9fcf6e8`                              | **Sans blocage.** Aucune régression trouvée sur le focus, la navigation ou l'accessibilité. Deux observations mineures (B-1, B-2).                                                                            |
| #5 (D) — corps tronqué refusé sur natif, une seule requête à la reprise        | `3b8f349` (code identique à `f8b0144`) | **Sans blocage pour le comportement observé.** Un défaut latent est reproduit en Jest et n'est pas atteignable sur le Pixel aujourd'hui (D-1). Une limite déjà documentée est confirmée sur l'appareil (D-2). |
| Recette caméra Pixel sur `948e642`                                             | APK `adcdd1da…`                        | **5 scénarios sur 5 conformes**, plus l'image de référence. C'est la **première preuve caméra sur Pixel** : D n'avait prouvé que le Seeker.                                                                   |

## Constats sur #5 (propriétaire D)

### D-1 — Une carte restée montée reprend une lecture lancée avant Forget (latent)

- **Fichier** : `src/components/camera/useCameraImage.ts`.
  - L. 94 : `pending`.
  - L. 114 : la lecture partagée est reprise si la clé est la même.
  - L. 142 : écriture dans le cache.
- **Mécanisme** :
  - La lecture en cours est portée par un `useRef`, et elle est reprise dès que `cacheKey` est identique.
  - `cacheKey` vaut profil + entité. Le profil est dérivé de l'URL (`profileIdFor`, OQ-05).
  - Après Forget, une reconnexion à la même URL redonne donc la même clé.
  - Si la carte reste montée pendant la transition `ready` vrai → faux → vrai, la nouvelle exécution de l'effet attend la lecture lancée avec l'ancien credential. Elle affiche son image et l'écrit dans le cache vidé par `forget()`.
  - Avant #5, l'exécution annulée jetait ce résultat et une nouvelle requête partait.
- **Conséquence** : un cadre obtenu avec un jeton oublié peut réapparaître dans la session suivante et repeupler le cache, alors que `forget()` vient de le vider. C'est le cas si le jeton a été changé, ou si l'utilisateur HA est différent sur la même URL. Cela contredit l'esprit de la règle « un résultat arrivé après le départ ne change ni l'état ni le cache ».
- **Reproduction (Jest, sonde non commitée)** :
  1. Monter `useCameraImage` avec `profileId: "ha:a"` et `ready: true`, le premier `fetchCameraImage` restant en attente.
  2. `rerender({ ready: false })`, puis `clearCameraCache("ha:a")`, puis `rerender({ ready: true })`.
  3. Résoudre la première lecture.
  - Résultat sur `948e642` : `{"callsBeforeOldSettles":1,"shown":"old","cached":"old"}`. Aucune nouvelle requête n'est partie ; l'ancien cadre est affiché et mis en cache.
- **Atteignabilité observée** : non sur le Pixel.
  - Une fois Forget lancé depuis Connexion empilé au-dessus du détail caméra (lien `homecockpit://settings`), la route du détail reste dans la pile. Elle affiche alors « Not connected », ce qui démonte la carte et perd la référence.
  - Le défaut dépend donc d'un démontage qu'aucun test ne fige. La note « no test covers a card that is still mounted while Forget runs » de `docs/design/camera-images.md` décrit exactement ce trou.
- **Correction proposée** :
  - Ne conserver la lecture partagée qu'à travers une perte de focus ou un passage en arrière-plan, pas à travers `ready` faux ni un changement de profil. Par exemple, remettre `pending.current = null` quand `ready` devient faux.
  - Ajouter le test ci-dessus en rouge, puis vert.

### D-2 — Une lecture n'est pas interrompue par Forget (limite documentée, confirmée)

- Sur le Pixel, Forget a eu lieu à +4 s pendant une image retardée de 12 s. La fixture a pourtant enregistré la requête comme **complétée** à 12 008 ms. Les octets ont donc été transférés avec le credential oublié, puis jetés : le résultat n'est apparu nulle part (voir le scénario 5).
- C'est la limite « A retrieval is not cancelled when its screen is left » déjà écrite par D. Pas de nouvelle tâche ; elle rejoint D-1 si une annulation sur Forget est décidée.

### Points vérifiés sans constat

- **Isolation des requêtes** :
  - le credential n'est envoyé qu'à l'origine A ;
  - la redirection vers une autre origine est refusée avant tout contact avec l'origine B (0 requête) ;
  - la fixture n'enregistre jamais le jeton.
- **Concurrence** : à la reprise, aucune requête ne chevauche la précédente (voir le scénario 2).
- `verifyDeclaredLength` n'est actif que hors web. Le contrôle passe après la borne de 5 Mo et avant le cas « vide ». Un `Content-Length` non numérique est ignoré.

## Constats sur #3 (propriétaire B)

Vérifié à `9fcf6e8`, avec Node local et `node_modules` partagés :

- Jest sur les zones touchées (`src/navigation`, `ThemedSwitch`) : 4 suites, 27 tests verts.
- `npm run check:detail-panel` : 26/26. `dirtySource: true` ne vient que du lien `node_modules` non suivi de l'arbre de revue.

### B-1 — Retour au focus de la liste non conditionné à l'espace de travail visible (mineur)

- **Fichier** : `src/navigation/DetailWorkspace.web.tsx`, l. 126 et 136.
- Le placement sur le titre du détail exige `shown`, mais le retour à la liste (`if (!closed) return;`) ne l'exige plus. Avant #3, ce retour était limité au panneau.
- **Conséquence possible** : un deuxième espace de travail non visible, sous `/house`, dont la pile serait dépilée déplacerait le focus. Je n'ai pas trouvé de parcours utilisateur qui le déclenche.
- **Proposition** : ajouter `shown` à la condition, ou écrire en commentaire pourquoi il est inutile.

### B-2 — La boîte native 48 × 48 dp change la géométrie des lignes Android (à confirmer sur Pixel)

- **Fichier** : `src/components/ui.tsx`, l. 445 et 501.
- C'est correct pour la cible tactile. Il se peut toutefois que les lignes contenant un interrupteur grandissent sur Android. B l'a vérifié sur le Seeker à 100 % et 200 %, pas sur le Pixel.
- Ce n'est pas une régression constatée. C'est une vérification qu'il reste à faire sur Pixel.

## Recette caméra Pixel

**Binaire et protocole**

- Téléphone : Pixel 9 Pro, Android, profil utilisateur principal.
- Candidat A : `candidate/wave2-1` = `948e642`, qui contient #5 à `f8b0144`.
- APK déjà installé, sans réinstallation : `com.larrabee.homecockpit.s02proof` 0.1.0 (1). Le SHA-256 du `base.apk` installé a été vérifié avant et après la recette : `adcdd1da50650303d194f15f13b6ee583836684feb331e44d600d12dd751f83e`.
- Fixture publique de D : `node scripts/camera-fixture.mjs --port-a 8124 --port-b 8125` lancé depuis `948e642`, exposé au téléphone par `adb reverse`. Connexion à `http://127.0.0.1:8124` avec le jeton public de la fixture et « I trust this local network ».
- Le transport est identifié par la fixture : `User-Agent: okhttp/4.9.2`, `Accept-Encoding: zstd, br, gzip`, c'est-à-dire le fetch d'Expo.
- Les captures restent locales : elles ne montrent que la fixture, mais elles ne sont pas publiées.

**Résultats**

| #   | Scénario                                                                                            | Ce qu'affiche la carte                                                                                     | Journal de la fixture                                                                           | Verdict                                            |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 0   | Référence : image                                                                                   | Cadre affiché, « Capture time unknown · Fetched … »                                                        | Une requête vers A, avec credential, complétée                                                  | Conforme                                           |
| 1   | Corps tronqué (caméra 6)                                                                            | « The image could not be loaded. », sans cadre partiel ni heure « Fetched » ; identique au sondage suivant | Réponses non complétées ; 3 requêtes en 15 s, sans chevauchement                                | **Conforme**                                       |
| 2   | Arrière-plan à 3 s, reprise à 5 s, lecture bloquée (caméra 7)                                       | « Loading image… », puis « The image request timed out. »                                                  | Requête 1 fermée par le client à 14 995 ms ; requête 2 ouverte à +15 470 ms, après la fermeture | **Conforme** : une seule requête ouverte à la fois |
| 3   | Redirection vers une autre origine (caméra 3)                                                       | « The image redirects to another server and was not loaded. »                                              | A : 1 requête avec credential ; **B : 0 requête**                                               | **Conforme**                                       |
| 4   | Forget, reconnexion, réouverture (image retardée de 8 s)                                            | « Loading image… », puis le nouveau cadre ; le cadre d'avant Forget n'est pas réutilisé                    | Une nouvelle requête, complétée à 8 003 ms                                                      | **Conforme**                                       |
| 5   | Résultat tardif : Forget à +4 s pendant une image retardée de 12 s, puis reconnexion et réouverture | « Loading image… », puis un nouveau cadre ; ni l'ancien cadre ni le résultat tardif n'apparaissent         | Requête tardive complétée à 12 008 ms, après Forget (D-2) ; nouvelle requête après reconnexion  | **Conforme**                                       |

Ces résultats valent pour le Pixel uniquement. Ils ne transposent pas ceux du Seeker de D, et l'inverse ne vaut pas non plus.

**Observation hors périmètre** : après « Connect », Google Password Manager propose d'enregistrer l'URL et le jeton. Le jeton public de la fixture a été refusé avec « Not now ». C'est le même comportement que celui signalé sur le Seeker et traité par #6 : il est donc aussi constaté sur Pixel.

**Remise en état**

- Connexion fixture oubliée : l'application est revenue à l'écran d'accueil initial.
- `adb reverse` vide, retour au launcher, fichier de dump supprimé.
- Police 1.0, aucun service d'accessibilité, loupe désactivée : identiques à l'état initial.
- Aucune installation. Trial n'a pas été touché.
- Téléphone rendu explicitement à A.

## Gates restantes

- **D-1** : correction et test par D. Tout commit de code dans #5 demanderait un nouveau candidat et une nouvelle recette native.
- **B-1** : décision de B. **B-2** : vérification Pixel des lignes à interrupteur.
- La recette caméra de cette PR couvre les cinq scénarios demandés. Les quatre autres scénarios de la fixture (redirection même origine, non-image, octets indécodables, 401) n'ont pas été rejoués sur le Pixel.
