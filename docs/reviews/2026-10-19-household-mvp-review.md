# Maurice — revue du MVP du foyer, 2026-10-19

Périmètre confirmé par l’utilisateur : **usage quotidien dans sa maison**, sur Android. Cette revue évalue `2c496bea204ebcd34c127b231231eb2d9ed8b882`. Elle propose une séquence produit ; les lots ci-dessous ne sont pas des fonctionnalités déjà livrées. Le [statut](../README.md) et le [backlog](../BACKLOG.md) restent les points d’entrée.

## Verdict

Maurice dispose d’une alpha technique avancée : connexion HA, récupération, identités stables, préférences, plans, regroupement des appareils, commandes sémantiques, simulation et APK autonome. Le prochain investissement doit transformer ces fondations en **trois parcours quotidiens courts** : consulter l’essentiel, agir sur la lampe du salon et comprendre les informations du distributeur.

Le MVP proposé contient une maison personnalisée, les deux appareils déjà prouvés en lecture, une première action physique validée et une présentation soignée. Une vue 3D acceptée sur le téléphone du MVP apporte la partie visuelle ambitieuse. Les caméras, serrures, thermostats, scènes et nouveaux fournisseurs viennent après cette première boucle d’usage. Aucune réécriture d’architecture n’est justifiée.

## Ce qui existe et ce qui manque

| Domaine | État à la revue | Limite pour le MVP |
| --- | --- | --- |
| HA, récupération, stockage natif | Implémentés ; batterie autonome R03a acceptée sur les deux téléphones pour le build 1002 | Disponibilité quotidienne du serveur HA et observations sur plusieurs jours à établir |
| Home, pièces, favoris, détails | Implémentés ; cartes par appareil et interprétation prudente des états | Parcours encore longs, place importante prise par les explications techniques |
| Kasa HS103 et Petlibro PLAF103 | Deux appareils réels prouvés en lecture ; résumés natifs vérifiés | Aucune action physique Kasa acceptée ; batterie/alimentation et fiabilité temporelle du feeder encore à qualifier |
| Commandes C01–C04/C07a | Façade, sérialisation, suivi des observations et simulation livrés | Contrôle réel désactivé ; activation actuelle globale au modèle, sans autorisation par appareil |
| Plans P01–P04 | Plusieurs étages, liens vers les zones HA, positions persistantes, alternative accessible | Le candidat 1005 embarque le plan d’exemple ; placement des deux appareils dans la maison réelle non accepté par les preuves consultées |
| S02 production 3D | Code intégré ; preuve native Seeker enregistrée | 3D désactivée dans les APK Trial ; acceptation sur le candidat destiné au foyer à faire ; gate Pixel conservé pour cette cible |
| U01 | Diagnostics, libellés et grandes polices livrés ; build 1005 validé sur Seeker à 100/150/200 % | TalkBack manuel ouvert ; retour de focus web intermittent dans le dernier CI |
| Vérification | 596 tests / 39 suites au dernier checkpoint, six tests d’outillage, preuves protocole et export Android | Le dernier CI consulté échoue sur le smoke UI ; audit dépendances séparé toujours rouge |

Le nombre de tests décrit la couverture technique ; il ne mesure pas encore la valeur quotidienne. Les preuves par téléphone et par binaire ne s’additionnent pas en une certification de toutes les fonctionnalités.

## Constats prioritaires

### 1. Le retour de focus n’est pas encore stabilisé

Le [CI du commit 2c496be](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39265244591) passe le job tests/protocole/export Android et échoue sur le smoke navigateur à **430 px**, après un passage réussi à 320 px. Le journal indique `targetIsActive: false` et `documentFocused: true` après le retour du détail vers le marqueur. Cela ne permet pas d’attribuer ce cas à une fenêtre inactive. Le contrôle n’a pas retrouvé le focus pendant les dix secondes de l’assertion.

