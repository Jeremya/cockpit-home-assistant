# Maurice — revue CEO, 2026-11-16

> Revue datée, en mode **réduction de périmètre**. Elle ne modifie ni code, ni dépendance, ni configuration, ni test, et ne change pas les contrats du [backlog](../BACKLOG.md). Le [statut courant](../README.md) reste la référence ; ce document conserve son checkpoint.

## 1. Checkpoint

- **Source :** `main` @ `ae89d81` (2026-10-22), plus un arbre de travail non commité dont le dernier fichier date du 2026-10-29.
- **Distant :** `origin/main` @ `c62b099` (2026-10-19) ; 44 commits locaux non poussés ; dépôt GitHub public.
- **Binaires :** Trial 1011 (`4230f52`, plan d'exemple, 3D coupée) installé sur le Seeker, recette sur fixture passée le 2026-10-26. Trial 1009 accepté sur Pixel 9 Pro pour la lampe.

## 2. Verdict

**Maurice est une alpha technique solide, à l'arrêt depuis dix-huit jours, à un pas de son seul test qui compte.** Aucun jour d'usage réel n'a été observé en trente-trois jours de projet. Le prochain investissement n'est pas du code : rallumer Home Assistant, installer un binaire qui montre la vraie maison, et remplir le journal de sept jours.

Depuis le 22 octobre, trois chantiers ont été ouverts (images caméra, miniature 3D, refonte Home Concept C). Ils rapprochent de l'idéal visuel, mais ramènent M03 et M04 au niveau « implémenté » et ont repoussé M05 de quatre semaines. La règle de priorisation n° 1 du produit (« fermer la boucle avant d'ouvrir une nouvelle catégorie ») n'a pas tenu.

## 3. Ce qui existe et ce qui manque

| Domaine | État constaté le 2026-11-16 | Limite |
| --- | --- | --- |
| Suite Jest | 1015 tests / 75 suites passent sur l'arbre non commité | Relancée ce jour ; lint, recettes navigateur et builds non relancés |
| Typage | `tsc --noEmit` sans erreur | Arbre local uniquement |
| CI distante | Public checks rouge sur `c62b099` (`TS2882`, corrigé localement, jamais poussé) | Trois jobs de recette et `proof:camera` n'ont jamais tourné sur GitHub |
| Audit de dépendances | Rouge les 26 oct., 2 et 9 nov. ; `exceptions_expired` | 27 findings locaux ; deux « high » jamais revues |
| Home Assistant | Éteint : Docker arrêté, journal muet depuis le 2 nov. | Hébergé sur le portable de développement |
| Échelle MVP | M00 et M01 acceptés ; M02 pour le profil Chrome seulement ; M03 et M04 implémentés | M05 non commencé ; journal « Statut : non commencé » |
| Plan de la maison | Tous les builds Trial (1001–1011) embarquent le plan d'exemple | Aucun build `--private-plan` n'a été produit |
| Arbre de travail | 47 fichiers modifiés (+1480/−266), 26 chemins non suivis, sur `main` | Quatre chantiers entremêlés, un seul disque |

## 4. Constats

