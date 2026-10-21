# UX06 — Calculer le cadrage maquette avant de toucher au moteur

Statut : **implémenté et vérifié localement le 21 octobre 2026**. `modelCamera.ts` et ses tests de projection sont livrés ; aucune modification visible de caméra. [Preuve](../stage0/desktop-validation.md#ux06--cadrage-maquette-pur--2026-10-21).

## Lire et créer

Lire `frameCamera` dans `src/web/CockpitScene.tsx`, `src/spatial/scene.ts` et `src/web/__tests__/sceneModel.test.ts`.

Créer `src/web/modelCamera.ts` et `src/web/__tests__/modelCamera.test.ts`. Ils peuvent utiliser les classes mathématiques Three déjà installées ; aucun renderer, DOM ou import de HA. Aucune nouvelle dépendance.

## Paramètres décidés pour la première passe

- FOV vertical : **26°**.
- Élévation au-dessus du plan horizontal : **48°**, fixe.
- Azimut de référence : **35°**, dans un fichier de présentation ; pas de champ ajouté au JSON de plan.
- Rotation : référence ± **40°**.
- Facteur de distance : **1 à 1,25** du fit. Jamais `0,6 × fit`.
- Marge : 20 CSS px minimum plus une réserve de 10 % par bord ; vérifier le viewport utile positif avant le calcul.
- Transition cible : 220 ms, posée et annulée par UX08. Le module pur ne possède pas de RAF.

Contrat de cadrage : en vue globale, contenir l'étage ; en sélection, contenir la pièce. Le reste de l'étage peut alors sortir du champ. Les dimensions des murs/marqueurs utilisés dans les bounds sont des dimensions de rendu, pas des mesures de la maison.

## API proposée

```ts
type ModelCameraInput = {
  bounds: { min: [number, number, number]; max: [number, number, number] };
  viewport: { width: number; height: number };
  yaw: number;        // radians, absolu
  zoomFactor: number; // distance normalisée, >= 1
};
// Retourner null si aucune taille de viewport exploitable.
fitModelCamera(input): { target; position; fitDistance; yaw; zoomFactor; near; far } | null;
clampModelYaw(yaw): number;
```

Les types `target`/`position` peuvent être des tuples ou `Vector3`, mais choisir une seule convention et la documenter. Le calcul ne doit pas muter ses arguments. Entrée non finie, bounds inversés ou viewport trop petit pour les marges : retourner `null`, pas une pose contenant des NaN.

## Calcul à implémenter

1. Centre `c` de la boîte et huit coins `p`.
2. Direction sortante de la cible vers la caméra :
   `d = (sin(yaw) cos(elevation), sin(elevation), cos(yaw) cos(elevation))`.
3. `right = normalize(worldUp × d)` ; `up = normalize(d × right)`.
4. Pour chaque `v = p - c`, calculer `x = dot(v,right)`, `y = dot(v,up)`, `z = dot(v,d)`.
5. La profondeur caméra vaut `distance - z`. Avec les tangentes des demi-FOV et les fractions utiles `qx/qy`, choisir au moins :
   `max(z + abs(x)/(tanHalfHorizontal*qx), z + abs(y)/(tanHalfVertical*qy), z + nearMargin)`.
6. Prendre le maximum sur les huit coins ; appliquer le facteur normalisé borné et une distance minimale strictement positive ; `position = c + d*distance`.
7. Déduire les plans de clipping des profondeurs min/max avec une marge : `near > 0` inférieur à la profondeur minimale et `far` supérieur à la maximale. Ne pas conserver aveuglément le far=500 du renderer si les bounds calculés le dépassent.

`tanHalfHorizontal = tanHalfVertical * aspect`. Définir `qx/qy` avec les marges en pixels rapportées au **viewport réel du canvas**, pas à la fenêtre globale. Les labels écran restent gérés par `labelLayout.ts` ; ne pas prétendre les contenir avec la seule boîte monde.

## Tests qui prouvent le résultat

Projeter les coins avec une vraie `PerspectiveCamera`, puis vérifier leurs coordonnées NDC dans la zone utile et entre near/far. Tester :

- yaw minimum/centre/maximum et plusieurs valeurs intermédiaires ;
- vue globale et pièce excentrée, boîte haute, géométrie dégénérée ;
- canvas 280×320, 430×300, 900×500 et 1600×700 ;
- zoom 1 et 1,25, entrées hors bornes ;
- resize conservant yaw et facteur normalisé, avec nouveau fit ;
- viewport nul/valeur non finie : aucun NaN/Infinity envoyé au moteur ;
- origine/translations différentes : même géométrie de projection.

Un simple `expect(distance).toBeGreaterThan(...)` ne valide pas le cadrage.

```sh
npx jest --runInBand src/web/__tests__/modelCamera.test.ts
npm run typecheck
npm run lint
npm run format:check
```

Terminé : fonctions pures et projection prouvée. Le moteur courant est inchangé. Suite : UX07 puis UX08.
