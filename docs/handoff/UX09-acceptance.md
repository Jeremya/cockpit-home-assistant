# UX09 — Accepter un candidat, puis observer l'usage

Statut : après UX03 + UX04 ; inclure UX08 si l'on distribue la maquette. M04/M05, sans nouveau développement fonctionnel.

## Préparation

1. Lire `docs/design/internal-trial.md`, `docs/stage0/power-enrollment-validation.md`, `docs/stage0/spatial-view-validation.md`.
2. Partir d'un état source identifiable, exécuter les checks applicables et noter SHA, paramètres de build et limitations.
3. Conserver le plan public pour tout artefact partageable. Plan réel → artefact local privé explicite.
4. Ne pas reprendre « 1009 » pour le nouveau binaire. Choisir un build number inutilisé, noter hash APK et cible effective.
5. La 3D Trial est actuellement désactivée par défaut (`src/config/build.ts`). Son activation exige une sélection explicite de fonctionnalités et l'acceptation du candidat sur chaque téléphone visé ; lire le builder avant de modifier ses options.

## Matrice minimale

| Parcours | Chrome | Téléphone cible |
| --- | --- | --- |
| Home, favoris, mêmes cartes et état principal | 430 et 1440 | portrait, grandes polices |
| Carte : ouvrir vs commander en démo | souris + clavier | tactile + TalkBack |
| Résultat accepted/unconfirmed/confirmed | fixture fermée | fixture fermée |
| Reconnexion / aucun rejeu | fixture fermée | Wi-Fi/retour premier plan selon recette |
| Plan, zone non liée, placement, détail puis retour | 2D et 3D si activée | mode autorisé par le candidat |
| Session/plan/favoris après relance | mémoire token web explicitée | stockage natif |
| WebGL indisponible et rendu inactif | fallback + lifecycle | si 3D incluse |

Ne pas changer les préférences d'accessibilité ou de veille de l'utilisateur sans les restaurer. Une réponse « je n'ai pas pu écouter » ne clôture pas TalkBack.

## Contrôle physique

La preuve M01 antérieure est consommée. Pour un nouveau cycle réel, demander l'autorisation sur l'appareil/load précis au moment du test. Relever l'état initial, limiter le cycle convenu, restaurer cet état, puis distinguer :

- requête envoyée ;
- état rapporté par HA ;
- effet effectivement observé par l'utilisateur.

Pas de test feeder, serrure, chauffage ou appareil non vérifié pour « compléter » la matrice.

## Sept jours d'usage, sans analytics

Après acceptation du candidat, créer un journal **local** avec une ligne par jour : date, client/build, nombre approximatif de visites utiles, action/lecture recherchée, retour à Kasa/Petlibro et pourquoi, blocage/état trompeur, disponibilité HA.

À vérifier : essentiel visible en moins de cinq secondes dans le scénario sain mesuré ; lampe facilement actionnable ; dernier/prochain repas rapporté compréhensible ; trois étages et placements retrouvés ; aucune panne bloquante ou rejeu observé.

Le web nécessite encore une reconnexion après reload. Le loader évite la ressaisie en développement ; ne pas déclarer l'objectif « connexion durable du produit » atteint. Si cela gêne l'usage, prioriser D02. Si HA s'arrête avec le Mac, prioriser H02.

## Sortie

Mettre à jour les tickets M03/M04/M05 et le registre de validation avec les faits exacts. Sept jours ne sont pas remplacés par sept redémarrages automatiques. Les périodes non observées restent ouvertes ; les défauts bloquants deviennent des corrections bornées avant de nouvelles fonctions.

Ne pas déclarer R03b/publication ni l'autre téléphone acceptés par cette recette. Prochaine décision produit après observation : panneau de détail, D02/H02, ou une seule nouvelle catégorie d'appareil selon le besoin constaté.