| # | Gravité | Constat | Preuve |
| --- | --- | --- | --- |
| 1 | **CRITICAL GAP** | Tout le produit dépend d'un portable ; HA est resté éteint quatorze jours sans signal | Docker arrêté ; dernière ligne du journal HA le 2 nov. |
| 2 | **CRITICAL GAP** (hors binaire d'essai) | Un échec de lecture du corps d'une image caméra n'est ni rattrapé, ni borné dans le temps, ni testé | `src/services/cameraImage.ts:240-254` ; `src/components/camera/useCameraImage.ts:92-99` (`finally` sans `catch`) |
| 3 | WARNING | Aucune alerte quand HA tombe et que personne n'ouvre l'app | Constat 1 |
| 4 | WARNING | Exceptions d'audit expirées ; `decode-uri-component` 0.5.0 (« high ») est sur un chemin d'exécution via `expo-router` → `query-string` ; `zod` (« high ») n'arrive que par l'outillage | `npm audit`, `npm ls` ; `package.json` et `public-checks.yml` ont dérivé de leurs hash épinglés |
| 5 | WARNING | Le Concept C, choisi le 28 oct., n'est dans aucun binaire recetté | Trial 1011 date de `4230f52` |
| 6 | Décision | Téléphone de l'essai à choisir | Lampe acceptée sur Pixel 1009 ; 1011 sur Seeker |
| 7 | WARNING | Le foyer verrait une maison fictive : aucun build Trial n'embarque le plan personnel | `.local/trial/` ne contient que `sample/` |
| 8 | WARNING | Dix-huit jours de travail sur un seul disque ; 44 commits non publiés | `git status`, `git rev-list` |
| 9 | Processus | 83 commits en neuf jours, puis aucun en vingt-cinq ; rien n'a progressé vers « observé » depuis le 22 oct. | Historique Git |

Non vérifié : les 230 lignes de mobilier ajoutées à `sample-plan.json` n'ont pas été contrôlées contre la géométrie personnelle. `npm run check:public-inputs` doit passer avant tout push.

## 5. Décisions du propriétaire (2026-11-16)

| # | Décision | Choix |
| --- | --- | --- |
| Mode | Posture de la revue | Réduction de périmètre |
| 1 | Hébergement de HA pendant l'essai | Le Mac, branché à la maison sept jours |
| 2 | Audit de dépendances | Trier les deux alertes, puis renouveler avec échéance |
| 3 | Source du binaire d'essai | Celle de Trial 1011, sans le Concept C |
| 4 | Téléphone | Seeker |
| 7 | Plan affiché | Même source, reconstruite avec le plan privé |
| 8 | Mise en sécurité du travail | Commits par lot sur `main`, prototypes retirés, puis push |
| 9 | Règle de périmètre | Gel complet jusqu'au bilan du jour 7 |

## 6. Lots et critères de sortie

```text
R0 Rallumer HA ─▶ R1 Binaire privé ─▶ R2 Maison ─▶ R3 Lampe ─▶ R4 Sept jours ─▶ R5 Bilan
                                                                    ▲
C1 Consolidation et C2 Audit avancent en parallèle, sans bloquer ───┘
```

| Lot | Résultat | Critère de sortie |
| --- | --- | --- |
| **R0** | HA disponible | Docker démarre à l'ouverture de session ; HA répond ; lampe et distributeur lisibles dans HA |
| **R1** | Trial privé depuis la source acceptée | Build depuis un worktree propre (écart avec `4230f52` : documentation seule), `--private-plan`, numéro supérieur à 1011, `dirtySource:false` ; installé sur le Seeker ; APK jamais partagé |
| **R2** | M02 sur le Seeker | HA réel connecté ; pièces liées ; lampe et distributeur placés ; favoris choisis ; tout survit à un redémarrage |
| **R3** | Lampe observée sur ce binaire | Autorisation donnée au moment du cycle ; On puis Off observés ; état initial restauré ; aucun rejeu |
| **R4** | Sept jours d'usage | Sept lignes datées dans `.local/ux09/usage-journal.md`, colonne « HA disponible ? » remplie |
| **R5** | Bilan | Trois irritants classés et un seul chantier suivant |
| **C1** | Travail en sécurité | Quatre commits (gouvernance, caméra, 3D, Concept C) ; `src/prototypes/` et `app/ui-redesign.tsx` retirés ; `check:public-inputs` passe ; push |
| **C2** | Audit lisible | Exposition de `decode-uri-component` et `zod` évaluée ; hash réépinglés ; nouvelle échéance datée |

Retour arrière : Trial 1009 reste accepté sur le Pixel ; les APK Trial partagent leur certificat, donc une réinstallation en place suffit.

## 7. Registre des modes de défaillance

| Chemin | Défaillance | Rattrapé | Testé | L'utilisateur voit | Journalisé |
| --- | --- | --- | --- | --- | --- |
| Ouverture | HA injoignable | Oui | Oui | Bandeau, valeurs en cache qualifiées | Diagnostics |
| Session | Jeton refusé | Oui | Oui | Erreur terminale explicite | Diagnostics |
| Lampe | Accepté, non observé en 15 s | Oui | Oui | « Non confirmé » | Suivi de commande |
| Lampe | Coupure pendant la commande | Oui, sans rejeu | Oui | Résultat qualifié | Suivi de commande |
| Distributeur | Cloud du fabricant coupé | Oui | Oui | « Indisponible » | — |
| Image caméra | Lecture du corps en échec | **Non** | **Non** | **Chargement sans fin** | **Non** |
| Exploitation | HA tombe, app non ouverte | **Non** | — | **Rien** | Journal manuel |

Les cinq premières lignes reposent sur les tests qui passent ce jour et sur les recettes natives d'octobre, non rejouées. La ligne caméra ne concerne pas le binaire d'essai.

## 8. Différé

| Travail | Pourquoi | Déclencheur | Priorité / taille |
| --- | --- | --- | --- |
| H02 — hôte HA dédié | Un portable ne peut pas porter un usage quotidien | Un jour « HA indisponible » au journal, ou le Mac qui sort de la maison | P1 conditionnel / M |
| Concept C dans un binaire recetté | Direction choisie, jamais acceptée (200 % de texte, TalkBack, recette) | Bilan du jour 7 | P1 / M |
| Caméra — conditions d'entrée | Constat 2 ; isolation des redirections prouvée sur Node seulement ; cache jusqu'à 16 × 5 Mo en base64 | Avant tout binaire incluant la caméra | P2 / S |
| Miniature 3D — acceptation | Aucune mesure GPU ni acceptation Pixel ; OQ-03 ouverte | Bilan du jour 7 | P2 / M |
| Statut documentaire | Six bandeaux datés ; lignes D02 et D03 fausses (OQ-06) | Après C1 | P2 / S |
| Ménage Git | Quatre worktrees, cinq branches fusionnées | Après C1 | P3 / S |
| Diagramme du backlog §2 | Ne montre ni la connexion navigateur ni le service caméra | Avec le statut documentaire | P3 / S |

Hors périmètre, sans date : thème clair, diff de captures en CI, 3D P2, aperçu caméra sur Home et événements, serrures, climat, ventilateurs, distribution publique, iOS, panneau de détail natif.

## 9. Écart avec l'état cible

```text
AUJOURD'HUI                   APRÈS CETTE REVUE              IDÉAL À 12 MOIS
Alpha dormante           ─▶   Sept jours observés       ─▶   Ouvert chaque jour par le foyer
HA sur un portable éteint     Un chantier choisi par         HA sur hôte dédié
Maison fictive en Trial       le journal, pas par l'élan     4 à 6 familles d'appareils vérifiées
Quatre chantiers en vol       Travail publié et sauvegardé   Maison 3D personnelle en accueil
```

## 10. Portée de la vérification

- **Lu :** `AGENTS.md`, le skill produit, `docs/README.md`, le backlog (§1 à C02), le registre de décisions, les questions ouvertes, la revue CEO du 15 oct., A03/A04 du handoff, `internal-trial.md`, `cameraImage.ts`, `useCameraImage.ts`, les diffs de `SessionManager`, `DemoBackend`, du workflow et de `package.json`.
- **Exécuté :** `npx jest --runInBand` (1015 / 75), `npx tsc --noEmit`, `npm audit`, `npm ls`, lecture des exécutions GitHub Actions, balayage des 169 fichiers en attente (IP privées, jetons, chemins personnels).
- **Non exécuté :** lint, format, `check:ui`, `check:spatial-ui`, `check:detail-panel`, `check:web-auth`, `check:public-inputs`, tout build, tout test natif, toute commande physique. Aucun téléphone n'était branché ; HA était éteint.
- **Non relu :** les 1 480 lignes modifiées hors caméra et session ; Flex n'a pas été interrogé, le registre et le code suffisant aux constats.

## 11. Questions restées ouvertes

- Pendant les quatorze jours d'arrêt de HA, quelqu'un du foyer a-t-il ressenti le manque ? La réponse dit si la douleur est réelle ou encore supposée.
- OQ-01, OQ-02 et OQ-03 du registre d'architecture ne sont pas tranchées par cette revue.

## 12. Suite — exécution du 2026-11-16

Le constat et les décisions ci-dessus restent tels quels ; cette section consigne ce qui a été fait ensuite.

**Décision 9 remplacée.** Le même jour, le propriétaire a levé le gel pour le travail visuel (« je veux que le projet soit beau graphiquement ») et autorisé des agents en parallèle. Le travail visuel avance dans des worktrees isolés, sans entrer dans le binaire d'essai. Le reste du gel tient : aucune nouvelle famille d'appareils, aucune nouvelle commande.

| Lot | État | Preuve |
| --- | --- | --- |
| R0 | Fait | HA relancé par le propriétaire ; `/manifest.json` répond 200 |
| R1 | **Construit et installé**, non accepté | Trial 1012, plan privé, source `4230f52`, `dirtySource:false`, 3D coupée, même certificat que 1011 ; APK SHA-256 `aa3e1e18…7635` ; mise à jour en place sur le Seeker (Android 16), `versionCode` 1012 constaté |
| R2, R3 | À faire par le propriétaire | Connexion au vrai HA, liens, placements, puis cycle de lampe autorisé au moment du geste |
| C1 | Commits faits, push en attente | `7af5bb4` gouvernance, `4a55694` caméra, `1585737` miniature 3D, `4b1532f` Concept C, `08bc6d0` retrait des prototypes |
| C2 | En cours | Tri des alertes et renouvellement de la politique |

Chaque commit de C1 a été vérifié seul dans un checkout isolé (`tsc --noEmit`, Jest) : 960, 994, 1005, 1015 puis 1014 tests. Un premier découpage laissait un test rouge dans le lot 3D ; la retouche de test concernée a été déplacée dans ce lot avant tout push.

Confidentialité avant push : le plan d'exemple et le plan privé ne partagent aucune coordonnée ; les seuls noms communs sont génériques (« kitchen », « sofa », « floor 1 »). Lint, format et 36 tests d'outillage passent sur l'arbre consolidé.

Non fait à ce stade : recettes navigateur sur l'arbre consolidé, push, toute acceptation native de Trial 1012.
