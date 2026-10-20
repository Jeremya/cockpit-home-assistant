# UX03 — Une action explicite depuis la carte partagée

Statut : **commité localement avec UX02 le 20 octobre 2026, non poussé** ([preuves](../stage0/desktop-validation.md#ux03-card-action--2026-10-20)). Termine la partie action rapide de M03.

## Résultat

Sur téléphone et Chrome, une carte de lampe autorisée permet de demander On/Off en une pression depuis Home. Ouvrir son détail reste une action séparée.

## Points d'entrée

`DeviceSummaryCard.tsx`, `HomeScreen.tsx`, le nouveau `useSwitchCommand.ts`, `commands/switchControl.ts`, `services/deviceNavigation.ts`, `core/devicePresentation.ts`.

`primarySwitch(deviceId, snapshot, preferences, mode)` est **existant**. Il vérifie l'unicité parmi tous les interrupteurs principaux, même si certains sont masqués. Ne pas le remplacer par `summary.members.find(...)`.

## Structure

Faire évoluer la carte existante :

```text
View (fond, bordure ; aucun role=button ni onPress)
├── Pressable « Open device: <nom> » → openDeviceSummary(...)
├── [si action autorisée] CompactPowerAction
│   └── Pressable « Turn <nom> on/off »
└── résultat/notice de commande, live region polite
```

Créer `src/components/controls/CompactPowerAction.tsx`, consommateur du hook partagé. L'ouvrir via un enfant conditionnel évite un hook appelé conditionnellement dans `DeviceSummaryCard`.

- Monter cet enfant pour le primaire unique existant ; décider à l'intérieur si le bouton est autorisé. Ne pas conditionner tout l'enfant à la permission : un résultat encore pertinent pour cette identité doit rester lisible même si le bouton disparaît après révocation.
- Le bouton reçoit une intention explicite tirée de l'état **affiché** : `off → true`, `on → false`. L'intention du callback reste celle de son rendu ; ne pas recalculer un toggle sur un état différent au dernier instant.
- Le hook/manager revalident toujours le contexte au clic. Aucun `call_service` depuis la carte.
- La carte non autorisée garde seulement son ouverture de détail. L'enrôlement reste dans le résumé, pas dans un petit bouton ambigu sur Home.
- Si l'identité/permission reste valable mais l'état est cached, inconnu, indisponible ou l'app en arrière-plan : action désactivée avec explication. Si la permission est révoquée ou l'identité n'est plus prouvée : retirer l'action.
- État inconnu : bouton désactivé « Power unavailable », aucun inverse supposé. Pendant `sending`/`accepted`, garder l'intention affichée mais rendre l'action indisponible.
- Résultat via `switchOutcomeText`, indépendamment du headline observé ; conserver un accès au résultat non confirmé. Ne pas utiliser le succès d'envoi pour colorer la carte en On.
- Une couleur active requiert une observation `ready` et qualifiée On. Cache/unknown/stale n'ont pas ce traitement.
- Pour `deviceId === null`, conserver le chemin actuel `EntityCard` et ne pas ajouter d'action rapide.

Amender [M01](../design/power-enrollment.md) : « commandes de carte par le contrôleur partagé ; régions sœurs, jamais de cibles imbriquées ». Ne pas réécrire l'ancien nombre de pressions comme s'il s'agissait de la preuve physique déjà réalisée.

## Tests de comportement obligatoires

Nouveau `src/components/__tests__/DeviceSummaryCard.test.tsx` et tests du contrôle compact :

| Cas | Attendu |
| --- | --- |
| Clic / Entrée / Espace sur ouverture | détail ouvert, zéro commande |
| Clic / Entrée / Espace sur On/Off | une commande, zéro navigation |
| Deux pressions synchrones | un seul envoi |
| Autre HS103, grant absent/révoqué, plusieurs interrupteurs | aucune action autorisée |
| Offline/cached/unknown/unavailable | aucune commande |
| Profil/session/epoch change entre rendu et clic | callback ancien refusé |
| Acknowledgement sans observation | état observé inchangé, « waiting/unconfirmed » selon C02 |
| Observation externe de On | headline et prochaine intention changent |

Réutiliser les fixtures M01 et C04. Ne pas écrire de faux `setSwitch` qui contourne toute la logique testée : un test d'intégration doit passer par le vrai manager en démo.

## Recette

Régressions UX02 + tests carte/Home/DeviceSummaryScreen. Étendre le smoke public pour action de carte à 320/430/768/1440, puis ouverture du résumé et absence de double action clavier. Préserver les seize assertions M00 de focus existantes.

`scripts/check-ui.mjs` est un input épinglé par la politique R01 : documenter l'exposition inchangée (démo/fixture seulement) avant de mettre à jour son hash, sans modifier expiration/advisories. Aucun cycle sur la vraie lampe sans nouvelle autorisation.

Terminé : une implémentation partagée, tests de séparation navigation/commande verts, états de résultat lisibles. L'effet physique du nouveau parcours attend UX09.
