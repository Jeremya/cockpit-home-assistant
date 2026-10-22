# Prochaines étapes — une interface Maurice commune

**Suite opérationnelle — 22 octobre : [backlog pour 2 ou 3 agents Opus 5.5](parallel/README.md).** Les lots UX00–UX08 ci-dessous sont déjà livrés localement. Le nouveau découpage répartit recette/intégration (A), panneau partagé (B) et auth web (C), avec ownership et prompts. Trial 1010 est construit depuis `e52ac06`, pas encore installé/accepté. Ne pas relancer UX00.

Préparé le **20 octobre 2026** à partir du code présent dans ce workspace. Ce dossier est le point d'entrée pour le prochain modèle. Il découpe M02/M03 et la partie spatiale de D03/M04 ; il ne crée pas un second backlog produit.

**Point de revue — 21 octobre : UX00–UX03 sont revus et committés localement**, y compris le correctif de lecture primaire `4fc81b2`. UX04 est configuré dans le profil Chrome dédié ; UX05–UX08 sont implémentés et vérifiés ; la maquette est maintenant le défaut de Chrome large après mesures sur le Mac M4. [Preuves et limites](../stage0/desktop-validation.md). Aucun push, nouveau résultat CI distant ou APK n’est implicite.

## Objectif et décisions

Une app agréable à ouvrir chaque jour dans cette maison, sur Android et Chrome. Reprendre la cohérence visuelle de House Control : hiérarchie claire, surfaces sobres, pièces reconnaissables, état principal lisible et action explicite. Les règles, cartes, contenus et contrôles sont communs. La largeur disponible change leur disposition.

Décisions pour cette séquence :

- Améliorer d'abord l'accueil et les commandes partagées, puis la maquette.
- Faire évoluer `DeviceSummaryCard`, **sans créer un `DeviceTile` réservé au desktop**.
- Préparer une action directe sur les cartes **sur les deux plateformes**. Le contrôle reste limité à la démo et aux appareils explicitement autorisés par M01.
- Conserver les routes de détail actuelles dans cette première séquence. Le panneau de détail desktop de la spec D03 est **différé**, pas déclaré réalisé. Cela évite de mêler nouvelle navigation et nouvelles commandes.
- Préparer la 3D par défaut sur Chrome large, avec repli 2D. Le mobile partage données, sélection et composants ; sa caméra actuelle et ses restrictions de build restent conservées jusqu'à validation native.
- Garder HA comme seule intégration. Pas de serveur applicatif, de store supplémentaire pour les observations, de bibliothèque UI, ni de client fournisseur.

Ces décisions remplacent, pour l'exécution des lots ci-dessous, les propositions « tuiles desktop seulement », « téléphone inchangé » et « tout D03 en une fois » de la [spec D03 du 19 octobre](../superpowers/specs/2026-10-19-desktop-workspace-design.md). La navigation en panneau reste un chantier ultérieur. Aucun lot futur n'est implémenté par ce document.

## Historique : état de départ au 20 octobre, désormais consolidé

Au moment de la préparation :

- HEAD local : `42d833d` ; `6a5aca1` et `42d833d` ajoutent la **spec**, pas l'implémentation D03.
- D01 est dans `c62b099`. M01 et sa validation physique Pixel sont déjà livrés.
- **Modifications locales non commitées** : aperçu téléphone, chargement opt-in de `.local/ha-token`, corrections des événements/accessibilité SVG et liens HTML, déclaration TypeScript CSS, documentation et revues. Conserver ces modifications.
- Dernière vérification de ces modifications : **41 tests Jest / 4 suites + 2 tests HTTP**, TypeScript/lint/format ciblés, Chrome sur cinq formats, sélection SVG/clavier, connexion réelle HA **en lecture seule**. Ce n'est pas le total de toute la suite ni une CI complète.
- Aucune nouvelle CI distante ni nouvelle acceptation APK n'est attestée par cette préparation.

Un modèle dans **ce workspace** voit les modifications locales. Un clone distant ne les voit pas tant qu'elles n'ont pas été transmises. Cet état est historique : UX00–UX08 sont maintenant commités. Pour reprendre, contrôler les fichiers et suivre le nouveau dossier parallèle. Le [registre desktop](../stage0/desktop-validation.md) distingue les preuves.

## Ordre et taille des changements

