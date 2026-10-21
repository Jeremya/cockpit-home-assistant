# UX08 — Brancher la caméra maquette, puis activer le défaut desktop

Statut : implémenté et mesuré sur Chrome Mac le 21 octobre 2026 ; défaut desktop activé après recette opt-in. [Mesures et limites](../stage0/desktop-validation.md#ux08--caméra-maquette-desktop--2026-10-21). UX09 conserve la recette du candidat natif et l’usage réel.

## Code et props

Étendre `CockpitSceneView` et le payload de `CockpitScene` avec `cameraMode?: "orbit" | "model"` ; défaut `"orbit"`. Passer les mêmes sélection/marqueurs d'UX05. Native et le laboratoire gardent orbit par défaut.

Le calcul d'UX06 est l'unique propriétaire du fit en mode model. Ne pas appeler en parallèle l'ancien `frameCamera`, qui réinitialise la direction au resize.

## Passage 1 — Interaction maquette opt-in

1. Essayer d'abord OrbitControls déjà installé : pan interdit, damping/autoRotate désactivés, min/maxPolarAngle égaux à `π/2 − elevation`, azimut borné autour de la référence. Aucun remplacement par une nouvelle bibliothèque.
2. Sur rotation/zoom, appliquer le nouveau fit, ses plans near/far et le facteur de distance borné. Si la gestion du zoom natif d'OrbitControls entre en conflit avec le fit, désactiver son zoom et traiter le facteur normalisé dans un seul contrôleur. Ne pas laisser deux propriétaires écrire la caméra.
3. La pièce sélectionnée détermine les bounds. Retour à l'ensemble restaure les bounds de l'étage **et** yaw de référence/facteur 1. Un resize conserve le yaw/facteur courants.
4. Transition 220 ms vers la pose cible, depuis la pose courante. Une nouvelle sélection remplace la cible. Geste manuel, resize, étage, blur, perte de contexte et démontage annulent/recalculent la transition.
5. Avec reduced motion, affecter immédiatement la pose et rendre une frame. Consulter la préférence du moteur DOM, pas seulement une règle CSS.
6. Rendre à la demande : la transition demande des frames uniquement jusqu'à convergence ; une observation actualisée ne recentre pas la caméra et ne lance pas une animation.
7. Conserver `classifyGesture` : un drag ne sélectionne pas une pièce. Marqueur → détail gardé ; pièce → sélection ; vide → événement explicite `onOverview` validé par le propriétaire.

## Clavier et focus

- Conteneur de scène tabulable, nom accessible, contour de focus visible.
- Gauche/Droite : pas de 5° et bornes UX06 ; uniquement si le conteneur de scène est lui-même ciblé. Aucune interception depuis un input, un bouton ou la page entière.
- Échap dans la scène revient à l'ensemble. Si une confirmation/menu traite déjà Échap, elle consomme l'événement ; les routes de détail gardent leur navigation existante.
- Les contrôles nommés de pièce/étage restent la voie clavier et lecteur d'écran complète. Pas de commande par marqueur.

## Passage 2 — Défaut adaptatif

Après validation de la caméra et du cycle de vie :

- `auto` → model/3D sur **web ≥ 1024 CSS px**, 2D sur compact/natif ;
- choix explicite 2D/3D conservé dans le scope courant ; passer un breakpoint ne réinitialise ni sélection ni choix explicite ;
- une panne garde le fallback UX07 même si `auto` préférerait la 3D ;
- le même module spatial et les mêmes cartes restent utilisés. Pas de branche `DesktopHome` recréant la logique.

Ne pas activer `buildFeatures.spatial3d` sur les APK Trial par ce ticket. Le navigateur et le binaire accepté sont deux décisions différentes.

## Style autorisé dans ce lot

Palette existante, lumière ambiante/directionnelle, murs bas actuels et sélection lisible. **Pas** de murs automatiquement escamotés, halo On/Off, nouveau mobilier, textures, bloom ou ombres dynamiques. Ces effets ne doivent pas masquer une erreur de fit.

## Recette requise

1. Tests math UX06 et enveloppe UX07 inchangés.
2. Chrome public : 430, 1024, 1280, 1440, zoom 200 %, resize pendant une transition, pièce excentrée, deux bornes de yaw, zoom min/max, clavier et reduced motion.
3. Forcer WebGL absent/context loss : commandes, liste, sélection et 2D restent utilisables ; pas de boucle de retry.
4. Mesurer sur Chrome réel du Mac : modèle sample puis plan local complexe (captures privées).
   - premier frame utilisable cible ≤ 3 s, trois ouvertures mesurées avec scénario/cache indiqué ;
   - interaction continue 10 s, trois répétitions, cible médiane ≥ 30 fps ; documenter viewport, DPR, GPU, nombre de marqueurs ;
   - après stabilisation, observer 2 s : pas de rendu continu ;
   - document caché/route inactive : aucun rendu ; renderer détruit conformément à UX07.
5. Garder la 3D opt-in si le budget échoue. Une capture ou une CI headless ne valide pas les performances.

Terminé : défaut desktop 3D accepté sur le matériel mesuré, fallback durable, aucune régression native attribuée par extrapolation. La fonctionnalité « panneau de détail D03 » reste différée.
