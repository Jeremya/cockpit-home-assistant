# Reprise des agents — 17 novembre 2026

Checkpoint : `main` à `0f6d5fb`. Revue de coordination, sans modification applicative.
Flex consulté dans les cellules Claude Code et Codex ; les dernières observations
pertinentes récupérées couvrent le 17 novembre vers 08:50–08:52, heure locale.
Les états peuvent évoluer pendant la revue.

| Agent | Dernière information Flex | Vérification locale | Avis / prochain geste |
| --- | --- | --- | --- |
| A | Session `3bf15c58`, messages 648/680 : assemblage Gradle et vérification du certificat de la preuve Seeker | Worktree `maurice-wave2-A` : script de build, helper, test et modifications documentaires non commités | Priorité au candidat commun avec provenance et à une PR outillage ; pas encore de preuve de build terminé récupérée |
| B | Session `378408fe`, messages 835/902 : Seeker réservé, export public pour reproduire le focus | Worktree `maurice-wave2-B` propre à `0f6d5fb` lors de la lecture | Préparation en cours, pas de correctif livré à revendiquer ; poursuivre le web sans attendre le téléphone |
| C | Session `b61a0c88`, messages 1085/1165/1194 : Pixel réservé, fixture GLB et tests avant correction | Worktree `maurice-wave2-C` : runner et tests modifiés, nouveau test de chargement, non commités | Bonne progression indépendante du build ; PR draft dès qu'une reproduction utile est reviewable |
| D | Session `bd544f84`, message utilisateur 561 : prompt C reçu ; réponses 592/623 : doublon détecté, arrêt | `maurice-next-D` propre ; aucun nouveau worktree D de vague 2 vu dans la liste | Réaffecter explicitement à D : H01/intégrations HA maintenant, caméra au créneau libéré. Ne pas laisser cette session attendre le Pixel pour commencer l'inventaire |

`gh pr list --state open` renvoie une liste vide lors de la revue. Aucun nouveau
résultat de tests ou recette native n'a été exécuté ici ; les résultats de la
revue précédente restent ceux de leur SHA.

## Avis

La répartition technique est pertinente, mais le chemin de livraison et
l'attribution des rôles ralentissent davantage que le code. A concentre le build
commun ; B/C ont correctement démarré du travail indépendant. D est immobilisé
par un mauvais prompt alors que l'inventaire HA ne dépend d'aucun téléphone.

La nouvelle consigne du propriétaire est actée dans AGENTS.md : chaque agent
livre par commits, branche poussée et PR, draft si des preuves restent ouvertes.
Les anciens prompts de non-commit sont remplacés. Une PR rend le travail
inspectable et déclenche la CI ; elle ne vaut ni acceptation produit ni permission
de fusion. A peut d'abord ouvrir une PR outillage, B une PR focus, C une PR
chargement spatial et D une PR H01/caméra, à scinder si les changements sont
indépendants. Ne pas recréer de PR pour les lots déjà intégrés.

## Consigne de reprise de D

Tu restes agent D. Le prompt C reçu dans ta session était une erreur de
répartition ; C est déjà pris. Reprends l'extension H01 du 17 novembre : inventaire
HA réel, modèles et capacités, puis intégrations disponibles via HA. Ce travail
commence sans téléphone. Réserve ensuite un créneau caméra auprès de A. Suis
AGENTS.md pour livrer en PR ; ne lance aucune action physique sans son autorisation
spécifique. Les données du foyer restent privées.
