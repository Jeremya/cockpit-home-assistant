# UX02 — Extraire le contrôleur de commande sans changer son comportement

Statut : **commité localement avec UX03 le 20 octobre 2026, non poussé** (hook `useSwitchCommand`, tests ciblés 144/144, suite complète verte). Extraction ciblée avant l'action de carte. UI de `SwitchControl` visuellement et fonctionnellement inchangée.

## Lire avant de modifier

- `src/components/controls/SwitchControl.tsx` en entier.
- `src/commands/switchControl.ts`, `src/commands/store.ts`.
- `src/components/controls/__tests__/{SwitchControl,PowerEnrollment}.test.tsx`.
- [M01](../design/power-enrollment.md) et [C07a](../design/switch-controls.md).

Il n'existe pas encore de `useSwitchCommand`. Ne pas ajouter un deuxième chemin de dispatch.

## Extraction proposée

Créer `src/components/controls/useSwitchCommand.ts`. Il reçoit les mêmes `entity`, `snapshot`, `profileId`, `mode`, `ready` que le contrôle, plus `savingPermission?: boolean`.

Déplacer, sans réécriture de logique :

- écoute d'AppState et nettoyage ;
- lecture des préférences/du grant, restrictions d'identité et de commande ;
- souscription `latestCommand` + filtrage `entityId`, `visibleCommand`, `switchCommandBusy` ;
- calcul de `blocked`, incluant la sauvegarde d'une permission ;
- `useMemo` qui capture la cible et **toutes ses dépendances actuelles** ;
- fonction `send(on)` : revalidation synchronisée, lecture synchrone du commandStore, retour `refused`/`no-op`, aucune promesse gérée par l'écran ;
- notice locale et remise à zéro au changement d'AppState.

API proposée (reprendre les types existants, ne pas recopier leur définition) :

```ts
{
  active, grant, identityRestriction, blocked, busy,
  outcome, notice, setNotice,
  send: (on: boolean) => void,
  dismissOutcome: () => void
}
```

Ne pas exposer la cible capturée au composant appelant. `dismissOutcome` utilise l'outcome courant et `session.dismissCommand`, pas une copie persistée.

`SwitchControl` conserve `review`, `saving`, `beginPermission` et `savePermission`, ainsi que les boutons/revue/texte existants. Il passe `savingPermission: saving` au hook. Ses messages d'enrôlement peuvent continuer via `setNotice` afin de préserver la priorité actuelle des messages.

## Invariants à conserver mot pour mot dans le raisonnement

- Une fermeture de callback ancienne ne peut pas capturer une nouvelle cible au moment du clic.
- Comparer profil, session, epoch, clé/ID et empreinte de permissions comme aujourd'hui.
- Deux pressions dans le même rendu ne font pas deux envois.
- `accepted` reste occupé en attendant l'observation ; un accusé ne change pas l'état.
- Le manager reste le contrôle final, y compris pour les révocations synchrones.
- Une permission en cours de sauvegarde n'est pas utilisable.
- Aucun retry de commande, timer de reconnexion, `setState` optimiste sur l'entité ni service HA direct.

## Vérification

```sh
npx jest --runInBand src/components/controls/__tests__/SwitchControl.test.tsx src/components/controls/__tests__/PowerEnrollment.test.tsx src/commands/__tests__/switchControl.test.ts src/session/__tests__/SessionManager.test.ts
npm run typecheck
npm run lint
npm run format:check
```

Les tests existants doivent passer sans affaiblir leurs attentes. Ajouter un test seulement si une frontière extraite n'est plus exercée. Dans la démo, le résumé garde ses deux boutons et sa revue de permission reste identique dans la fixture HA.

## Hors périmètre et clôture

Pas encore de bouton dans Home, pas de permission additionnelle et pas de modification des signatures du manager. Mentionner l'extraction dans le contrat de contrôles ; conserver l'acceptation physique antérieure comme historique, sans la réattribuer à ce code.

Lot suivant : [UX03](UX03-card-action.md).
