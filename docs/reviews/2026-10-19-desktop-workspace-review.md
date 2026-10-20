# D03 — revue avant implémentation

Revue du 19 octobre 2026 de la [spec D03](../superpowers/specs/2026-10-19-desktop-workspace-design.md), révision `42d833d37a9caac5d58bb0f749a0a91a128342af`, confrontée au code de D01. D03 n'est pas encore implémenté : les points ci-dessous sont des contradictions ou des contrats manquants, pas des bugs reproduits dans une nouvelle interface.

## Avis

La direction produit est adaptée : maquette 3D par défaut sur desktop, panneau de détail, commande directe explicitement autorisée, états observés et résultats de commande séparés. Le mode mobile peut conserver sa présentation actuelle tout en partageant les sélecteurs, contenus, contrôles et moteur.

Je recommande d'amender la spec avant l'implémentation. Les deux premiers points conditionnent l'architecture ; les suivants doivent avoir des critères d'acceptation explicites.

## 1. P1 — le zoom contredit la garantie de cadrage

**Spec : lignes 103–107.** À `0.6 × distanceFit`, une caméra se rapproche au-delà du cadrage calculé : le contour peut sortir de l'écran. Le cadrage doit aussi tenir compte du yaw, pas seulement du redimensionnement. Le `frameCamera` actuel de `src/web/CockpitScene.tsx` utilise une direction fixe et réinitialise la position ; le réutiliser tel quel effacerait la rotation à chaque resize.

**Contrat proposé :**

- En vue globale, garantir le cadrage de l'étage ; en vue rapprochée, garantir celui de la pièce sélectionnée. Le reste de l'étage peut alors être hors champ.
- Calculer la distance minimale pour la cible, le yaw, le FOV et la taille réelle du panneau. Inclure une marge et les hauteurs de rendu. Borner le zoom par cette distance ; supprimer la borne `0.6 ×` si le cadrage intégral est impératif.
- Préserver le yaw et un facteur de zoom normalisé lors du resize, puis appliquer les bornes. Préciser si « Vue d'ensemble » restaure aussi l'angle initial.
- Annuler/recalculer une transition sur nouvelle sélection, rotation manuelle, changement d'étage, resize, masquage ou démontage. Une mise à jour d'observation ne recentre pas la caméra.
- Tester la projection des coins aux deux limites de rotation, avec panneaux étroits/larges, zoom minimal/maximal et sélection de pièce. Un simple test de valeurs numériques bornées ne prouve pas le cadrage.

**Simplification technique :** ne pas imposer le remplacement d'OrbitControls avant d'avoir essayé sa configuration. La version installée expose déjà les bornes d'azimut, les angles polaires min/max, les distances et `enablePan`. Une inclinaison fixe se configure avec deux angles polaires égaux. Ajouter un contrôleur de cadrage/transition testable et un gestionnaire clavier local peut suffire ; conserver damping et autoRotate désactivés. Les contrôles sont décrits dans la [documentation Three.js](https://threejs.org/docs/pages/OrbitControls.html).

## 2. P1 — URL, historique et scène unique ne sont pas encore conciliés

