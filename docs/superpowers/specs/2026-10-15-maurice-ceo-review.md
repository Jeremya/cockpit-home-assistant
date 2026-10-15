# Maurice — revue CEO et produit

> Revue datée du checkpoint `17827d0` et de ses changements locaux. Depuis, S01 a été commité en prototype (`a505fec`), P01/P02 et leurs corrections dans `81ac459`, puis la marque Maurice dans `da62474`. Le nettoyage documentaire a repris les priorités dans le backlog : U04, C07a/C07b et R03a/R03b. Consulter [l'état du projet](../../README.md) pour la situation actuelle ; l'analyse ci-dessous conserve sa portée et ses preuves d'origine.

Date : 15 octobre 2026. Périmètre : application, architecture, preuves de fonctionnement, backlog et priorités. Hypothèse : réussir l'usage dans le foyer avant d'envisager un produit commercial.

Méthode : revue du code et des documents, application du skill Superpowers `verification-before-completion`, nouvelles vérifications automatisées et lectures de HA sans commande physique. Les recommandations sont des décisions proposées ; ce document ne change pas les contrats du backlog.

## 1. Verdict

**Maurice est un prototype technique solide, déjà relié à deux appareils réels. La prochaine étape est de prouver son utilité quotidienne.**

Les fondations difficiles ont été traitées : connexion HA, récupération après coupure, stockage des identifiants, identité des entités, profils isolés et plan 2D utilisable sur Android. Il reste à transformer ces informations en réponses compréhensibles, puis en actions sûres.

Le principal risque produit est une interface qui affiche beaucoup de données mais demande encore à son utilisateur de les interpréter. Le Petlibro le rend concret : **un distributeur produit 23 entités visibles**. Une personne du foyer attend une carte « Distributeur » avec les quelques informations utiles.

Décision recommandée : poursuivre le MVP du foyer avec trois résultats prioritaires :

1. Comprendre l'état des appareils et les limites des observations en un regard.
2. Commander une première lampe avec un résultat confirmé et aucune répétition après reconnexion.
3. Utiliser l'app plusieurs jours depuis un APK autonome, sans environnement de développement.

Conserver l'ambition spatiale et terminer l'expérience S01, avec une décision fondée sur les mesures. Réserver l'investissement dans la 3D de production à une navigation réellement utile.

## 2. Où nous en sommes, preuves à l'appui

| Domaine             | État constaté                                                                                                                                                | Limite de la preuve                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Socle HA et session | Implémenté ; récupération réseau et redémarrage HA validés sur Pixel dans les rapports existants                                                             | Ces validations concernent le client de développement installé, pas un nouveau binaire autonome                      |
| Interface native    | Accueil, favoris, filtres par pièce, détails et diagnostics présents                                                                                         | Les captures publiques montrent la démo ; elles ne prouvent pas la lisibilité de tout l'inventaire réel              |
| Plan 2D             | Plusieurs étages, sélection des pièces, fonctionnement hors connexion validés sur Pixel : F01 terminé                                                        | Associations avec les pièces HA et placements d'appareils à implémenter                                              |
| P01/P02             | Préférences spatiales versionnées, plan par profil et reset implémentés ; les cinq reproductions des quatre défauts de la revue précédente passent désormais | Pas de nouvelle acceptation complète du binaire Android effectuée pendant cette revue                                |
| S01                 | Prototype Three.js/Expo DOM, marqueurs fictifs, interactions et instrumentation présents                                                                     | Aucun rapport conservé de mesures natives S01 trouvé : cadence, pause et libération des ressources restent à prouver |
| Prise Kasa HS103    | Connexion réelle HA et backend validée ; lecture de l'état `off` réussie pendant cette revue                                                                 | Aucune commande depuis Maurice ni vérification physique de commutation                                               |
| Petlibro PLAF103    | Nouvelle preuve du backend réel réussie : connecté, 23 entités visibles, pièce résolue et trois registres frais                                              | Validation du backend ; présentation des 23 informations sur le téléphone et compréhension par le foyer non validées |
| Commandes physiques | Architecture prévue dans C01–C07                                                                                                                             | App actuellement en lecture seule                                                                                    |
| Caméras             | Contrats et tickets prévus                                                                                                                                   | Images authentifiées et affichage non implémentés                                                                    |
| Autres équipements  | Inventaire initial disponible                                                                                                                                | Nest, Schlage, Ring, Samsung et AIRTAP non certifiés par les deux appareils déjà connectés                           |
| Distribution        | Client Android de développement installé                                                                                                                     | APK autonome, maintenance des dépendances et CI restent des jalons ouverts ; iOS différé                             |
| Marque Maurice      | Nom, portrait, textes et assets présents dans les changements locaux                                                                                         | Leur présence dans le dépôt de travail ne prouve pas qu'un nouveau binaire avec ce branding a été installé           |

Vérifications relancées le 15 octobre :

- `npx jest --runInBand` : **96 tests passent dans 13 suites**.
- `npx tsc --noEmit` : passe.
- `npm run lint` et `npm run format:check` : passent.
- Les **5 régressions locales de la revue P01/P02 passent** ; elles sont distinctes du décompte des 96 tests. Des régressions correspondantes existent maintenant dans les tests du dépôt.
- Preuve Petlibro par `HomeAssistantBackend` : réussie à 21:14 UTC, zéro appel de service à un appareil. Lecture Kasa : réussie, zéro appel de service.

Au moment de cette revue, le HEAD et la référence locale `origin/main` pointaient sur `17827d0`. P01/P02, leurs corrections, S01 et le branding étaient encore des changements non commités. Ils ont depuis été enregistrés dans les commits cités en tête de document. **Fonctionnel localement, validé sur téléphone et livré dans Git sont trois états à suivre séparément.** Aucun nouveau build natif, export ou audit des dépendances n'a été exécuté ici.

Sources internes : [résultats du socle](../../stage0/results.md), [validation Android](../../stage0/android-validation.md), [acceptation du plan](../../stage0/floor-plan-validation.md), [backlog](../../BACKLOG.md). Les preuves contenant les données du foyer restent dans `.local/`, hors Git.

## 3. La promesse et la différence produit

Promesse proposée pour le premier produit : **« Votre maison, en un regard. Vous gardez la main. »**

Public cible initial proposé : un foyer équipé de HA, avec une personne qui administre les intégrations et des utilisateurs quotidiens qui veulent simplement consulter ou agir. L'installation Petlibro, avec compte partagé et découverte des appareils, montre que l'accompagnement initial fait partie du coût réel du produit. Mesurer ce temps avant de promettre une installation immédiate dans n'importe quel foyer.

Trois questions doivent organiser l'expérience :

- Qu'est-ce qui demande mon attention, et pourquoi ?
- Que sait-on de cet appareil, et avec quelle fiabilité ?
- Puis-je effectuer cette action et savoir si elle a abouti ?

Home Assistant propose déjà des tableaux de bord et des cartes de contrôle personnalisables. House Control, notre référence visuelle, présente déjà une maison 3D interactive. **Mon jugement : la différenciation à rechercher est la simplicité pour les personnes du foyer, la qualité de l'information et une exécution prévisible.** La beauté soutient cette promesse. [Documentation HA](https://www.home-assistant.io/dashboards/), [House Control](https://github.com/0xProbabillity/house-control).

La direction visuelle actuelle est cohérente : surfaces sombres, hiérarchie lisible, palette contenue et états écrits. Pour s'approcher de la clarté de la référence, le prochain progrès est surtout éditorial : moins de cartes équivalentes, moins de métadonnées au premier niveau, davantage de regroupement et une action principale identifiable.

La marque Maurice peut rendre l'app mémorable. Le portrait doit rester discret dans les écrans opérationnels. L'humour peut vivre dans l'accueil et la démo ; une panne, une alerte et une confirmation doivent expliquer précisément la situation. « Maurice s'occupe de tout. Vous, de rien. » et « Autonome » promettent aujourd'hui plus que le mode lecture seule. Les réserver à une ambition future ou reformuler la promesse actuelle.

Si l'objectif devient commercial, il faudra d'abord tester l'installation et l'usage chez quelques autres foyers, mesurer le support nécessaire et vérifier leur intérêt. Aucun élément actuel ne valide une demande, un prix ou une rétention commerciale. Un abonnement, un service cloud et une couche d'IA ne sont pas nécessaires pour répondre au besoin présent.

## 4. Les quatre décisions les plus importantes

### A. Faire de la confiance une fonctionnalité explicite

La politique actuelle, dans [core/policy.ts](../../../src/core/policy.ts), traite spécialement les serrures et les états `unknown` / `unavailable`. Pour les autres domaines, elle classe `on` en `active` et tout autre état en `normal`.

Trois exemples exécutés pendant cette revue :

| Information synthétique                             | Classement actuel | Conséquence                                                   |
| --------------------------------------------------- | ----------------- | ------------------------------------------------------------- |
| Capteur batterie à `low`                            | `normal`          | Une information potentiellement importante n'est pas remontée |
| Capteur binaire `device_class=problem` à `on`       | `active`          | Un problème n'est pas classé comme alerte                     |
| Capteur binaire `device_class=connectivity` à `off` | `normal`          | Un appareil signalé déconnecté peut sembler normal            |

Le Petlibro remonte effectivement une valeur batterie `low`. Cela ne prouve pas une panne ou un besoin de remplacement : l'alimentation et la signification de ce champ doivent être confirmées. Cela démontre que l'état doit être interprété avec son type et sa provenance.

**Avant de renforcer un message « tout va bien », définir les situations couvertes.** Séparer gravité du problème, disponibilité de l'appareil et qualité de l'observation. L'absence d'alertes connues ne certifie pas la sécurité de toute la maison. Une synchronisation HA fraîche ne certifie pas non plus une lecture physique récente.

Implémentation proposée : compléter les règles pures dans `core/policy.ts` ou un module voisin, en s'appuyant sur les capacités et `device_class`, avec des tests des états inversés, absents et inconnus. Pour une batterie numérique, documenter le seuil choisi ; pour une valeur textuelle propriétaire, utiliser une adaptation explicite, sans deviner depuis le nom traduit. Une mesure inchangée depuis longtemps n'est pas automatiquement périmée : la fraîcheur dépend aussi du comportement de l'intégration.

Le bruit observé dans les validations natives — capteurs techniques HA en `unknown` dans l'attention — mérite aussi un traitement. Fournir une sélection compréhensible des appareils suivis et séparer santé domestique et diagnostics techniques. Ne pas masquer automatiquement tous les états inconnus.

### B. Présenter des appareils, avec les entités en détail

Remonter **U03** dans les priorités, avec une première tranche Petlibro/Kasa avant la 3D de production.

Carte du distributeur proposée : dernière distribution rapportée, prochaine distribution annoncée, quantité, connexion et problèmes applicables. Les autres informations restent consultables dans le détail. Afficher les heures dans le fuseau local et leur provenance. Une distribution déclarée par le fabricant ne prouve pas que le chat a mangé.

Architecture proposée :

- Construire une projection pure `DeviceSummary` à partir du snapshot, de `deviceId` et des préférences. Inclure les clés des entités sources, les informations principales, les alertes et les limites de disponibilité.
- Garder les entités comme observations de référence ; ne pas créer un second magasin d'états par appareil.
- Grouper par appartenance réelle au registre HA, jamais par préfixe de nom. Les entités sans appareil conservent une présentation autonome.
- Préserver la navigation vers chaque entité et ses clés stables. Une disparition temporaire ne doit pas effacer ses préférences.
- Prévoir un résumé générique pour un appareil inconnu et un présentateur spécifique borné pour le distributeur. Ne pas disperser des conditions Petlibro dans les écrans.
- Définir le traitement des entités masquées, des pièces contradictoires et d'un appareil partiellement disponible. Les compteurs doivent distinguer appareils et informations.

Critère d'acceptation : un distributeur donne une carte principale compréhensible ; ses informations secondaires restent accessibles ; ses problèmes et incertitudes restent visibles.

### C. Terminer une première boucle d'action réelle

Choisir **la prise Kasa qui commande la lampe** pour la première livraison de contrôle.

Conserver la séquence **C01 → C02 → C03 → C04 → tranche switch de C07** : intentions typées, suivi de résultat, annulation et absence de répétition, démo commandable, puis contrôle réel. Isoler la partie switch de C07 permet de livrer cette boucle sans attendre toutes les capacités des ventilateurs.

L'écran doit distinguer « demande envoyée », « acceptée par HA », « état observé correspondant » et « résultat non confirmé ». L'observation HA confirme ce que HA rapporte ; l'acceptation manuelle vérifie aussi la lampe physique.

Critères : on/off fonctionne, un refus est expliqué, une coupure pendant l'action laisse un résultat honnête, et le retour réseau ou le redémarrage ne répète aucune commande. Les intentions en attente restent transitoires. Les contrôles de serrure et de distribution de nourriture attendent leurs propres protections et preuves matérielles.

### D. Organiser l'usage quotidien et la continuité

Découper **R03** : un APK autonome pour les essais internes devient prioritaire, tandis que la diffusion publique conserve ses exigences de maintenance et de sécurité. Documenter les problèmes de dépendances et leur exposition réelle avant toute distribution ; ne pas déclarer l'app prête sur la seule base des tests unitaires.

Deux dépendances différentes doivent être retirées ou assumées :

- Le client de développement a besoin de Metro ; un binaire autonome supprime cette dépendance.
- HA tourne actuellement sur le Mac de développement ; le binaire autonome ne garantit pas que HA restera disponible lorsque ce Mac dort ou s'arrête.

Préparer H02 et la migration des préférences lors d'un changement d'origine HA. Tant que le serveur reste sur le Mac, annoncer cette limite pour les essais du foyer. Les fonctions Petlibro dépendent aussi de leur intégration cloud, indépendamment de la disponibilité du serveur HA local.

La confidentialité doit rester précise : les fichiers privés sont ignorés par Git, **mais un bundle construit avec le plan personnel contient cette géométrie**. Les builds et captures partageables utilisent l'exemple public. Le README doit rendre cette frontière aussi claire que [la documentation des plans](../../design/floor-plans.md).

## 5. Architecture à conserver à long terme

La séparation existante convient à la prochaine étape. Aucune réécriture du socle n'est justifiée par cette revue.

```text
Intégrations et automations : Home Assistant
    ↓ observations, registres et capacités
Backend HA : protocole, récupération et appels de services
    ↓
SessionManager : session active, profils et persistance
    ↓
Store d'observations + préférences séparées
    ↓
Sélecteurs : pièces, résumés d'appareils, attention, disponibilité
    ↓
Accueil / liste / détail natifs ↔ sélection partagée ↔ plans 2D / 3D

Intention de l'utilisateur → validation → suivi de commande → backend HA
Observation correspondante → suivi de résultat → interface
```

- **HA garde les intégrations constructeurs.** Aucun client Kasa/Petlibro parallèle dans l'app.
- **Le backend garde la récupération réseau.** Les écrans, présentateurs d'appareils et futurs contrôles ne créent pas leur propre boucle de reconnexion.
- **Les associations spatiales restent explicites et par profil.** P03 relie IDs de pièces du plan et IDs de zones HA ; P04 place les clés d'entités dans le référentiel métrique du plan. La suppression d'une référence conserve une association non résolue, sans inventer de remplacement.
- **Le plan est une projection de navigation.** La 2D, la 3D et la liste ouvrent les mêmes détails et appliquent les mêmes politiques. La scène reçoit uniquement la géométrie et les marqueurs assainis ; aucun token, connexion HA ou attribut brut.
- **L'app fonctionne sans la scène.** Conserver la liste native, la 2D, les grandes tailles de texte et des états écrits. Les permissions de commande restent dans le chemin natif commun.
- **La persistance conserve les choix, pas une vérité physique ni des commandes à rejouer.** Migrations, identité, isolation des profils et copie autorisée des champs restent des invariants.

Pour limiter le coût des prochaines contributions, livrer une tranche fonctionnelle à la fois avec fixtures publiques et preuve de comportement. Éviter plusieurs chantiers simultanés dans `SessionManager`, les préférences et les sélecteurs partagés.

## 6. Roadmap recommandée, avec conditions de sortie

Les étapes ci-dessous sont des jalons proposés, sans estimation de calendrier faute de mesure de capacité de livraison.

| Étape                         | Livraison                                                                                                              | Condition de sortie                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Consolider                 | Enregistrer les corrections P01/P02 et leurs tests ; synchroniser les documents de suivi                               | Changements relisibles dans Git ; statuts et preuves cohérents ; aucun artefact personnel partagé                                                                                        |
| 1. Relier le foyer            | P03 : associations explicites plan ↔ zones HA, état non associé visible                                                | Les deux appareils réels sont accessibles depuis leurs pièces ; pièce supprimée, profil différent et métadonnées manquantes correctement gérés                                           |
| 2. Rendre l'accueil utile     | Première tranche U03 + politique d'attention : résumés Kasa/Petlibro, dates lisibles, problèmes et inconnues expliqués | Une personne du foyer trouve les informations essentielles sans connaître les entités HA ; cas problème/batterie/déconnexion testés ; absence de faux message rassurant sur ces fixtures |
| 3. Agir en confiance          | C01–C04 puis contrôle switch de C07                                                                                    | Lampe physiquement vérifiée ; succès/refus/absence de confirmation distincts ; matrice de coupures et absence de répétition validées                                                     |
| 4. Vivre avec l'app           | APK interne autonome, disponibilité HA assumée ou stabilisée, installation et persistance testées                      | Essai proposé de 7 jours sans Metro ; noter les ouvertures utiles, incompréhensions et retours aux apps constructeurs                                                                    |
| 5. Ajouter la valeur spatiale | P04, puis S02 si S01 passe et si l'usage le justifie                                                                   | Placements explicites, éléments non placés accessibles, navigation partagée ; mesures natives conformes et repli opérationnel                                                            |
| 6. Étendre le foyer           | H01 au fil des équipements, puis C05/C06 et I01/I02 selon les usages prioritaires                                      | Chaque famille a ses capacités réellement vérifiées et son acceptation matérielle ; caméras et serrures gardent leurs exigences propres                                                  |

**S01 peut se terminer en parallèle**, comme expérience bornée : conserver un rapport Pixel avec méthode, versions, premier affichage utilisable, interactions à au moins 30 fps, distinction tap/orbite, absence de rendu continu au repos, pause en arrière-plan, démontage et perte de contexte. Une capture seule ne clôt pas ce jalon. Un résultat négatif conduit au repli prévu et à une décision explicite sur S02.

Les étapes 1 et 2 peuvent être livrées séparément : le regroupement d'appareils ne dépend pas du placement sur le plan. Les corrections de confiance passent avant tout message de sécurité ou activation de contrôles. Un APK autonome en lecture seule peut également avancer avant la fin du chemin de commandes.

Révisions proposées au backlog :

- Avancer U03 et en préciser une première livraison distributeur/prise.
- Ajouter une tâche explicite pour les règles d'attention et la qualité des observations ; aucune tâche existante ne suffit à rendre cette politique générique.
- Scinder C07 pour pouvoir accepter le switch indépendamment des ventilateurs.
- Scinder R03 entre essai interne autonome et diffusion publique ; conserver R01 comme travail explicite de maintenance.
- Ajouter Petlibro à H01 avec la portée exacte de sa preuve, puis prévoir son acceptation native.
- Mettre H02 au niveau requis par l'essai quotidien si le Mac ne peut pas assurer la disponibilité.
- Conserver S02 après ses dépendances ; différer l'éditeur 3D riche, les animations décoratives, l'import universel et l'autonomie par IA.

Lors de la revue, le backlog comportait des contradictions sur les plans persistés, Three.js et le prochain ticket, l'inventaire omettait Petlibro et le README affichait un ancien décompte de tests. Le nettoyage documentaire du 15 octobre les a corrigées : [l'état du projet](../../README.md) centralise désormais le bilan, et le prochain prompt recommande P03.

