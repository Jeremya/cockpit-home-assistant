# House Control — idées à reprendre et limites à éviter

Revue du 19 octobre 2026 pour le desktop Maurice et D03.

Référence : [`88c84cca77fc12f9297dc91ba28ce58bc9f316d7`](https://github.com/0xProbabillity/house-control/tree/88c84cca77fc12f9297dc91ba28ce58bc9f316d7), toujours la tête distante de `main` vérifiée pendant cette revue. Cette révision était déjà référencée dans nos docs ; les constats ci-dessous proviennent d'une nouvelle lecture du code et de vérifications dans Chrome.

Périmètre : UI, styles, moteur, géométrie, matériaux/mobilier, store, bridge, éditeur et lecture ciblée du client HA. La démo web a été exécutée sur Chrome 155.0.8059.85, à 1440 × 1000, dans un contexte isolé sans bridge natif. Les requêtes de page hors du serveur local étaient bloquées. Aucun appareil réel n'a été utilisé. Les clients Swift et leurs intégrations n'ont pas été exécutés ; ceci n'est ni un audit complet ni une mesure de performances natives.

## Recommandation

Le meilleur apport de House Control est sa cohérence entre représentation de la maison, sélection d'une pièce, tuiles et détail. Pour Maurice, reprendre cette grammaire visuelle et quelques algorithmes ciblés, en conservant le modèle d'observation, les commandes, les identités et les composants Expo partagés.

Leur interface navigateur est une prévisualisation de l'interface embarquée dans une coque Swift. Les commandes web sans bridge ne pilotent aucun appareil. Cela ne remplace donc pas notre connexion HA fonctionnelle dans Chrome. Le mode navigateur observé reste une carte de 440 px, même dans une fenêtre de 1440 px : notre vrai workspace en deux panneaux est une adaptation produit utile.

Sources : [bridge](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/bridge.js), [styles](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/style.css).

## Ce qui mérite d'être repris

| Idée vérifiée dans le code | Adaptation pour Maurice | Moment |
| --- | --- | --- |
| Cadrage des huit coins d'une boîte selon l'angle, le FOV et la partie visible du viewport ; marges pour les panneaux superposés | Extraire un calcul pur adapté à nos polygones. Utiliser la taille réelle du panneau, conserver le yaw au resize, tester les projections aux bornes | D03 caméra |
| Caméra avec pose courante et pose cible, interpolation dépendant du temps, arrêt quand elle atteint sa cible | Transition courte et annulable ; passage immédiat en reduced motion. Réutiliser OrbitControls pour les gestes si suffisant, avec un seul propriétaire de la pose | D03 caméra |
| Géométrie de sélection distincte du petit objet dessiné ; priorité aux appareils devant le sol | Agrandir la zone de sélection des marqueurs, ouvrir le détail, rendre l'appareil également accessible par la liste. Un clic spatial ne commande rien | D03 interactions |
| Survol d'un objet : nom, état et léger accent visuel | Ajouter le même retour sur focus clavier et éventuellement une mise en évidence temporaire de la tuile correspondante. Le survol ne change ni filtre ni sélection durable | D03 finition |
| État principal lisible, détails secondaires discrets, chiffres de largeur fixe, groupes par pièce | Nom complet ou repli sur deux lignes, valeur principale, pièce, état qualifié, action séparée. Réutiliser `presentDevice` et nos tokens ; hauteur libre pour grandes polices | D03 tuiles |
| Le panneau masqué devient `inert` pendant l'affichage du détail | Le contenu masqué ne doit plus recevoir Tab ou être annoncé. Compléter avec le focus initial et sa restitution, manquants dans leur flux | D03 panneau |
| Textures de parquet/carrelage générées en canvas, déterministes, coordonnées UV en mètres, matériaux partagés | Deux ou trois matériaux discrets, sans téléchargement d'images. Adapter les UV à nos polygones concaves ; définir clairement qui dispose les textures partagées | Finition après D03 fonctionnel |
| Meubles composés de primitives : boîtes arrondies, cylindres, matériaux réutilisés | Commencer par quelques silhouettes tirées des placements de mobilier existants. Les dimensions restent approximatives ; fixer un budget de géométrie et tester les appareils cibles | Après cadrage et mesures |
| Éditeur avec brouillon, validation, Undo/Redo et regroupement d'un déplacement en une seule étape | Bonne direction pour un futur éditeur desktop. Séparer géométrie, liens HA et permissions ; une annulation de placement n'annule jamais une commande physique | Après le MVP quotidien |

Sources : [caméra et picking](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/three/world.js#L94), [panneau](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/ui/panel.js), [matériaux procéduraux](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/three/kit.js), [mobilier](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/three/furniture.js), [historique d'édition](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/editor/editor.js#L103).

## Trois comportements reproduits à éviter

### 1. Le bouton de réglages peut commander la lampe au clavier

Dans la démo, placer le focus sur le premier bouton de réglages (`.tile-more`, lampe simulée `living.main`) puis appuyer sur Entrée :

- état avant : Off ;
- état après : On ;
- le détail ne s'ouvre pas.

Cliquer à la souris sur ce même bouton ouvre le détail sans modifier l'état.

Le bouton est imbriqué dans un conteneur `role="button"` dont le `keydown` traite Entrée/Espace comme une commande de lampe. Le `stopPropagation` du clic ne bloque pas cette propagation clavier.

**Pour Maurice :** conserver les deux cibles sœurs prévues dans D03. Ajouter un test clavier qui vérifie l'absence de commande lors de l'ouverture du détail, et un test du bouton de commande qui vérifie l'absence de navigation.

Source : [lightTile, gestion des clics et du clavier](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/ui/panel.js#L130).

### 2. Une absence de WebGL retire aussi les contrôles

En forçant l'indisponibilité de WebGL avant le chargement, la démo affiche « 3D view failed to start ». Il ne reste aucune tuile et aucun bouton dans la page.

`main.js` remplace tout le contenu de l'application lors de l'échec d'initialisation de `createWorld`.

**Pour Maurice :** monter le panneau indépendamment du moteur et garder le plan 2D utilisable pendant le chargement et après l'échec. Tester que les mêmes appareils, filtres et commandes restent accessibles quand WebGL manque.

Source : [initialisation et erreur fatale](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/main.js#L35).

### 3. Reduced motion ne désactive pas l'animation de caméra

Le contexte Chrome annonçait bien `prefers-reduced-motion: reduce`. Après extinction de tous les appareils simulés et stabilisation, aucune callback RAF n'a été observée pendant 500 ms. Le déclenchement de `world.intro()` a ensuite produit 31 callbacks RAF en 500 ms.

Ce comptage confirme une animation persistante dans cette condition ; ce n'est pas un benchmark FPS. La règle reduced motion raccourcit les animations CSS, mais la boucle de caméra JavaScript ne consulte pas cette préférence.

**Pour Maurice :** gérer la préférence dans le contrôleur de caméra lui-même. Tester l'arrêt des frames après cadrage et l'absence de transition en mode réduit.

Sources : [CSS reduced motion](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/style.css#L795), [intro et interpolation](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/three/world.js#L369).

## Limites constatées par lecture du code

Ces points n'ont pas tous été reproduits avec des intégrations natives.

- **Caméra différente de notre intention.** L'azimut est limité à ±40°, mais l'inclinaison varie de 26° à 70° ; ce n'est pas une rotation uniquement horizontale. Le facteur de zoom descend à 0,55 après le calcul de cadrage. Reprendre directement ces bornes ne garantit donc pas de garder l'étage entier visible. Notre inclinaison fixe et notre borne de cadrage sont des choix propres à Maurice. [Source](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/three/world.js#L16).
- **Les murs escamotés sont calculés à la construction.** Ils dépendent de la direction initiale `camDir`, pas d'une reclassification à chaque rotation. Leur identification utilise des pièces rectangulaires et des murs alignés sur les axes. Notre maison comprend plusieurs étages et des contours obliques/concaves : ne pas importer ce modèle géométrique. Commencer avec nos murs bas ; une future découpe doit utiliser une topologie adaptée. [Source](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/three/house.js#L109).
- **État optimiste et délai silencieux.** `store.js` modifie l'état présenté avant l'envoi et revient en arrière sur rejet. Son délai de 20 secondes résout la promesse d'attente ; il ne produit pas à cet endroit un résultat « non confirmé ». Garder C01–C03 et le résultat explicite de commande ; un état souhaité ne devient pas une observation. L'idée de regrouper les changements de slider est intéressante pour de futurs contrôles continus, mais doit passer par notre ordonnanceur. [Source](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/store.js#L66).
- **Valeurs initiales et cache.** Les états sont restaurés depuis un stockage associé au nom de la maison ; la température AC a une valeur initiale estimée. Maurice doit conserver ses profils/identités stables, l'isolement de la démo et les qualifications inconnue/cachée. L'absence de mesure du distributeur ou d'un mineur ne doit jamais être comblée par une valeur plausible. [Source](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/store.js#L15).
- **L'on-demand peut redevenir continu.** `ACUnit.update()` retourne actif tant que le souffle est visible : la boucle continue alors de rendre. Le moteur demande aussi un GPU haute performance, du bloom et des ombres. Reprendre l'éclairage lisible, puis mesurer chaque effet ; préférer un indicateur statique tant qu'une animation n'apporte pas d'information utile. [AC](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/three/ac.js#L131), [moteur](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/three/world.js#L23).
- **Un geste spatial peut avoir un effet physique.** Dans `main.js`, le clic d'une lampe dans la scène appelle le toggle du store. Pour D03, un marqueur ouvre un détail ; seule l'action explicitement nommée de la tuile ou du contrôle envoie une commande. Même séparation pour les futurs gestes glisser/maintenir. [Source](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/main.js#L78).
- **Densité prévue pour un popover.** Leur carte navigateur est fixée à 440 px, les noms sont ellipsés et le viewport HTML interdit le zoom mobile. Adapter les proportions à notre workspace et garder les grandes polices, le zoom navigateur et les noms lisibles. Le style compact ne justifie pas de reprendre ces contraintes. [Styles](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/style.css#L61), [viewport](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/index.html).

## Frontières d'architecture à garder

```text
HA → backend/session → observations et préférences
                       ↓
             sélecteurs et présentateurs partagés
                       ↓
           tuiles / détail / plan 2D / scène 3D

bouton explicite → hook de commande partagé → façade vérifiée → HA
sélection spatiale → navigation, sans appel de service
```

Le partage de composants concerne le contenu, les règles et les contrôles. Le workspace desktop organise ces composants selon sa largeur disponible ; il n'a pas besoin d'un deuxième store HA, d'un bridge Swift ou d'intégrations Tuya/Hue directes. Les fonctions AI, scènes globales et widgets amont sont des extensions de leur produit, pas des dépendances de D03.

Pour les futurs contrôles, reprendre l'idée de montrer uniquement les capacités connues. Une capability d'affichage ne vaut pas une autorisation de commande : garder la politique d'enrôlement et la validation au moment de l'envoi.

## Reprises de code envisageables

Le dépôt porte une [licence MIT](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/LICENSE). Pour une reprise de code identifiable, conserver la notice de copyright et de licence, référencer la révision amont et documenter les adaptations.

- Bon candidat : adaptation de `fitDistance` en fonction TypeScript pure, si elle simplifie réellement notre cadrage existant.
- Bon candidat : petits générateurs de textures/mobilier, avec propriété et libération des ressources explicites.
- À réécrire dans nos composants : composition visuelle des tuiles, survol/focus, détails progressifs et états actifs.
- À conserver chez nous : modèle de domaine, session HA, captures de cibles, permissions, suivi des commandes, fallback et tests mobiles.

Aucun code de House Control ni asset amont n'a été intégré à l'application pendant cette revue. Le clone, la démo, les scripts de vérification et captures restent dans `.local/`.

## Priorité proposée pour D03

1. **Usage :** tuiles compactes avec action sœur, panneau de détail partagé, sélection cohérente et clavier.
2. **Maquette :** cadrage fiable, angle fixe, transitions annulables, 3D par défaut, repli 2D qui préserve les commandes.
3. **Finition :** surfaces sobres, halo d'état qualifié, survol/focus, quelques matériaux procéduraux.
4. **Après validation :** silhouettes de mobilier, puis éditeur à brouillon/Undo si l'usage le justifie.

Ajouter dès maintenant à la recette D03 les trois cas reproduits ci-dessus : ouvrir des réglages au clavier ne commande rien ; perdre WebGL conserve le panneau ; reduced motion supprime les animations du moteur.

Cette proposition complète la [revue de spec D03](2026-10-19-desktop-workspace-review.md). Elle ne change pas le statut des fonctionnalités ni le backlog.
