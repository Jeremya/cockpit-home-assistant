# Agent B — contenu partagé, panneau desktop, navigation cohérente

Lire le [contrat commun](README.md). Correspondance : **reste de D03**, après UX01–UX08. Priorité P1. Ne pas refaire les cartes, la caméra, les commandes ou la connexion. Découper en quatre commits revus ; B01/B02 sont utiles même avant la finition du panneau.

## Constat dans le code

- `DeviceSummaryScreen.tsx` lit les paramètres de route puis rend un `SummaryContent` privé, avec son propre ScrollView et `useResponsiveLayout().desktop`.
- `DeviceDetailScreen.tsx` mélange route, résolution de l’entité, contenu et navigation. Il ne peut pas simplement être placé tel quel dans une colonne.
- `EntityCard` appelle directement `openReading`. `deviceNavigation.ts` valide puis pousse des routes. `spatial/navigation.ts` ajoute les validations de plan/étage/placement avant d’appeler `openReading`.
- `app/_layout.tsx` possède un Stack unique. `AppShell.web.tsx` entoure les routes ; il n’héberge pas encore de workspace maître/détail.
- `HomeViewProvider` utilise une session UI bornée, car un retour Expo a réellement remonté le layout racine. Un simple `useState` de plus dans Home ne suffit pas.
- UX07 démonte une scène sur route inactive. Un panneau qui empile une autre route peut donc faire disparaître la maison ou créer des instances concurrentes. Cela doit être prouvé avant le montage final.

## B01 — Extraire les contenus sans changer la navigation

**Taille M · prêt maintenant · aucun besoin de C.**

### Livrables et architecture

Créer `src/components/details/DeviceSummaryContent.tsx` et `ReadingDetailContent.tsx`, leurs types et tests. Les noms sont proposés. Les écrans existants restent les adaptateurs de route et de scroll.

- Le contenu ne lit pas `useLocalSearchParams`, ne pousse pas de route, ne crée pas de session et ne dépend pas de la largeur globale du navigateur.
- Le wrapper possède le ScrollView ; le contenu reçoit une largeur mesurée ou un mode de présentation déduit de cette largeur. Une colonne de 400 px doit rester en une colonne même sur un écran de 1920 px. Ne pas empiler deux ScrollViews concurrents.
- Conserver résolution courante de profil, entité, aliases, visibilité et ready. Les sélecteurs existants produisent les données ; ne pas dupliquer `presentDevice`, `primarySwitch` ou l’interprétation Petlibro.
- Navigation injectée par callbacks typés (`onOpenReading`, `onOpenDevice`) vers des destinations **validées**. Une carte/lecture peut avoir un callback optionnel, le chemin existant restant son comportement par défaut.
- Si on sépare validation et navigation dans `deviceNavigation.ts`, conserver les wrappers `openReading` et `openDeviceSummary` pour les appelants existants. Le panneau doit réutiliser la même validation au moment de l’appui ; un callback injecté ne la contourne pas.
- Le contenu conserve `SwitchControl`/`useSwitchCommand`, favoris, qualifications, couverture, contrôles explicites et refus. Aucun nouvel appel de service.
- Le composant d’observation se remonte ou réinitialise son état local lors d’un changement de cible/profil : expansion et attributs bruts d’A ne restent pas visibles pour B.

### Tests / fin

Les tests existants `DeviceSummaryScreen`, `DeviceDetailScreen`, `EntityCard` et switch restent verts. Ajouter : contenu à 360/440 px, navigation injectée, cible devenue cachée/supprimée/autre profil au moment du clic, extraction sans double dispatch. Même parcours natif et mêmes URLs qu’avant. Pas de test snapshot de toutes les couleurs.

Terminé : deux contenus réutilisables, routes inchangées en comportement, aucune duplication métier. Preuve dans `docs/stage0/detail-panel-validation.md` (nouveau, append par lot).

## B02 — Prototype du contrat URL / historique / focus

**Taille S–M · dépend B01 · condition avant B03.**

Livrer `docs/design/detail-panel-navigation.md` (nouveau), un petit modèle pur sous `src/navigation/` et une preuve navigateur sur sample. **Ne pas implémenter le panneau entier avant de résoudre l’historique.**

### Modèle à rendre explicite

Un seul propriétaire de la cible de détail, distinct de la sélection spatiale :

```ts
// Proposition d’API, pas un type déjà présent dans le dépôt.
type DetailTarget =
  | { kind: "device"; profileId: string; deviceId: string }
  | { kind: "reading"; profileId: string; entityKey: string };
```

L’origine de focus est une clé UI stable et bornée, pas un nœud DOM sérialisé, une observation ou un grant. Le parent d’une lecture se résout depuis les observations courantes ; pas de deviceId supposé à partir du nom.

L’ADR choisit l’adaptateur compatible avec la **version installée** d’Expo Router. Comparer un layout de routes persistantes avec un workspace à cible encodée dans l’URL ; retenir celui dont le prototype passe la matrice. Ne pas mélanger arbitrairement `history.pushState` et une pile Expo que le routeur ne connaît pas. `setParams` seul ne donne pas une entrée Back ; des `push('/')` successifs peuvent retenir plusieurs Home.

### Matrice obligatoire, résultat décrit avant le code final