## 7. Comment juger la réussite

Définir une petite liste de situations avant l'essai : trouver la lampe, lire le prochain repas annoncé, comprendre un appareil indisponible, agir sur la lampe lorsque le contrôle est livré. L'absence de serrure réelle connectée interdit de présenter un bilan de sécurité complet.

Objectifs proposés, à mesurer plutôt qu'à annoncer comme acquis :

- Une personne du foyer répond aux questions principales en moins de dix secondes, sans explication du développeur.
- Sur les scénarios de panne convenus, aucun état inconnu n'est présenté comme une réussite ou un état physique confirmé.
- Sur les essais de commandes, aucune répétition après reconnexion ou reprise de l'app.
- Sur sept jours, relever les raisons d'ouvrir Maurice et celles de revenir à Kasa/Petlibro/HA. Le nombre d'entités affichées ne mesure pas l'utilité.
- Conserver les mesures S01, le temps jusqu'à un accueil utilisable et les défauts rencontrés sur le Pixel, avec une configuration reproductible.

Un journal local manuel suffit à cette phase. Aucune infrastructure d'analytique n'est nécessaire.

**Prochaine tâche recommandée : P03**, après un checkpoint des corrections P01/P02. Préparer ensuite les deux petites livraisons « résumé d'appareil » et « règles d'attention », puis la boucle Kasa complète. Cette séquence rapproche Maurice d'un outil quotidien, tout en préservant son ambition visuelle.
