# UX00 — Consolider la base avant une nouvelle fonctionnalité

Statut : **revu et livré dans le checkpoint Git local UX00/UX01 du 20 octobre 2026** — résultats dans le [registre desktop](../stage0/desktop-validation.md#ux00-checkpoint--2026-10-20). Lire [le contexte commun](README.md). Ce ticket ne redessine aucun écran.

## Résultat

Le prochain modèle dispose de l'aperçu, du chargement local et des corrections web dans un état vérifié/reproductible. Les fonctionnalités déjà codées ne sont pas réimplémentées.

## Fichiers attendus

Inclus dans ce checkpoint après revue :

- `scripts/preview-devices.mjs`, `scripts/preview/{index.html,preview.css,preview.js}` ;
- `scripts/lib/local-connection.mjs`, `scripts/__tests__/local-connection.test.mjs` ;
- `src/services/localConnection.ts`, `localConnection.web.ts`, `__tests__/localConnection.web.test.ts` ;
- `src/components/PlanRoomPolygon.tsx`, `PlanRoomPolygon.web.tsx` ;
- changements de `FloorPlanView.tsx`, `AppShell.web.tsx`, `SettingsScreen.tsx` ;
- `src/types/styles.d.ts` : déclaration de l'import CSS pour TypeScript sur checkout propre ;
- README, docs desktop/validation, deux revues du 19 octobre, ce dossier de relais.

Les scripts dans `.local/` sont des preuves privées de poste, **pas des dépendances à distribuer ni des tests CI portables**.

## Exécution

1. Lire `git status --short`, `git diff` et ces fichiers. Si absents dans un autre checkout, récupérer le changement correspondant avant UX01 ; ne pas coder une imitation depuis ce document.
2. Vérifier les tests et statiques :

```sh
npm run typecheck
npm run lint
npm run format:check
npm test -- --watch=false
npm run test:tooling
npm run check:ui
```

3. Vérifier le typecheck sans dépendre d'un `expo-env.d.ts` généré : garder `src/types/styles.d.ts` et reproduire dans un checkout/export public isolé. Ne pas supprimer des fichiers de l'environnement de l'utilisateur pour cela. Dans ce même environnement public, exécuter `npm run export:android -- --source-maps` puis `npm run check:runtime-dependencies -- dist android` selon le [guide public](../design/public-checks.md). C'est une validation JS/Hermes/DOM, pas un APK accepté.
4. Chrome en démo : 360/412/430/768/1280, rotation, changement de taille depuis le détail, sélection d'une pièce par SVG et bouton clavier. Attendu : même document/session et aucun avertissement React DOM. Utiliser les parcours déjà décrits dans le [registre desktop](../stage0/desktop-validation.md).
5. Pour rendre la recette du cadre portable, ajouter **si nécessaire** `scripts/__tests__/preview-devices.test.mjs` : spawn du script sur un port libre, service d'app factice dans le test, contrôle GET/HEAD des assets, 404 des autres chemins, `/local-connection` désactivé sans flag, hôte non-loopback refusé en CLI, arrêt propre. Ne jamais lire le vrai `.local/ha-token` dans ce test. Garder les tests existants du handler pour les lectures autorisées/refusées.
6. Contrôler l'audit selon sa politique actuelle ; distinguer échec de réseau, dérive, expiration et advisory. Aucune CI distante fraîche ne doit être inventée.
7. Enregistrer les résultats exacts et le périmètre dans `docs/stage0/desktop-validation.md`. Si une livraison Git est demandée, sélectionner explicitement les sources/docs ; exclure `.local`, `.env`, artifacts et plan généré. Ne pas pousser sur la seule base de ce ticket.

## Ne pas changer

Le loader garde un déclenchement explicite. Son endpoint exige le Host/Origin exact, POST et le header non simple, ne reçoit pas de chemin client et reste absent sans `--local-ha`. Le token reste en RAM. Ne pas « simplifier » avec un fetch de `/.local/ha-token`, un cookie contenant le token ou un `EXPO_PUBLIC_HA_TOKEN`.

Le reset de plan et la politique de commande ne font pas partie de ce lot. Ne pas profiter de cette consolidation pour modifier les versions Expo/RN.

## Terminé quand

- Les fichiers requis sont présents et le résultat de chaque commande est consigné, avec les éventuels blocages distincts.
- L'aperçu et les SVG fonctionnent dans Chrome sans suppression de LogBox.
- Le loader est testable avec des données publiques ; aucune authentification réelle n'est nécessaire à la recette portable.
- Le statut « local seulement » ou le SHA livré est explicite.

Lot suivant : [UX01](UX01-shared-home.md).