**Spec : lignes 90–93 et 118.** Décrire des query params ne définit pas une pile de navigation. `router.setParams` ne crée pas d'entrée d'historique ; utiliser des `push` de Home peut créer plusieurs écrans retenus et remettre en cause la sélection/caméra conservée. La [documentation Expo Router](https://docs.expo.dev/router/reference/url-parameters/) distingue ces comportements.

**Contrat proposé :**

- Définir une navigation de panneau typée : liste → appareil → lecture, avec cible, profil et origine. Préciser ce qui est encodé dans l'URL et comment le parent d'une lecture est retrouvé.
- Choisir explicitement les opérations push/replace/back et les vérifier dans un prototype navigateur avant le reste du panneau. Retour et Avancer doivent fonctionner sans créer une nouvelle scène à chaque appareil.
- Une fermeture depuis un lien direct doit revenir à la liste dans l'application, même sans entrée précédente créée par Maurice.
- Préciser le comportement d'une URL de détail après rechargement sans token en mémoire, après changement de profil et après passage sous 1024 px. La cible ne doit jamais être réinterprétée dans un autre foyer.
- Tester liste → appareil A → lecture → Retour → Retour → Avancer, ainsi que l'arrivée directe, le reload et le resize. Vérifier à la fois URL, sélection, focus et nombre de contextes WebGL vivants.

## 3. P2 — Échap a deux propriétaires ; le retour du focus manque

**Spec : lignes 13, 92, 104 et 106.** Échap ferme un détail et réinitialise la caméra selon deux sections différentes. Sans priorité commune, un seul appui peut faire les deux et perdre le contexte de la pièce.

**Contrat proposé :**

- Une action par appui : d'abord fermer une confirmation annulable éventuelle, sinon remonter d'un niveau de détail, sinon revenir à la vue d'ensemble.
- Le gestionnaire qui traite l'événement le consomme. Aucun gestionnaire de caméra global sur `window` ne doit intercepter les flèches dans les champs, boutons ou menus.
- Le conteneur de scène doit être atteignable par Tab, nommé et avoir un focus visible. Gauche/Droite ne tournent la caméra que lorsque ce conteneur est ciblé.
- Offrir une sélection clavier de toutes les pièces du plan, y compris celles sans lien HA. Les puces prévues ne couvrent que les zones ayant des appareils ; elles ne remplacent donc pas entièrement la liste accessible du plan actuel.
- À l'ouverture, placer le focus sur le titre du détail. Au retour, restaurer la tuile/lecture d'origine ; si elle a disparu, utiliser le titre de liste.
- Le clic vide nécessite un événement explicite remonté au propriétaire de sélection. Aujourd'hui `onRoomPress` accepte seulement un ID et un clic hors pièce ne produit rien. Ajouter une action de retour à l'ensemble, protégée comme les callbacks existants contre un rendu obsolète.

## 4. P2 — préciser le modèle de sélection et sa durée de vie

**Spec : lignes 53–66.** La spec prévoit plusieurs pièces et étages pour une seule zone HA. P03 impose actuellement une zone HA liée à au plus une pièce : `setAreaLink` supprime l'ancien lien et `planRoomForEntity` retourne le premier. `FloorPlanView` et `CockpitScene` n'acceptent qu'une pièce sélectionnée.

Pour D03, conserver ce contrat 1:1 est le choix le plus court. Sinon, annoncer une évolution distincte de P03 et des deux moteurs, avec une règle de cadrage de plusieurs pièces.

Compléter aussi les transitions :

- L'état de vue est rattaché à l'identité profil + plan + révision, comme dans `HousePlanScreen`, pas uniquement au profil.
- Changer explicitement d'étage efface ou transforme la sélection selon une règle écrite ; le panneau ne doit pas rester filtré sur une pièce invisible par accident.
- « All » et « No room » effacent le surlignage. Une zone HA sans lien garde un filtre utile mais affiche un état spatial explicite.
- Distinguer un registre temporairement indisponible d'une zone réellement supprimée ; ne pas jeter une sélection à chaque resynchronisation.
- Préciser l'action d'un marqueur : ouverture de lecture dans le panneau avec les mêmes contrôles d'identité et de placement que le plan existant, sans modifier implicitement le filtre.

## 5. P2 — le démontage fait perdre le choix de vue et la panne

**Spec : lignes 97 et 118.** `CockpitSceneView` conserve sa panne dans un état local. Son état `visible=false` suspend aujourd'hui le rendu sans démonter le moteur. Le démonter intégralement à chaque changement d'onglet réinitialiserait cet état : après un échec WebGL, chaque retour pourrait relancer automatiquement une tentative de dix secondes.

**Contrat proposé :**

- Séparer le choix utilisateur 2D/3D, la disponibilité/erreur 3D et la présence effective du moteur. Garder choix, erreur et sélection dans un propriétaire qui survit au démontage du canvas.
- Après un échec, conserver le repli 2D jusqu'à « Réessayer la 3D » selon une durée de vie explicitement définie. Le retour de visibilité ne vaut pas un nouvel essai.
- Conserver un plan 2D et le panneau utilisables pendant le premier chargement. Les commandes ne dépendent jamais du démarrage WebGL.
- Appliquer la règle du contexte unique aussi à `/house` au retour vers Home : la route existante peut rester montée en arrière-plan. Masquer son rendu ne libère pas son contexte.
- Au démontage, annuler aussi l'animation de cadrage, les événements clavier et les callbacks retardés. Tester absence de rendu et absence de contexte vivant séparément.
- Sur la disposition en une colonne, suspendre le rendu lorsque le plan sort du viewport, comme le fait déjà l'écran du plan.

## 6. P2 — extraire le contenu ne suffit pas à l'intégrer dans le panneau

**Spec : lignes 86 et 90–91.** `SummaryContent` utilise `useResponsiveLayout().desktop`, donc la largeur de la fenêtre entière. Dans un panneau de 380–440 px sur une grande fenêtre, il garderait deux colonnes internes très étroites. Ses `EntityCard` appellent aussi directement `openReading`, qui pousse une route extérieure.

**Contrat proposé :**

- Le contenu partagé reçoit une présentation compacte ou mesure sa largeur disponible ; le panneau organise le scroll. Éviter un écran complet avec son propre ScrollView imbriqué sans règle.
- Injecter la navigation (`onOpenReading`, et les autres sorties de détail utiles) tout en gardant la validation de cible. Les routes natives gardent leurs valeurs par défaut ; le workspace fournit l'ouverture dans son panneau.
- Appliquer cette navigation aux tuiles, lectures du résumé, éléments d'attention et marqueurs.
- Garder l'attention globale hors de la partie remplacée par le détail. Préciser son comportement sticky et son accès dans la disposition à une colonne, à 1024 px et à zoom navigateur 200 %.
- Corriger « only shared-code change » : le hook de commande, les contenus extraits et le moteur sont partagés. « Présentation native conservée, avec tests de régression » décrit mieux le périmètre.

## Compléments de contrat avant la finition visuelle

- **Halo des marqueurs :** `SceneMarker` ne contient ni état On/Off ni identité de switch primaire, et `sanitizeMarkers` élimine les champs supplémentaires. Définir un petit champ de présentation allowlisté, calculé hors du moteur à partir d'une observation qualifiée. Ne pas transmettre l'entité HA complète. Une condition cached/unknown/unavailable ne doit pas ressembler à un On confirmé ; la couleur d'attention garde sa priorité.
- **Azimut dans le plan :** ni `PlanFloor`, ni son validateur/normaliseur, ni `toSceneFloor` ne conservent actuellement `camera.azimuth`. Soit garder une configuration de présentation pour D03, soit préciser le niveau du champ, les unités, l'origine, le sens, les bornes et sa compatibilité avec les plans v1.
- **Murs escamotés :** `PlanLine` n'a pas de normale extérieure ni de classification intérieur/extérieur. « Face à la caméra » ne suffit pas à identifier les murs à masquer. Définir une règle géométrique testable pour les plans concaves ou reporter cet effet ; les murs bas existants permettent de livrer la caméra d'abord.
- **Mesures :** fixer le viewport, DPR, matériel, nombre de marqueurs, durée de rotation et seuil de premier affichage utilisable. Mesurer les images pendant un geste continu, puis l'arrêt des images après la transition. Une CI headless prouve les parcours et le fallback ; la fluidité doit être mesurée sur le Chrome réel du Mac.
- **Contrats existants :** mettre à jour M01 pour autoriser explicitement les commandes de carte via la façade commune, avec des cibles de pression sœurs. Mettre aussi à jour S02 pour distinguer la caméra mobile immédiate et la caméra desktop animée. Une mention générale de « garanties inchangées » ne remplace pas ces amendements.

## Découpage conseillé

1. **D03a — workspace utile :** sélection explicite, navigation de panneau, contenu partagé adapté à sa largeur, commande directe utilisant le hook commun, focus clavier. Le plan 2D permet de valider ces parcours indépendamment du GPU.
2. **D03b — maquette par défaut :** caméra contrainte, cadrage, animation annulable, 3D par défaut, cycle de vie et repli durable. Validation Chrome réelle.
3. **D03c — finition :** matériaux, sélection subtile et halo observé ; murs escamotés seulement après définition de leur géométrie.

Ces lots sont un ordre d'implémentation, pas un abandon de la 3D par défaut dans le résultat D03 demandé. Ils permettent de diagnostiquer séparément une régression de commande, de navigation ou de rendu.