| Lot | Résultat concret | Dépendance | Nature |
| --- | --- | --- | --- |
| [UX00](UX00-checkpoint.md) | Base locale reproductible et vérifiée — **revue et checkpoint Git local** | aucune | consolidation, pas de nouvelle UX |
| [UX01](UX01-shared-home.md) | Accueil et cartes cohérents aux deux tailles — **revue et checkpoint Git local** | UX00 | M03, présentation |
| [UX02](UX02-switch-controller.md) | Un seul hook pour les protections de commande — **commité localement le 20 octobre, non poussé** | UX00 | extraction sans changement de comportement |
| [UX03](UX03-card-action.md) | Action lampe depuis la carte, sans cible imbriquée — **commité localement le 20 octobre, non poussé** | UX01 + UX02 | M03, interaction |
| [UX04](UX04-household.md) | Bonne maison, pièces, placements et favoris — **Chrome dédié vérifié** | UX00 ; matériel disponible | M02, configuration et vérification |
| [UX05](UX05-spatial-selection.md) | Une sélection commune entre plan 2D et appareils — **implémentée et vérifiée** | UX01 ; UX03 peut précéder | D03, sélection |
| [UX06](UX06-camera-math.md) | Cadrage maquette testé, sans modifier le moteur — **implémenté** | UX00 | calcul pur |
| [UX07](UX07-renderer-lifecycle.md) | Repli durable et un seul moteur web actif — **vérifiés** | UX05 | cycle de vie, sans nouvelle caméra |
| [UX08](UX08-model-camera.md) | Maquette 3D par défaut sur Chrome large — **mesurée et activée** | UX06 + UX07 | D03, caméra et mesures |
| [UX09](UX09-acceptance.md) | Candidat accepté et début d'usage quotidien | UX03 + UX04 ; UX08 pour la maquette | M04/M05, terrain |

**Suite immédiate : UX09, recette du candidat sur Seeker puis usage réel.** La configuration UX04 concerne le profil Chrome dédié et ne bloque pas le code partagé. UX09 conserve ses validations matérielles et la semaine d’usage.

## Carte du code

```text
HA → HomeAssistantBackend → SessionManager → useCockpit
                                          ↓
                         deviceSummaries / presentDevice / selectors
                                          ↓
                          Home / cartes / détails / plan 2D / scène 3D

action explicite → contrôleur partagé → commands → SessionManager → backend
                                                     ↓
                                             commandStore / outcomes
```

| Responsabilité | Fichiers existants |
| --- | --- |
| Sessions, reprise et identité | `src/session/SessionManager.ts`, `src/session/homeAssistant/HomeAssistantBackend.ts`, `src/services/runtime.ts` |
| État/qualifications | `src/core/store.ts`, `policy.ts`, `presentation.ts`, `devicePresentation.ts`, `deviceSummaries.ts` |
| Permission et actionneur primaire | `src/commands/switchControl.ts` : `primarySwitch`, `switchControlRestriction`, `switchIdentityRestriction` |
| Contrôle actuel | `src/components/controls/SwitchControl.tsx`, `src/commands/store.ts` |
| Accueil et dispositions | `src/screens/HomeScreen.tsx`, `src/components/{DeviceSummaryCard,EntityCard,HousePlanCard,CardGrid,AppShell.web}.tsx`, `layout.ts` |
| Routes de détail | `src/services/deviceNavigation.ts`, `src/screens/{DeviceSummaryScreen,DeviceDetailScreen}.tsx` |
| Plan courant et liens | `src/spatial/{plans,profilePlan,selectors,placements,navigation}.ts`, `src/preferences/types.ts` |
| Plan et moteur | `src/components/{FloorPlanView,PlanRoomPolygon,CockpitSceneView}.tsx`, `src/web/CockpitScene.tsx`, `src/spatial/scene.ts` |
| Dev Chrome | `scripts/preview-devices.mjs`, `scripts/lib/local-connection.mjs`, `src/services/localConnection.web.ts` |

Les noms proposés dans les tickets sont des **nouveaux fichiers/API à créer**, sauf mention « existant ». Lire leur point d'entrée avant de coder.

## Règles communes

