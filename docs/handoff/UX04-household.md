# UX04 — Personnaliser la maison avec les écrans existants

Statut : **configuré et vérifié dans le profil Chrome dédié sur ce Mac**, le 21 octobre 2026. M02 est réalisé pour ce client uniquement ; le Chrome habituel et les téléphones ne sont pas synchronisés. [Preuve](../stage0/desktop-validation.md#ux04--configuration-chrome-dédiée--2026-10-21). Le parcours ci-dessous reste la référence pour configurer un autre client.

## Limite importante

Le téléphone et Chrome ont des préférences et grants indépendants. Authentifier le même HA n'en fait pas une synchronisation. Ne pas recopier des permissions entre clients et ne pas annoncer que la configuration Pixel a été appliquée dans Chrome.

## Fichiers et écrans existants

- `spatial/plans.ts` : `useHousePlan`, `housePlanFor`, identité profil + plan + révision.
- `spatial/profilePlan.ts` : copie persistée du plan et reset explicite.
- `PlanLinksScreen`, `PlacementScreen`, `EntitiesScreen`, `DeviceSummaryScreen`.
- `preferences/types.ts` : schéma 3, favoris par clés d'entité, liens et placements.
- Guides : [plans](../design/floor-plans.md), [résumés](../design/device-summaries.md), [inventaire](../stage0/inventory.md).

## Parcours à accomplir

1. Inspecter le profil réellement connecté et le plan affiché ; distinguer défaut embarqué et copie déjà sauvegardée.
2. Si le bon plan est déjà présent, le conserver. Sinon présenter le reset/application et ses conséquences avant la confirmation existante ; ne jamais remplacer silencieusement une copie sauvegardée.
3. Lier les zones HA aux pièces du plan via P03. Une zone correspond à au plus une pièce dans le contrat actuel. Les noms proches et les étages décrits dans une conversation ne suffisent pas à attribuer une zone sans vérification.
4. Placer les lectures pertinentes de la prise et du distributeur via P04. Le modèle actuel place des **entités**, pas une nouvelle classe d'objets « appareil ». Éviter 23 marqueurs pour un distributeur ; utiliser une lecture représentative vérifiée, conserver les autres dans le résumé.
5. Choisir les favoris et la visibilité avec l'interface existante. Un appareil groupé est favori si ses membres le rendent favori ; ne pas inventer `favoriteDevices`.
6. Distinguer les entités de démonstration HA des appareils physiques, sans supprimer l'intégration de démo chez l'utilisateur.
7. Recharger/reconnecter, contrôler liens, placements, favoris et plan. Vérifier aussi qu'une édition spatiale n'altère pas les grants existants.

Si une pièce/destination manque, demander seulement l'information nécessaire et poursuivre la recette publique. Ne pas ajouter une association hasardeuse pour clôturer le ticket.

## Développement éventuel

Uniquement si le parcours révèle un manque bloquant : un lien/contextual help vers l'écran existant, ou une correction reproduite. Ne pas créer un wizard complet, une migration de profil, un import/export de grants, ni une nouvelle version de schéma pour configurer ce foyer.

## Acceptation et preuve

Une preuve publique utilise exclusivement le sample. Les noms/IDs/positions réels, snapshots HA et captures restent dans `.local/`. Le compte rendu versionné contient seulement le client, le nombre de liens/placements vérifiés, la persistance et les limites.

Pas de tests supplémentaires pour de simples préférences modifiées via l'UI. Si du code est corrigé, tester précisément le bug avec les suites `profilePlan`, `selectors`, `placements` et l'écran concerné.

M02 est terminé pour **le client effectivement vérifié** ; l'autre client peut rester à configurer. Aucun appareil n'a besoin d'être actionné pour ce lot.