Une nouvelle exécution locale, sur le même commit propre, passe à 320/430/768, sans erreur de page ni requête externe, avec le plan local préservé. Les deux résultats doivent rester visibles. Un passage vert supplémentaire ne suffit pas à fermer cette intermittence.

Points à investiguer : `src/components/readingFocus.web.ts` termine si la cible manque/n’est pas connectée ; `HousePlanScreen.tsx` consomme la demande au retour de focus. Une disponibilité transitoire de la référence ou un événement de navigation ultérieur pourrait perdre la restauration. **Ce sont des hypothèses de lecture du code, pas une cause reproduite.** Reproduire avec des transitions/commits ralentis, observer la cible active et les références, puis corriger le cycle de vie sans supprimer l’assertion, augmenter aveuglément le timeout ou ajouter des réessais au test.

TalkBack reste une acceptation supervisée distincte : l’introduction Android a intercepté l’automatisation et l’utilisateur n’a pas pu écouter. Voir le [rapport U01](../stage0/diagnostics-accessibility-validation.md).

### 2. La première action réelle manque encore

`src/commands/switchControl.ts` conserve `KASA_SWITCH_CONTROL_ACCEPTED = false`. C’est cohérent avec l’absence d’acceptation physique. Passer simplement ce booléen à `true` rendrait éligibles les autres HS103 correspondant aux métadonnées ; ce n’est pas une sélection de la prise voulue.

Avant l’activation, il faut un choix explicite de la prise par profil et identité stable, puis une vérification physique autorisée. La politique doit être contrôlée au dernier point de dispatch de `SessionManager`, en plus de la présentation dans l’UI. Les interfaces futures doivent recevoir le même refus, même si elles n’utilisent pas le composant C07a.

### 3. L’action utile est enfouie

Pour une carte d’appareil physique, le parcours actuel est : **Home → résumé → afficher les mesures → mesure individuelle → action**. `DeviceSummaryScreen.tsx` ne présente pas de commande primaire ; `SwitchControl` se trouve dans le détail de l’entité.

Le MVP doit permettre **Home → résumé → Allumer/Éteindre** au maximum, puis éventuellement une action explicite séparée sur la carte Home. Un tap sur le corps de la carte continue à ouvrir le détail. Préserver les cibles de 48 dp, la capture de la cible affichée, les états indisponible/occupé et la séparation entre demande acceptée et état observé.

### 4. La maison n’est pas encore le centre de l’accueil

Dans `HomeScreen.tsx`, le plan est rendu après toutes les sections d’appareils. La capture publique fraîche à 430 px montre l’attention, les filtres et les premières cartes ; le plan n’est pas dans la première fenêtre. Le détail d’un interrupteur consacre beaucoup d’espace aux explications de couverture et de simulation autour d’une action simple.

La base graphique est cohérente. Le travail restant porte surtout sur **la composition, la densité et la hiérarchie** : maison reconnaissable, deux appareils utiles en priorité, état principal et action lisibles, informations techniques disponibles à la demande. Conserver les indications de cache, d’indisponibilité et d’incertitude qui changent une décision ; raccourcir les paragraphes permanents.

### 5. Un APK autonome ne rend pas le serveur autonome

HA reste hébergé sur le Mac selon les preuves consultées. Aucun nouveau test de disponibilité HA ni inventaire physique n’a été effectué pour cette revue. Si la veille ou l’arrêt du Mac empêche l’usage quotidien, **H02 devient une condition du MVP**. La solution peut commencer par vérifier l’hôte existant ; cette revue ne recommande pas l’achat immédiat d’un matériel.

Un changement d’origine HA crée aujourd’hui un autre profil Maurice. Prévoir l’association/migration explicite des préférences, un retour arrière et une authentification propre à la nouvelle origine ; ne pas copier silencieusement un token.

## Direction visuelle et comparaison

