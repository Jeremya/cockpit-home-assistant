# UX05 — Une sélection cohérente entre maison et appareils

Statut : **implémenté et vérifié localement le 21 octobre 2026**. [Preuve](../stage0/desktop-validation.md#ux05--sélection-partagée--2026-10-21). D03 première tranche spatiale, **2D uniquement**. Les détails restent les routes partagées.

## Lire

`HomeScreen`, `HousePlanScreen`, `FloorPlanView`, `spatial/{plans,selectors,placements,navigation}.ts`, `preferences/types.ts` et leurs tests. `setAreaLink` conserve actuellement une relation zone HA → une pièce maximum ; ne pas introduire une relation multiple.

## Nouveaux modules proposés

- `src/spatial/homeSelection.ts` : types et fonctions pures.
- `src/components/HomePlanOverview.tsx` : plan, choix d'étage, commandes de sélection. Reçoit les données et callbacks ; pas de nouveau store.
- `HomeViewProvider.tsx` possède une unique session UI en mémoire, rattachée à `useHousePlan().identity`, consommée par Home au-dessus du composant visuel. Chrome a reproduit un remontage du layout racine sur Back : un `useState` de route ou de layout perdait la sélection. La session conserve uniquement les IDs et la sélection, ne persiste rien et se réconcilie avec le store même quand Home est absent. Aucun second store d’observations HA. Les tests injectent une session jetable.
- Sur compact, le plan interactif se déplie à la demande ; une pièce sélectionnée est montrée au retour. Sur large, il reste visible. Les appareils gardent les mêmes cartes et commandes.

```ts
type HomeSelection =
  | { kind: "all" }
  | { kind: "area"; areaId: string }
  | { kind: "unassigned" }
  | { kind: "planRoom"; floorId: string; roomId: string };
type HomeViewState = {
  identity: string; // profile + plan id + revision, fourni par useHousePlan
  floorId: string;
  selection: HomeSelection;
};
```

Fonctions à créer, avec paramètres typés à partir des modèles existants :

- `reconcileHomeSelection(state, plan, snapshot)` ;
- `selectHomeArea(state, areaId, plan, links)` ;
- `selectHomeRoom(state, floorId, roomId, plan)` ;
- `selectHomeFloor(state, floorId, plan)` ;
- `selectedHomeRoom(state, plan, links)` et filtrage des `DeviceSummary` via zones résolues.

Ne pas reconstruire le mapping entité/zone : réutiliser `spatial/selectors.ts` et `DeviceSummary.roomIds`.

## Transitions décidées

| Événement | Résultat |
| --- | --- |
| Profil / plan ID / révision change | premier étage, `all`, aucun détail/callback de l'ancien scope |
| Sélection zone liée | filtre area ; aller à son étage unique et surligner sa pièce |
| Zone sans lien | filtre utile conservé ; étage inchangé, aucun surlignage, texte « No linked plan room » |
| Pièce liée cliquée | `planRoom` ; filtrer ses appareils via le lien existant |
| Pièce sans lien | la sélectionner ; état vide « Room not linked », accès à `/house-links`, aucun matching par nom |
| Changement explicite d'étage | nouvel étage et `all` |
| All / No room | effacer le surlignage, conserver l'étage |
| Zone supprimée dans un registre **fresh** | retour à `all` |
| Registre absent/cached pendant reconnexion | conserver l'intention, afficher la qualification ; ne pas effacer à chaque resync |
| Pièce supprimée du plan courant | retour à `all` |
| Ouverture d'un appareil/d'une lecture | route actuelle via les fonctions gardées ; ne pas changer sélection/étage |
| Retour depuis détail / resize | sélection conservée tant que l'identité ne change pas |

Appareil multi-zones : une carte dans « All », visible dans chaque filtre correspondant. Le compteur compte des groupes d'appareils, pas leurs 23 lectures. Ne pas étendre ici les compteurs « On » à des domaines non vérifiés.

## Intégration

1. Tester le reducer/helpers avec sample + fixtures de zones, sans JSX.
2. Brancher les chips Home et la sélection du `FloorPlanView` sur le même état. Adapter `HousePlanCard`/`HomePlanOverview` sans Pressable parent autour d'un plan interactif.
3. Offrir une commande clavier/tactile nommée pour **chaque pièce du plan**, y compris non liée. Le SVG reste décoratif pour le lecteur d'écran.
4. Ajouter des marqueurs via `savedPlacements`. Le clic utilise `openPlacement` et son contexte profile/plan/floor ; ne pas réécrire sa validation dans Home.
5. Conserver l'attention globale hors du filtre. Aucun marqueur ou sélection ne commande un appareil.
6. Au démontage/changement d'identité, invalider les callbacks retardés comme `HousePlanScreen`. Ne pas refactorer le retour de focus M00 pendant ce lot.

Les filtres ne sont pas encodés dans l'URL pour cette tranche. Seuls les détails utilisent les routes existantes. Pas de nouvelles entrées Home dans l'historique au clic d'une pièce.

## Recette

Tests `homeSelection` + Home : toutes les transitions ci-dessus, noms identiques/IDs différents, multi-zones, registre temporairement absent, suppression définitive, callback ancien.

Chrome : sample aux formats 430/1440, plan ↔ chip, pièce non liée, changement d'étage, détail → Back, profil démo → autre fixture ; aucun service lors d'une sélection. Conserver les tests P03/P04/M00 et le smoke public existant. Vérifier le fallback en absence de snapshot.

Terminé : sélection 2D cohérente sur les deux tailles. Aucune affirmation de 3D par défaut à ce stade.
