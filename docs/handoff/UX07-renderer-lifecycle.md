# UX07 — Préserver le repli et libérer le moteur web

Statut : à faire après UX05. Pas encore de caméra maquette ni de 3D par défaut.

## Problème à résoudre avant UX08

`CockpitSceneView` conserve aujourd'hui son erreur dans son état local et `visible=false` **suspend** le rendu sans démonter le moteur. Démonter toute l'enveloppe pour libérer WebGL effacerait l'erreur et pourrait relancer un chargement à chaque retour.

Lire `CockpitSceneView`, `CockpitScene`, `HousePlanScreen`, leurs tests et [le contrat S02](../design/spatial-view.md).

## Propriété décidée

Séparer :

1. **Sélection** : propriétaire Home créé par UX05.
2. **Préférence de vue** `auto | 2d | 3d` et **échec de tentative** : état de l'enveloppe spatiale, clé profil + plan ID + révision. Pas dans le canvas.
3. **Renderer monté** : seulement si la vue effective est 3D et la route web/document sont actifs.
4. **Renderer visible** : condition supplémentaire de viewport ; hors viewport, suspension, pas nécessairement démontage.

Ne pas créer un second état global d'observations. Un état de vue local à la route suffit ; aucune persistance de la préférence entre sessions n'est exigée.

## Étapes bornées

1. Ajouter à `CockpitSceneView` un contrôle explicite du montage du renderer (par exemple `mountRenderer?: boolean`, défaut `true`). L'enveloppe et son échec restent montés quand le canvas ne l'est pas.
2. Sur web, la route perdant le focus, le choix 2D ou le document caché démontent le renderer. Un scroll hors champ suspend seulement les frames. Native conserve les règles S02 existantes.
3. Le plan 2D et la liste sont utilisables **pendant le chargement**. Éviter deux couches de cibles simultanément actives après le premier rendu 3D.
4. Échec d'initialisation, watchdog ou perte de contexte : 2D, mêmes étage/pièce/marqueurs, aucune perte des appareils/commandes. Pas d'essai automatique au resize, retour de visibilité ou nouvelle observation.
5. Seul « Retry 3D view » démarre une nouvelle tentative dans le même scope. Une nouvelle identité de profil/plan constitue un nouveau scope. Changer seulement d'étage ne réarme pas l'échec.
6. Étendre les guards de callbacks à l'identité et au numéro de tentative : un `onReady` tardif d'un renderer détruit n'annule jamais une panne récente.
7. Appliquer la règle de montage à **Home et `/house`**, puisque Expo peut garder une route cachée en mémoire.

Tous les points d'entrée respectent `buildFeatures.spatial3d` (`src/config/build.ts`) : si désactivé, aucune préférence ni action ne monte un renderer.

Ne pas supposer que `document.hidden` existe côté natif. Utiliser un petit hook/adaptateur `.web` pour la visibilité navigateur si nécessaire. L'enveloppe commune possède les décisions et le renderer DOM ne reçoit que des props sérialisables/callbacks gardés.

## Tests et instrumentation

- Tests d'enveloppe : loading → ready, échec → 2D, hide/show sans nouvel essai, Retry explicite, callback ancien ignoré.
- Home 3D → `/house` → Home, bascule 2D, onglet caché/visible : **au plus un contexte vivant**, ressources de l'ancien renderer disposées avant une nouvelle instance active. Si la transition de navigation chevauche deux focus, corriger l'ordre de démontage ; ne pas se contenter de rendre le second invisible.
- Compter séparément renderer créé/disposé et frames rendues. Zéro frame ne prouve pas la destruction du contexte.
- Pas de listeners/RAF/watchdog restants après démontage. Conserver les tests de ressources et markers.
- WebGL absent : plan, chips, détail et boutons de commande démo restent utilisables.

Les compteurs de vérification doivent être bornés et sans IDs privés. Réutiliser `FrameStats` dans `src/web/sceneModel.ts` et `onMetrics` si possible ; ne pas exposer un backend HA sur `window`.

Terminé : cycle de vie et fallback validés en mode 3D **choisi manuellement**. Conserver le défaut 2D jusqu'à UX08. Mettre à jour le contrat S02 avec la distinction navigateur/natif, sans réattribuer les anciennes mesures.
