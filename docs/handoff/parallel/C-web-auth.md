# Agent C — connexion Chrome durable, native préservée

Lire le [contrat commun](README.md). Correspondance : **D02**. Priorité P1, forte valeur quotidienne. Quatre petits livrables ; ne pas commencer par persister le token longue durée existant dans localStorage.

## Constat dans le code et sources

- `credentialStorage.web.ts` expose deux maps en mémoire ; native utilise son journal et SecureStore. `Credentials` gère une sauvegarde journalisée et le nettoyage des secrets remplacés.
- `SessionManager.connect` reçoit actuellement `ConnectionSettings` avec token ; `HomeAssistantBackend` construit `createLongLivedTokenAuth` puis la connexion officielle. `ready` n’est atteint qu’après synchronisation.
- `SettingsScreen` contient le formulaire actuel et le loader local explicite. `runtime.ts` construit l’unique session. Les préférences/grants sont séparés des credentials.
- Le backend possède déjà les réessais réseau/synchronisation. Ajouter un deuxième orchestrateur de reconnexion dans l’écran ou l’adaptateur OAuth serait une régression.
- Bibliothèque **installée : home-assistant-js-websocket 9.7.1**. Lire `dist/auth.d.ts`, `dist/auth.js`, `README.md` ; elle expose `Auth`, `refreshAccessToken`, `revoke`, `createConnection`, ainsi que `getAuth` avec hooks de stockage.
- Dans cette version, les options `getAuth` n’exposent pas PKCE ; son `state` encode l’instance/client et ne constitue pas à lui seul un nonce aléatoire lié à une transaction de Maurice. Son callback `saveTokens` retourne `void` : un store asynchrone demande une gestion explicite des erreurs et écritures en cours.