La branche de [House Control consultée](https://github.com/0xProbabillity/house-control/tree/88c84cca77fc12f9297dc91ba28ce58bc9f316d7) est toujours `88c84cc`, identique à la référence inspectée le 16 octobre. Ses [captures mobiles officielles](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/docs/iphone.png) et son [README](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/README.md) mettent en avant une maison visible immédiatement, des appareils compacts et une action principale facile à trouver. C’est une observation de présentation/documentation, pas un benchmark ni une validation de leur application native. Aucun code ni asset n’est copié.

Pour Maurice, la proposition est :

1. En-tête compact : nom du foyer, statut de connexion discret et paramètres.
2. Bandeau d’attention global quand nécessaire ; cache/état inconnu restent visibles.
3. Aperçu reconnaissable de la maison, avec accès immédiat au plan et aux étages.
4. Favoris utiles : lampe et distributeur avant les mesures secondaires.
5. Pièces puis liste des autres appareils, avec filtres clairs.

Une carte lampe montre l’état observé, sa pièce et une action explicite. Une carte feeder montre la dernière distribution rapportée, la prochaine annoncée et la connectivité ; les détails de quantité restent conditionnés à leurs unités et aux données disponibles. Une information « 23 mesures » est secondaire à ces réponses.

Les surfaces actives peuvent gagner une teinte ou un éclairage discret. La couleur d’un appareil suit l’observation, pas l’optimisme d’une commande. Les animations respectent la réduction des mouvements. Les cartes s’agrandissent avec les polices ; une grille à deux colonnes n’est pas imposée aux petits écrans ni aux grandes polices.

L’aperçu Home peut rester léger et ouvrir une vraie vue 3D dans Maison. Si un aperçu 3D actif est retenu, ne pas monter un deuxième moteur en arrière-plan à l’ouverture du plan. La première version doit déjà offrir une bonne alternative 2D/liste.

## Lots recommandés et critères de sortie

Ces lots organisent les tickets existants et les compléments UX. Ils ne redémarrent pas P01–P04, C01–C04 ou S01.

| Lot | Résultat visible | Appuis / taille | Critère de sortie |
| --- | --- | --- | --- |
| **M00** | Une base de validation crédible | U01/R02, S | Retour de focus reproduit/corrigé ; smoke sans retry sur plusieurs exécutions ciblées ; passe TalkBack supervisée sur Seeker quand l’utilisateur est disponible |
| **M01** | La prise du salon fonctionne réellement | C07a/H01, M | Une identité explicitement autorisée, refus des autres ; action physique autorisée et vérifiée sur l’APK nommé ; état initial restauré, aucun replay après coupure |
| **M02** | C’est la maison de l’utilisateur | P02/P03/P04 et configuration, S/M | Bon plan dans le profil réel, deux appareils correctement liés/placés, favoris pertinents et données de démo HA distinguées ; tout persiste après redémarrage |
| **M03** | Un accueil beau et rapide à utiliser | Home/résumé/contrôle primaire, M à découper | Maison et favoris immédiatement accessibles ; action lampe en deux pressions maximum depuis Home ; feeder compréhensible sans ouvrir 23 mesures ; grandes polices conservées |
| **M04** | Une vue spatiale qui donne envie d’ouvrir l’app | S02 et candidat de distribution, M | 3D activée seulement dans le candidat accepté sur le téléphone visé ; maison réelle lisible, sélection et retour stables, fallback 2D, budget de rendu/lifecycle tenu |
| **M05** | Le foyer s’en sert pendant une semaine | R03a, H02 si nécessaire, observations, terrain | HA disponible pendant l’usage, pas de ressaisie de token ni de panne bloquante ; usages utiles et motifs de retour aux apps fournisseurs documentés pendant sept jours |

Séquence proposée : **M00 → M01 → M02 → M03 → M04 → M05**. La configuration et la validation terrain peuvent se préparer pendant les lots de présentation. R01 avance indépendamment avec une évaluation récente de l’exposition ; son audit n’est pas transformé en succès par une suppression.

Un MVP utile peut être essayé en 2D dès M03. Le MVP visuel ambitieux visé inclut M04 sur son téléphone accepté. Il n’est pas nécessaire d’attendre toutes les catégories d’actionneurs pour lancer M05.

### M01 — Architecture de l’autorisation et du contrôle primaire

- Conserver la liste des capacités vérifiées et ajouter une autorisation par **profil + clé stable + identité d’appareil/capacité**. Un nom d’affichage ou le modèle HS103 seul ne vaut pas autorisation.
- Si l’autorisation est persistée, étendre la version des préférences avec migration validée et refus par défaut pour les profils existants. Séparer cette permission des favoris et des positions.
- Mettre la règle partagée dans `commands/`, appelée à l’entrée et au dernier dispatch via `SessionManager`. Contrôler aussi une révocation survenue pendant une notification synchrone du store ou une file d’attente. Un nouvel appareil avec un nouveau UUID reste non autorisé ; un alias ne doit pas contourner la vérification de l’identité.
- Fournir aux écrans une sélection pure de l’actionneur primaire et de son éligibilité. Une ambiguïté garde l’accès aux mesures individuelles, sans choisir arbitrairement un interrupteur.
- Réutiliser `SwitchControl`, la façade `commands`, le scheduler et les outcomes ; aucun appel de service depuis les cartes ni le moteur 3D. Éviter les Pressable imbriqués pour la future action de carte.
- Tester le refus d’un autre HS103, d’un autre profil, de métadonnées périmées, d’une identité recréée et d’une permission révoquée ; conserver la démo fermée et les preuves de non-rejeu. L’acceptation physique demande un moment explicitement autorisé avec l’utilisateur.

### M02 — Personnalisation sans grand éditeur

Utiliser les écrans existants pour choisir le plan du profil, lier les pièces aux zones HA, placer les deux appareils et choisir les mesures visibles. Un parcours guidé court peut relier ces étapes. Ne pas créer automatiquement les associations à partir des noms.

Le script de build accepte déjà un plan privé, mais `profilePlan.ts` conserve volontairement la copie sauvegardée d’un profil. **Changer seulement le plan embarqué ne remplace pas cette copie.** Utiliser un choix/application explicite, expliquer les conséquences d’une réinitialisation et conserver les préférences non spatiales. Tester l’annulation, les liens non résolus et le redémarrage.

L01 complet (import/export général et éditeur de géométrie) n’est pas une condition de ce premier foyer. Les captures et builds publics restent sur le plan d’exemple ; les artefacts de la maison demeurent privés.

### M03 — Simplification de la présentation

Réorganiser les composants Home existants avant d’ajouter un nouveau framework de navigation ou un autre store. Le plan, les favoris et la ligne d’attention doivent avoir une place stable. Conserver les favoris actuels par clé d’entité et le regroupement par appareil, sans inventer un second système de favoris d’appareil.

Séparer dans les cartes/détails : état principal, action et résultat ; puis informations de couverture et métadonnées à développer. Ne pas masquer une panne ou une donnée périmée pour alléger l’écran. Le réglage d’une mesure principale doit rester explicite ou reposer sur une sémantique vérifiée, sans heuristique de nom.

Mesurer les parcours au démarrage connecté, en cache et après une action externe dans Kasa. La mise en page n’est acceptée que si elle reste compréhensible à 320/430/768 et à grandes polices sur le binaire.

### M04 — Rendu et livraison

`buildFeatures.spatial3d` désactive actuellement toute 3D en Trial. Prévoir une sélection explicite de fonctionnalités dans le candidat de foyer, avec défaut conservateur. Une preuve S01 ou S02 séparée ne suffit pas pour modifier ce flag sur les téléphones déjà distribués.

Réutiliser `CockpitSceneView`, le modèle géométrique et les placements. Préférer matériaux sobres, parois lisibles et bon cadrage à des effets coûteux. Mesurer aussi le plan réel le plus complexe, en gardant ses captures privées : premier affichage utile, interaction, au moins 30 fps pendant l’interaction sur la cible, arrêt du rendu caché/en arrière-plan, cycle ouvrir/fermer et fallback après perte du contexte.

Si Seeker est choisi pour ce MVP, son candidat exact peut être accepté pour ce foyer ; l’acceptation S02 Pixel demeure séparée tant qu’on ne lui distribue pas cette fonctionnalité. Les identités/profile/plan/étage restent vérifiées côté natif ; le moteur ne reçoit ni secrets ni transport HA.

## Conditions de réussite du MVP

- Sur le téléphone et le réseau domestique retenus, l’essentiel apparaît en moins de cinq secondes dans le scénario sain mesuré. Les erreurs et l’état cache restent explicites hors de ce scénario.
- La lampe est actionnable en deux pressions maximum depuis l’accueil, avec un état reçu distinct d’un accusé de réception. Une coupure n’entraîne jamais de rejeu automatique.
- La dernière distribution rapportée et la prochaine annoncée se trouvent sans explorer la liste de mesures. Un rapport du distributeur ne devient pas une preuve que l’animal a mangé.
- Les trois étages et les deux placements réels sont retrouvés après relance et mise à jour, avec une alternative 2D/liste aux parcours 3D.
- Le foyer peut faire les tâches principales pendant sept jours, sans ressaisir son token, et consigner des usages réellement utiles, les blocages, les alertes trompeuses et les retours aux apps fournisseurs. Aucun service d’analytics n’est requis.

Ce sont des critères à mesurer, pas des résultats déjà acquis. L’historique complet, les notifications hors app et la surveillance continue ne sont pas implicitement fournis : les alertes permanentes doivent d’abord avoir une stratégie HA/hébergement explicite.

## Architecture à préserver et suite

HA reste le point d’intégration des appareils et des automatisations. Le backend possède la récupération ; `SessionManager` possède le cycle de session et le dispatch ; les observations et demandes gardent des stores distincts ; la 3D ne fait que présenter et sélectionner. Les modèles sémantiques vérifiés restent dans `core/devices/` et les présentateurs purs. La configuration locale appartient au profil.

U02 reste une tâche de mesure : l’abonnement global et les listes non virtualisées méritent une mesure sur un inventaire représentatif, mais deux appareils ne justifient pas une réécriture anticipée. Les rendus et événements conservés doivent être bornés. La maintenance du correctif de dépendance Router reste couverte par son test de consommateur installé.

Après le MVP : choisir **une** intégration H01 supplémentaire selon le besoin du foyer, puis son UI ciblée ; envisager ensuite caméra/historique/notifications. OAuth multi-occupant, iOS, widgets, scènes, accès IA et distribution publique ont leurs contrats propres. R03b demeure distinct du MVP privé ; les quatre avis de tooling documentés par R01 et l’ancien incident natif inexpliqué gardent leurs limites de preuve.

## Portée de la vérification

Nouveau pendant cette revue : lecture du code et des guides, inspection des captures publiques fraîches à trois largeurs, lecture de la CI `2c496be` et de son journal d’échec, vérification de la révision/captures officielles de la référence. Le [registre agrégé](../stage0/household-mvp-review-proof-2026-10-19.json) distingue ces lectures des tests réutilisés.

Les résultats 596 tests/39 suites et six tests d’outillage sont ceux du checkpoint et des étapes CI consultées ; ils n’ont pas été relancés séparément pour une revue documentaire. Aucun nouveau test natif, inventaire HA ou service physique n’a été exécuté. Les preuves R03a, S02 et U01 gardent leurs binaires et leurs dates. Cette revue n’établit pas de nouvel exploit ni de nouvelle acceptation matérielle.
