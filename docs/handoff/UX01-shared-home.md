# UX01 — Donner un rythme commun à l'accueil

Statut : **revu et livré dans le checkpoint Git local UX00/UX01 du 20 octobre 2026** ([preuves](../stage0/desktop-validation.md#ux01-shared-home--2026-10-20)). Périmètre M03, présentation seulement. Aucun nouveau contrôle ni moteur 3D.

## Point de départ

Lire `src/theme.ts`, `components/ui.tsx`, `HomeScreen.tsx`, `DeviceSummaryCard.tsx`, `HousePlanCard.tsx`, `CardGrid.tsx`, `layout.ts`.

Avant UX01, le plan était **après les appareils sur téléphone**, et au-dessus à côté de l'attention sur desktop. `CardGrid` mesure sa largeur mais choisit ses colonnes via le breakpoint desktop. Les cartes utilisent déjà `presentDevice` et gardent des qualifications utiles. Ne pas remplacer ces présentateurs.

## Présentation cible

Ordre commun dans le DOM/arbre natif :

1. Maurice et état de connexion ; Settings/Refresh selon les conventions existantes.
2. Bannière de session si nécessaire ; attention globale compacte, toujours accessible.
3. Aperçu de la maison, avec nom et accès au plan.
4. Filtres de pièces, favoris dans « All rooms », puis groupes d'appareils.

Sur écran large, le bloc maison et l'attention peuvent être côte à côte, en conservant un ordre de lecture cohérent. Pas de version distincte du contenu ni de duplication cachée pour chaque taille. Une seule occurrence de chaque carte.

La maison ne doit pas repousser systématiquement les premiers appareils hors d'un écran de téléphone courant : garder le format compact `HousePlanCard`, pas un hero pleine hauteur. Ne pas imposer une hauteur fixe aux textes/cartes pour atteindre cet objectif.

## Implémentation bornée

1. Étendre `src/theme.ts` avec des tokens simples, en conservant les couleurs actuelles :
   - espacements : 4, 8, 12, 16, 24, 32 ;
   - rayons : contrôle 12, carte 20, panneau 24 ;
   - texte : secondaire 13/19, corps 15/22, nom 16/22, valeur 26/34, titre 30/36 ;
   - cible tactile minimale : 48.
2. Appliquer ces tokens **seulement** à Home, `DeviceSummaryCard` et `HousePlanCard`. Ne pas lancer une migration de tous les écrans.
3. Réorganiser Home avec les blocs existants. Conserver `SessionBanner`, `attentionSummary`, filtres, favorites et groupement multi-pièces.
4. Carte : nom et pièce, état principal fort, au plus deux lignes de soutien génériques ; conserver les informations Petlibro utiles déjà sélectionnées. Chiffres tabulaires, noms qui reviennent à la ligne, hauteur libre.
5. Ne pas cacher « Cached », « unavailable », « Summary incomplete » ou un résultat de commande pour réduire la hauteur. Les explications générales peuvent rester derrière « About these readings ».
6. Garder `DeviceSummaryCard` entièrement cliquable pour ce lot. Les cibles sœurs et le bouton viendront ensemble dans UX03.
7. Garder la sidebar web et les routes. Ne pas retirer les adaptations natives de safe area/scroll.

## Critères d'acceptation

- La maison est atteignable avant la longue liste sur compact et large.
- Les mêmes cartes et textes sont présents sur les deux formats.
- Les favoris ne sont pas dupliqués dans les groupes « All rooms » ; filtrer une pièce conserve le comportement actuel.
- État cache/erreur/absence de données compréhensible sans une couleur seule.
- Aucun débordement à 320/430/768/1440 ; zoom Chrome 200 % et grands noms restent utilisables.
- Un clic de carte ouvre uniquement le détail. Aucune nouvelle commande.

## Validation et livraison

```sh
npx jest --runInBand src/screens/__tests__/HomeScreen.test.tsx src/components/__tests__/EntityCard.test.tsx src/core/__tests__/deviceSummaries.test.ts
npm run typecheck
npm run lint
npm run format:check
npm run check:ui
```

Ajouter seulement les assertions de comportement nécessaires au nouvel ordre/accessibilité, pas des snapshots de chaque style. Comparer les captures **publiques** avant/après à 430 et 1440. La vérification sur téléphone à grande police appartient à UX09, sans déclarer la simulation Chrome équivalente.

Actualiser M03 dans le backlog avec la mention « présentation livrée, action directe restante ». Ne pas marquer M03 complet. Lot suivant : UX02 puis UX03.