La [documentation officielle HA consultée le 22 octobre](https://contributors.home-assistant.io/core/internals/auth-api/) décrit authorization code, refresh, révocation et PKCE S256. Le client ID et la redirection doivent respecter son contrat. **Vérifier la compatibilité avec HA 2026.10 minimum réellement supporté par Maurice**, plutôt que supposer que la documentation courante et l’API du client installé sont identiques. Les décisions de stockage ci-dessous sont une proposition d’architecture Maurice, pas une garantie fournie par HA.

## C01 — Contrat et prototype d’authentification

**Taille M · prêt maintenant · condition avant C02/C03.**

Créer `docs/design/browser-auth.md` et un prototype borné avec fixture publique. L’intégrateur A relit les limites et les interfaces ; ne pas demander à l’utilisateur d’arbitrer des détails ordinaires d’implémentation.

### Décisions à fermer dans l’ADR

1. **Flux** : autorisation HA dans le navigateur, échange du code, client `Auth` officiel pour WebSocket/refresh. Préférer un adaptateur étroit de transaction/exchange si `getAuth` installé ne permet pas nonce/PKCE corrects ; ne pas réécrire le protocole HA. Pas de mise à niveau de dépendance sans A.
2. **Origines** : normaliser avec la règle existante ; autorisation de l’instance explicitement choisie. Tableau app localhost/HA HTTP local, app HTTPS/HA HTTPS, app HTTPS/HA HTTP. Vérifier restrictions navigateur/redirect/CORS ; une combinaison incompatible affiche une aide et ne déclenche pas de contournement proxy.
3. **Transaction** : nonce imprévisible, instance/client/redirect attendus, expiration et consommation unique, verifier PKCE si support vérifié, destination interne facultative. Le callback ne choisit jamais sa destination HA depuis un `state` non validé. Pas d’échange de code après state absent, faux, périmé ou rejoué.
4. **Redirection** : nouvelle route `app/auth-callback.tsx`, chargement direct supporté ; retirer code/state de l’URL après traitement sans journaliser leur contenu. Valider le retour interne (origin + chemins autorisés), interdire URL externe et boucle callback. C ne change pas `app/_layout.tsx` concurremment avec B.
5. **Identité** : conserver le profileId basé sur l’origin normalisé pour plan/préférences, mais traiter explicitement le changement de compte HA sur cette même instance. Vérifier l’identité de l’utilisateur via l’API officielle après auth ; ne pas réutiliser des grants d’un autre principal. En cas d’identité précédente inconnue (migration du login manuel), partir sans permission de commande web, en conservant le plan/favoris. Faire documenter par A cette extension du contrat M01 avant C03, pas une migration silencieuse.
6. **Périmètre** : web seulement pour le nouveau flux ; token manuel natif et démo conservés. Le loader `.local` reste dev-only, explicite et en mémoire. Aucun secret OAuth dans le cockpit store, commandStore, diagnostics, payload scène ou préférences schéma 3.

### Contrat de stockage proposé

- Mode par défaut : session mémoire. Une case produit explicite **« Remember this browser »**, non précochée, autorise la persistance du refresh token OAuth ; pas du token longue durée saisi à la main.
- Store web dédié/versionné, proposé IndexedDB : origin HA, client ID, principal vérifié, refresh token, métadonnées de version/expiration utiles. Garder l’access token en mémoire si l’API permet sa reconstruction via refresh. Aucun fichier `.local` comme backend produit.
- Ce stockage est accessible au code du même origin. Ne pas le présenter comme SecureStore ni promettre une protection XSS par un chiffrement dont la clé serait sauvegardée au même endroit.
- Nonce/verifier et métadonnées de transaction peuvent être éphémères en sessionStorage pour survivre à la redirection ; aucun access/refresh token dans cette transaction. Nettoyage TTL/annulation/succès.
- Échec/quota du store : session mémoire encore utilisable, mémorisation annoncée comme échouée. Pas de succès de sauvegarde fictif.
- Forget/logout supprime d’abord l’usage local de la connexion, ferme/invalide les cibles et efface la persistance. Révocation distante tentée selon l’API vérifiée ; réseau indisponible = résultat qualifié, pas token conservé secrètement pour réessayer sans fin.
- Onglets : notification de logout sans token (ex. BroadcastChannel), invalidation des opérations en vol. Un refresh ou une sauvegarde tardive ne doit pas recréer le secret après logout ; génération/transaction persistée à définir et tester. Chaque onglet conserve sa session, aucune socket partagée introduite.

### Preuve attendue

Fixture démontrant nonce/instance/redirect corrects, refus de replay, PKCE supporté ou incompatibilité clairement identifiée, code consommé une seule fois, erreur nettoyée. ADR avec API interne proposée et liste de fichiers. **Ne pas débloquer C03 avec une simple capture de page de login.**

## C02 — Brancher l’autorisation en mémoire

**Taille M · dépend C01 · livraison incrémentale sans stockage durable.**

### Architecture

Nouveaux modules proposés `src/services/auth/browserAuth.web.ts`, `authTransaction.web.ts`, types/test doubles associés, et un adaptateur natif neutre si une interface partagée est importée. Le type `ConnectionSettings` existant reste accepté ; introduire un mode/runtime auth distinct si nécessaire, sans fabriquer un token vide pour passer `validateSettings`.

`SessionManager` conserve l’unique autorité de session/cibles ; `HomeAssistantBackend` reste propriétaire de la récupération et reçoit une source d’auth vérifiable. Une instance `Auth` ne doit pas être sérialisée dans le store. C peut refactorer ce raccord, mais ne change ni statut public ni façade de commande consommés par B.

### Étapes

1. Ajouter dans Settings l’action de login HA et le retour callback. Conserver le formulaire manuel et sa qualification mémoire sur web ; textes adaptés au mode effectivement actif.
2. Au callback valide, obtenir les credentials en mémoire, ouvrir la connexion officielle, vérifier principal/version/snapshot, puis marquer la session prête. Ne pas accorder une commande à la seule réception du token.
3. Distinguer erreur réseau de refresh, révocation/invalid auth et version HA non supportée. Réseau : stratégie bornée du backend, sans effacer une autorisation valide. Auth terminale : demander de se reconnecter, pas boucle de redirection automatique.
4. Annuler le callback/refresh obsolète après changement d’instance, logout ou tentative plus récente. Aucun `ready` tardif d’une ancienne session, aucune commande rejouée.
5. Conserver `session.connect` manuel, `bootstrap`, Retry, Forget, foreground et chargement des préférences natifs ; tests de credentials/journal existants inchangés ou étendus avec justification.

### Validation / fin

Tests unité transaction/adaptateur + `SessionManager`/backend/credentials ; fixture WebSocket officielle, version/refus/retard, changement de profil et ancien handler. Un login réussit et les observations arrivent ; reload en mode mémoire demande encore une connexion. Aucun token trouvé dans les stockages browser/URLs/logs/report. L’auth réelle HA, si nécessaire à la compatibilité, est **en lecture seule** et documentée séparément.

## C03 — Mémorisation opt-in, renouvellement, logout

**Taille M · dépend C02 et contrat C01 relu.**

Créer le store auth web choisi dans C01, migrations/validation et son contrôleur de vie. Aucun changement du schéma des préférences de maison.

- Persister uniquement après consentement produit et réussite de la connexion/identité attendue. Un redirect réussi suivi d’une première sync en échec ne devient pas une connexion enregistrée fictivement prête.
- Au redémarrage, charger la session mémorisée exacte, renouveler si nécessaire, ouvrir HA puis obtenir un snapshot frais avant de réactiver les commandes.
- Serialiser les refresh concurrents et traiter les writes asynchrones malgré le hook `saveTokens:void` de la bibliothèque. Les rejets sont observés ; logout/Forget ont priorité sur une écriture tardive.
- Multi-onglets : refus de réapparition du secret, notification de déconnexion au bon profil, pas de transmission de token via événements, aucun réenrollment automatique.
- Invalid auth/révocation : nettoyage local exact, explication utile et reconnexion explicite. HTTP réseau temporaire : pas de destruction automatique de préférences/grants, pas de retry côté UI en doublon.
- Migration depuis D01 : ne pas aller chercher le token manuel en mémoire/.local pour le rendre durable. Préférences existantes conservées ; permissions traitées selon la règle de principal C01. Native SecureStore ne migre pas vers OAuth dans ce ticket.
- Forget et arrêt de mémorisation ont des sémantiques distinctes et décrites. Conserver l’action Forget actuelle fonctionnelle ; aucun bouton ne promet d’effacer des données qu’il conserve.

### Tests d’acceptation

| Scénario | Attendu |
| --- | --- |
| Sans opt-in → reload | Aucun secret durable, connexion nécessaire |
| Avec opt-in → fermeture/réouverture du navigateur | Reconnexion au bon profil sans ressaisie, puis snapshot frais |
| Access expiré / deux appels concurrents | Refresh coordonné, une session cohérente, pas de service rejoué |
| Refresh rejeté / révoqué | Nettoyage + reconnexion explicite, pas de boucle |
| HA momentanément absent au lancement | Erreur réseau honnête/récupération, pas statut « retrying » fictif |
| Logout pendant callback, refresh ou écriture | Aucune résurrection du secret/session/permission |
| Logout dans autre onglet | Cibles locales invalidées, ancien appui refusé |
| Même origin, autre compte HA | Plan conservé, aucune permission héritée sans preuve d’identité |
| Quota/stockage corrompu | Échec qualifié, pas de token dans les messages, usage mémoire possible |
| Token manuel / APK existant | Journal, SecureStore, Forget et retry restent compatibles |

## C04 — Recette portable et relais

**Taille S · dépend C03.**

Créer `scripts/check-web-auth.mjs` et `scripts/lib/web-auth-fixture.mjs`. Garder la fixture existante de commandes inchangée pour éviter un conflit avec A. Réutiliser les outils de snapshot/export/preview ; un serveur OAuth simulé accepte uniquement des codes/tokens publics et ne transmet rien au foyer.

Deux contextes ou onglets + redémarrage de profil de test pour prouver la durée de vie ; vérifier origin/state, code non rejoué, mémoire versus opt-in, refresh, logout, quotas et absence de secret dans le rapport/captures. Nettoyer les profils jetables. Les credentials publics de fixture sont distincts des secrets réels ; ne jamais injecter le token `.local` dans la recette CI.

Livrer commits C01–C04, ADR et rapport `docs/stage0/browser-auth-validation.md`. A raccorde runner/CI/audit et rejoue les tests de B. Mettre à jour les textes de Settings possédés par C ; A met à jour `docs/design/desktop.md`, les index et le contrat M01 pour distinguer le mode manuel en mémoire du mode OAuth opt-in.

**Hors périmètre :** compte Maurice, serveur proxy de credentials, synchronisation de maisons/grants, changement d’origin HA, auth native OAuth, PWA/service worker, commandes supplémentaires, publication.