| Entrée/action | Résultat attendu |
| --- | --- |
| Home → appareil A → lecture de A | Cible et URL correspondent ; la maison reste visible sur desktop |
| Back deux fois puis Forward | Lecture → appareil → liste → appareil ; pas de deuxième renderer |
| Appareil A → appareil B | Règle push/replace choisie et documentée ; Back déterministe |
| Fermer depuis une navigation interne | Retour au niveau attendu, focus vers l’origine visible |
| Lien direct de détail / nouvel onglet | Contenu disponible après connexion au profil attendu ; fermer ramène à une liste interne, jamais aveuglément au site précédent |
| Reload sans session | État de connexion ; la cible n’est pas traitée dans un autre foyer ; retour après login seulement si valide |
| Resize 1440→430→1440, zoom 200 % | Même cible/données ; présentation route compacte ou panneau, pas de seconde session ni double commande |
| Profil différent / entité supprimée / cachée | Détail invalidé ou indisponible, aucune action vers l’ancienne cible |
| Pièce/étage changé pendant détail | Filtre spatial conservé selon UX05 ; règle de fermeture explicitée, aucun changement silencieux de cible |

Conserver les routes canoniques `/appliance/[id]` et `/device/[key]` et leurs deep links. Les nouveaux liens d’entité doivent transporter ou lier explicitement leur profil ; un lien ancien sans profil ne doit pas être réinterprété automatiquement après un changement de foyer. Définir une compatibilité bornée dans l’ADR. Les identifiants dans les URLs ne contiennent jamais credentials ni observation brute.

**Fin :** URLs réellement observées, séquence Back/Forward, nombre de Home/scènes vivants et focus vérifiés sur le prototype. Si aucune approche ne respecte ces points, livrer le constat/reproducteur à A ; ne pas masquer la difficulté par un `router.replace('/')` universel.

## B03 — Brancher le panneau et les interactions

**Taille M · dépend B02 vérifié.**

### Fichiers

B possède `app/_layout.tsx`, wrappers de détail, `HomeScreen.tsx`, `AppShell.web.tsx`, son CSS, `deviceNavigation.ts` et `spatial/navigation.ts`. Créer un `DetailPane` sous `components/details/`. **Ne pas copier Home dans un `DesktopHome`.** Les contrôles de commande et les modules de caméra restent gelés.

### Comportement

- Même contenu B01 dans le panneau et dans les routes compactes/natives. Le panneau a un titre, une fermeture nommée, un scroll clairement délimité et une largeur réellement mesurée.
- Largeur de départ proposée : 360–440 px, bornée par la place restante. À 1024 px avec rail/plan, réduire la disposition ou revenir à la présentation compacte plutôt que comprimer des boutons. Le breakpoint global n’est pas une promesse que trois colonnes entrent partout.
- Attention globale, état de connexion et accès aux commandes restent atteignables. Les détails ne dupliquent pas l’attention ou les appareils dans une seconde arborescence cachée.
- Carte → appareil, lecture → lecture, marqueur → lecture après les gardes P04. Ouvrir un marqueur ne change pas le filtre de pièce. L’action On/Off garde sa zone sœur et n’ouvre pas le panneau.
- Conserver sélection, vue explicite et panne 3D pendant ouverture/fermeture. La scène visible reste une instance unique. Ne pas stocker les observations ni la caméra mutable dans un second Zustand.
- Focus : titre à l’ouverture ; au retour origine si encore visible, sinon titre de liste. Un appui Échap fait une action : confirmation annulable d’abord, détail ensuite, caméra seulement si la scène est ciblée. Un panneau non modal n’a pas de piège Tab arbitraire ni `aria-modal=true`.
- Aucune animation obligatoire ; respecter reduced motion, notamment pour le déplacement du panneau. Réutiliser thème/espacements/icônes existants.

### Tests

Modèle pur de navigation + tests de contenu et de cible périmée ; browser réel pour Back/Forward/deep links/focus, compteur renderer, redimensionnement et claviers. Profils A/B avec identifiants d’entités identiques : pas de réinterprétation croisée. Cliquer On une fois dans Home puis ouvrir le panneau pendant accepted/unconfirmed : même résultat, aucun deuxième service. Ne pas prétendre prouver l’effet physique avec cette fixture.

## B04 — Recette et relais à A

**Taille S · dépend B03.**

Nouveau runner `scripts/check-detail-panel.mjs` réutilisant le snapshot public et le serveur existants ; pas de changement du smoke commun ou de `package.json` par B. Captures uniquement sample, erreurs/requests externes collectées, fermeture des ressources en `finally`.

Recette : 430/1024/1280/1440, zoom réel 200 % dans le profil de test, panneau étroit, souris/clavier, lien direct hors session, reconnexion fixture, fallback WebGL, Return/Forward, focus. Les tests natifs de contenu/routes doivent passer ; l’acceptation APK de la nouvelle source appartient à A03.

Livrer : commits B01–B04, ADR choisie, liste exacte des API changées, tests et limites. Demander à A de raccorder la commande et de revoir les fingerprints applicables. C ne doit pas modifier sa navigation d’auth pour connaître les détails internes du panneau : sa destination reste une URL interne validée et facultative.

**Hors périmètre :** nouveaux contrôles, nouvelles catégories HA, couleurs/halos d’état, murs escamotés, déplacement de HA, sync de préférences, refonte de toutes les listes.