1. Un lot, un diff cohérent, puis validation. Ne pas supprimer le travail local pour obtenir une branche propre.
2. `entity.key` est une clé stable ; `entityId`, `deviceId`, `areaId` et `planRoomId` ont des rôles distincts. Les noms ne créent pas d'associations.
3. Observations HA et commandes restent distinctes. Une requête acceptée n'est pas une lampe observée allumée. Aucun rejeu après reconnexion.
4. M01 reste la porte d'autorisation au dispatch. Favori, position ou modèle HS103 ne donnent jamais une permission. Les préférences sont en **schéma 3**.
5. Le plan vient de `useHousePlan()` ; aucune lecture directe du plan privé dans un écran. Les payloads du moteur sont allowlistés, sans secrets ni entités HA brutes.
6. Démarrer en démo. Les contrôles de test doivent utiliser la démo ou la fixture fermée. L'autorisation de l'ancien cycle physique Kasa est consommée ; ne pas le répéter automatiquement.
7. Aucun token dans `EXPO_PUBLIC_*`, URLs, localStorage, logs ou captures. Le helper local nécessite `--local-ha` et reste réservé au développement.
8. Lire [la politique de dépendances](../design/dependency-policy.md) avant de modifier dépendances, workflows ou scripts qu'elle épingle. Ne pas recalculer les hashes pour masquer une dérive ; les exceptions documentées expirent le 2 novembre 2026.
9. Ne pas faire passer une capture Chrome pour une preuve Android/TalkBack/GPU. Résultat local, CI, APK et effet physique ont leurs propres preuves.

## Développement et validations

Deux terminaux :

```sh
npm run web -- --host localhost --port 8082
node scripts/preview-devices.mjs
```

Ouvrir `http://localhost:8083`, puis **Explore demo home**. La vraie app est dans un iframe unique ; changer la taille ne la remonte pas. Ne pas lancer un doublon si les serveurs tournent déjà. Pour le HA local, le second script peut recevoir `--local-ha`, puis Settings → Load local connection → confirmation HTTP éventuelle → Connect. Aucun ticket UI ne nécessite le vrai token.

Après le lot : tests ciblés prescrits, TypeScript/lint/format. Pour une intégration livrable : `npm test -- --watch=false`, `npm run test:tooling`, `npm run check:ui`. Ce dernier crée un export **public isolé** et conserve le plan local. Ne pas publier une capture/bundle simplement parce que son écran affiche la démo : le bundle pourrait encore contenir le plan privé.

Pas besoin de réinstaller les dépendances ni de reconstruire un APK pour chaque changement de style. UX09 possède la vérification native du candidat. Les tests qui ouvrent un port peuvent demander une exécution hors sandbox ; un refus de bind n'est pas un bug du produit.

## Prompt pour une reprise de recette seule (UX09)

Pour lancer B/C en parallèle, utiliser les trois prompts du [nouveau point d’entrée](parallel/README.md#prompts-à-donner-aux-agents). Ce prompt-ci concerne seulement la recette matérielle restante.

```text
Poursuis UX09 uniquement, selon
docs/handoff/README.md et docs/handoff/UX09-acceptance.md.
Préserve toutes les modifications locales existantes.
Commence par comparer git status aux fichiers attendus ; ne refais pas les
fonctionnalités déjà présentes. Lis seulement le contexte commun, le ticket,
ses fichiers et ses tests. Exécute le lot et ses validations nécessaires.
N'implémente pas le lot suivant dans le même changement.
Les tests démo/fixture sur le téléphone autorisé sont permis ; un nouveau cycle
physique exige une autorisation spécifique. Ne publie aucun secret/plan privé
et ne pousse pas sans instruction de livraison. Termine par : changements, vérifications
exactes, limites, et prochain lot. Mets à jour les liens d'état pertinents.
```

Remplacer UX09 et le chemin par le lot suivant après clôture. Une interruption humaine pour une validation matérielle ne doit pas être maquillée en succès.

## Après ces lots

- **Panneau de détail adaptatif** : contenu partagé extrait des routes, mesuré à sa propre largeur ; prototype préalable Back/Forward/deep link/focus. La [revue D03](../reviews/2026-10-19-desktop-workspace-review.md) liste les pièges. Ne pas ajouter `router.push("/")` pour chaque détail.
- **D02** : vrai maintien de connexion du produit via un contrat HA d'autorisation, durée de vie et logout. Le fichier `.local` ne résout pas l'authentification d'une app distribuée.
- **U02 / H02** : mesurer les listes avec un inventaire représentatif ; sortir HA du Mac si sa disponibilité empêche l'usage quotidien.
- **Finitions 3D** : matériaux puis mobilier simple, après les mesures. Murs escamotés, halo d'état, bloom et ombres demandent leurs propres contrats. Aucun nécessaire au premier MVP utile.
- **Nouvelles fonctions** : une catégorie vérifiée à la fois (climat, ventilateur, caméra…), puis iOS/publication. Aucun contrôle Petlibro ou présentation Bitaxe fiable sans preuve H01.

Ce relais n'ajoute aucune dépendance et n'effectue aucune nouvelle opération HA. La préparation est documentaire ; les résultats cités ci-dessus appartiennent à la validation précédente.
