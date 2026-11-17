# Vague 2 — rapport D : objets du foyer (H01) et caméra Android

Agent D, [vague 2](../handoff/parallel/2026-11-16-wave-2.md) et son extension du 17 novembre (ADR-19). Base `0f6d5fb41e1126d4e5fb82f6626458b96f0e59cb`, worktree `../maurice-wave2-D`. Correctifs caméra : PR draft [#5](https://github.com/Jeremya/cockpit-home-assistant/pull/5) (`work/wave-2-D`, `f8b0144`). Rapport public anonymisé : pas d'adresse, de compte, de jeton ni de capture du foyer. Les preuves brutes sont dans `.local/proof/wave2-D/` (ignoré). Le coordinateur (A) réconcilie `inventory.md`, les index et les registres.

**Maturité, à ne pas confondre (mise à jour après le candidat `948e642`) :**
- **HA :** inspecté, avec une configuration réversible appliquée.
- **Nouvelles intégrations :** aucune réalisée. Toutes attendent une connexion interactive du propriétaire.
- **Caméra :** deux défauts reproduits sur Android au build `0f6d5fb`, puis leurs correctifs **observés sur le Seeker** au candidat `948e642`. Pixel non exécuté.
- **Ce que la caméra ne prouve pas :** toutes les images des §4 et §5 viennent de la fixture publique `scripts/camera-fixture.mjs`, un serveur local qui imite `camera_proxy`. **Aucune caméra Ring n'est intégrée** : le comportement avec Ring reste inconnu.

## 1. État réel de Home Assistant (lecture seule, 17/11 vers 15:20 UTC)

Méthode : commandes WebSocket de lecture (`get_config`, `get_states`, `config_entries/get`, registres d'appareils, d'entités et de zones, `manifest/list`). Jeton lu localement, jamais affiché. Snapshot brut privé : `.local/proof/wave2-D/ha-snapshot.json`.

- HA `2026.10.1` en conteneur Docker sur le Mac de développement (`compose.yaml`). Il n'y a pas d'add-ons : pas de Matter Server ni de proxy Bluetooth intégrés.
- Matériel réel présent : TP-Link `tplink` (entrée utilisateur), Petlibro `petlibro` 1.2.32 (custom, `cloud_polling`), **deux Bitaxe** `bitaxe` 1.1.1 (custom, `local_polling`).
- **Absents de HA : Nest, Schlage, SmartThings, Ring.** Aucune entrée de configuration n'existe pour eux.
- Contamination démo : l'intégration HA `demo` était chargée par `configuration.yaml`. Maurice n'a aucun filtre par plateforme (`src/core/selectors.ts` `isVisible`), donc **ses 72 entités de registre étaient visibles par défaut dans le foyer réel**. Elles s'ajoutaient à 33 entités d'état sans registre (serrures, caméras, humidificateurs, lecteurs…), dont celles des domaines observés par Maurice (`lock`, `camera`…). Voir §3.
- `last_updated` de Kasa et Petlibro ≈ heure du redémarrage précédent : c'est l'absence de changement d'état, pas une preuve de données périmées.

## 2. Matrice des objets

| Objet | Modèle confirmé | Intégration / version | Chemin | Exposé dans HA (activé) | Fraîcheur / disponibilité | Dans Maurice | Blocage | Prochain geste |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Prise TP-Link | **HS103**, HW 5.0, FW 1.0.13 (registre HA) | `tplink` officielle (cœur 2026.10.1) | Local | 3 entités (dont 1 switch) ; 3 désactivées | Toutes disponibles | Carte Kasa, cycle M01 accepté sur Pixel Trial 1009 (preuve antérieure) | Aucun | Fiabilité sur 7 jours (M05) ; placement M02 |
| Distributeur Petlibro | **PLAF103** Granary, FW 1.1.15, HW 1.0.0 | `petlibro` custom **1.2.32** | Cloud (polling) | 82 entités : capteurs, binaires, nombres, sélections, 2 switches, 13 boutons, 2 images, 2 dates, 1 mise à jour ; plus 2 entrées « Pet » de compte (pas des distributeurs) | 69 OK ; les 13 boutons sont « unknown » (jamais pressés, normal). Transitoirement « unavailable » juste après le redémarrage de HA, revenus ensuite | Résumé U03, 23 lectures (preuve antérieure) | Sens batterie/alimentation non établi ; aucune commande autorisée | Valider la sémantique batterie avec le propriétaire ; aucun bouton d'alimentation |
| Bitaxe ×2 (**nouveau**, absent de l'inventaire) | **BM1370**, FW v2.15.3 | `bitaxe` custom **1.1.1** | Local (polling) | 92 entités : 90 capteurs (2 désactivés), 2 mises à jour (catégorie diagnostic) | 90/90 actives disponibles | **88 capteurs visibles par défaut** (sans catégorie d'entité ni masquage) | Déjà intégrés dans HA (pas une nouvelle intégration) ; cartes denses et 5 « issues » bruitées chacune (§6) | Décision produit sur la présentation compacte proposée (§7) ; aucune visibilité modifiée |
| Nest Learning Thermostat | **3e génération** (réponse du propriétaire, 17/11) | Non configurée. Officielle `nest` (API SDM, `google-nest-sdm` 9.2.1 présent dans le conteneur) | Cloud SDM ; la doc HA indique que « tous les thermostats Google Nest » sont exposés en `climate`, sans nommer la 3e génération | — | — | — | **Frais Device Access de 5 $ (achat non autorisé)**, projet Google Cloud (API SDM + Pub/Sub), identifiants OAuth avec redirection `my.home-assistant.io` | Attendre l'accord explicite pour les 5 $. Ensuite, climat en lecture seule, **aucune consigne** |
| Serrure Schlage | Encode Plus (déclaré, pas vu dans HA) | Non configurée. Officielle `schlage` : Encode Plus listée comme testée, `pyschlage` 2026.9.0 installé | Cloud, serrure en Wi-Fi | — | — | — | **Seule étape restante : les identifiants Schlage, saisis par le propriétaire dans HA** (§8) | Le propriétaire ajoute l'intégration ; lecture seule, **aucun déverrouillage** |
| Samsung | **Électroménager** (réponse du propriétaire) ; identifiant fourni introuvable publiquement | Non configurée. Officielle `smartthings` (connexion par compte Samsung, `pysmartthings` 4.0.3) | Cloud SmartThings | — | — | — | **Abonnement payant probable.** Selon la doc HA, l'accès gratuit à l'API SmartThings se retire progressivement depuis octobre 2026, au profit d'un « Personal Plan » à 4,99 $/mois. Non vérifié sur ce compte. Aucune souscription lancée | Le propriétaire décide s'il s'abonne. Sinon, l'appareil reste hors périmètre |
| Ring | « Plusieurs caméras », modèles inconnus | Non configurée. Officielle `ring` (`ring-doorbell` 0.9.14) | Cloud ; caméras `live_view` et `last_recording`, cette dernière désactivée par défaut et soumise à Ring Protect pour la vidéo | — | — | — | Identifiants Ring et code de vérification (2FA), saisis dans HA. La doc ne dit pas si un instantané `live_view` exige un abonnement | Le propriétaire connecte ; D teste ensuite `camera_proxy` dans Maurice, sur une vraie caméra Ring. Les résultats de la fixture n'en tiennent pas lieu |
| AIRTAP | Non confirmé : gamme AC Infinity AIRTAP (ventilateur de bouche) ; FW `F1.0.26`. Le manuel liste 8 références (AC-RBF4, -RBF42, -RBF6, -RBF62, chacune en -B/-W). Les fiches CSA donnent les variantes « 2 » comme connectées en Wi-Fi | Aucune intégration officielle trouvée | Inconnu. Écoute mDNS passive du réseau le 17/11 : aucun service `_matter`/`_matterc`, aucun nom AC Infinity | — | — | — | Référence exacte, lisible seulement sur l'étiquette ; pas d'adaptateur Bluetooth ni de Matter Server dans ce HA en conteneur | Le propriétaire lit l'étiquette ; décision ensuite sur Matter/BLE |
| Démo HA | — | `demo` | — | **Retirée** (§3) | — | Ne pollue plus le foyer réel | — | A annote les preuves antérieures qui s'en servaient |

Aucune compatibilité n'est déduite de la marque ni du nom d'entité. Aucun backend fournisseur n'a été ajouté à Maurice, et aucune commande n'a été envoyée à un appareil.

## 3. Configuration HA réalisée : retrait de la démo

Accord du propriétaire le 17/11 ; B confirmé hors HA réel, C inactif, A prévenu.

1. **Sauvegarde** : `.local/proof/wave2-D/ha-backup-20261117-092639/` (`configuration.yaml`, copie de `.storage/`, `known_devices.yaml`).
2. Ligne `demo:` retirée de `configuration.yaml` ; `check_config` sans erreur.
3. Entrée de configuration `demo` supprimée (`DELETE /api/config/config_entries/entry/<id>`, `require_restart: false`).
4. **Redémarrage HA le 2026-11-17 à 15:27:54 UTC.** Snapshot après : 0 entité de plateforme `demo`, Kasa, Petlibro et Bitaxe présents.
5. `known_devices.yaml` (uniquement `demo_paulus`, `demo_anne_therese`, `demo_home_boy`) sauvegardé puis vidé. **Effectif au prochain redémarrage HA** : les trois `device_tracker.demo_*` restent jusque-là (domaine non affiché par Maurice).

Retour arrière : restaurer `configuration.yaml` et `known_devices.yaml` depuis la sauvegarde, puis redémarrer ; l'entrée `demo` est recréée par l'import.

**Résultat, constaté sur le snapshot pris après le redémarrage :**
- 72 entités de registre de plateforme `demo` et 30 entités d'état sans registre ne sont plus présentes (serrures, caméras, climatisation, volets, ventilateurs, lumières, aspirateurs, vannes, lecteurs, capteurs…).
- Les trois `device_tracker.demo_*` partiront au prochain redémarrage *naturel* de HA. Je ne redémarre pas HA uniquement pour ce nettoyage : Maurice n'affiche pas ce domaine.
- Restent dans HA, comme prévu : `sun.sun`, `zone.home` et `conversation.home_assistant` (cœur), ainsi que le matériel réel.
- La liste exacte des identifiants retirés (noms standard de l'intégration démo de HA) reste en preuve privée : `.local/proof/wave2-D/demo-entities-before.json`.

Conséquence pour les registres : toute preuve antérieure qui s'appuyait sur ces entités dans le HA de développement n'est plus reproductible telle quelle.

## 4. Caméra sur Android (D1)

**Binaire :** Seeker (Android 16), APK de preuve `com.larrabee.homecockpit.s02proof` 0.1.0 (1), SHA-256 `66a7f47f75e065d5c44929cc0e21ddc69bc022006312de3f437f1bd5df80580d`, source `0f6d5fb`, installé par A ; pas de réinstallation. Créneau accordé par A après la libération par B ; toutes les commandes adb ciblent explicitement le numéro de série (non publié). Fixture `scripts/camera-fixture.mjs` sur 8124/8125 via `adb reverse`, jeton public. Captures **de la fixture seulement**, dans `.local/proof/wave2-D/seeker/`.

**Fetch effectif : celui d'Expo.** Chaque requête annonce `Accept-Encoding: zstd, br, gzip` (intercepteur Expo) et `okhttp/4.9.2`. L'en-tête est consigné par la fixture, qui n'enregistre pas le jeton.

| # | Scénario | Carte observée | Journal des origines | Verdict sur `0f6d5fb` |
| --- | --- | --- | --- | --- |
| 1 | Image | Cadre à bandes complet, « Fetched » | A, avec credential | **Pass** : `arrayBuffer()` Expo, base64 sous Hermes et rendu établis |
| 2 | Redirection même origine | Cadre | A : proxy puis `/frames/same-origin.png`, credential sur les deux | **Pass** |
| 3 | Redirection autre origine | « The image redirects to another server and was not loaded. » | A : 1 requête ; **B : 0 requête** | **Pass** : OkHttp ne suit pas |
| 4 | Pas une image | « Home Assistant did not return an image. » | A : 1 | **Pass** |
| 5 | Octets indécodables | « The image could not be loaded. » (`onError` déclenché) | A : 1 | **Pass** |
| 6 | Corps coupé | **Cadre partiel (une bande, le reste vide) avec « Fetched »** | A : réponse non terminée | **Échec reproduit (D2)** |
| 7 | Corps bloqué | « The image request timed out. » | Fermée par le client à **15 015 ms** | **Pass** |
| 8 | Aucune réponse | « The image request timed out. » | Fermée à **15 002 ms** | **Pass** |
| 9 | 401 | « Home Assistant rejected the request. » | A : 1 | **Pass** |
| — | Sortie d'écran pendant le scénario 8 | — | Requête restante fermée à 14 995 ms | Conforme au contrat (pas d'annulation à la sortie) |
| — | Arrière-plan à 3 s, reprise à 5 s (scénario 7) | — | **2 requêtes ouvertes en même temps** | **Échec reproduit (D3)** |
| — | Contrôle : réouverture avec un cadre retardé de 8 s | Ancien cadre (10:00:19) pendant 8 s, puis nouveau (10:00:30) | — | Le cache est observable |
| — | Forget → reconnexion → réouverture (8 s) | **« Loading image… »**, puis nouveau cadre (10:03:16) | — | **Pass** : pas de réutilisation après oubli |

Pour finir : profil fixture oublié, app remise en « Explore demo home », `adb reverse` supprimés, `font_scale` 1.0, Trial 1012 non touché, Seeker rendu à A.

### Observation de confidentialité (hors de mon périmètre, transmise à A)

Après « Connect » sur l'écran Connection (champ « Long-lived access token », masqué), Android a affiché la feuille **« Save password to Google Password Manager? »**, préremplie avec l'URL comme nom d'utilisateur et le jeton comme mot de passe. Elle a disparu sans aucun tap de ma part ; je ne peux pas prouver qu'elle n'a rien enregistré (il s'agissait du jeton public de la fixture). Seeker sous Android 16 ; la version du service Autofill n'a pas été relevée, le téléphone étant déjà rendu. Avec un vrai jeton HA, ce serait une fuite possible vers un tiers. Le correctif touche l'écran de connexion et les identifiants, hors de mon périmètre ; A le remonte au propriétaire pour lui attribuer un responsable.

## 5. Correctifs (D2, D3) et preuve non native

Les deux défauts ont été reproduits sur Android avant toute correction.

- **D2 — corps tronqué.** `fetchCameraImage` accepte une option `verifyDeclaredLength`. Quand elle est active, un corps plus court qu'un `Content-Length` purement numérique donne `network`. Le hook l'active seulement si `Platform.OS !== "web"`.
  - Pourquoi c'est sûr sur natif : `TransparentCompressionInterceptor` d'Expo retire `Content-Length` quand il décompresse (lu dans les sources), et la recette a confirmé que le fetch effectif est celui d'Expo.
  - Le web reste inchangé : un navigateur peut exposer la longueur compressée d'un corps qu'il a décodé.
  - Limite : un corps *chunked* coupé reste indétectable.
- **D3 — chevauchement à la reprise.** La lecture en cours est portée par la carte (`useRef`), plus par une seule exécution de l'effet. À la reprise, la carte attend la même lecture et applique son résultat ; le sondage reprend une fois qu'elle est terminée. La clé profil/entité est conservée : un autre profil lance sa propre lecture.
- **Fixture** : enregistrement de `User-Agent` et `Accept-Encoding`, et un réglage public borné `POST /_proof/camera/config {"imageDelayMs"}` pour la recette d'oubli.
- **Document** `docs/design/camera-images.md` : table de défaillances, décisions, gates et section « Native evidence ».

| Commande (worktree `work/wave-2-D`, Node 24.11.1) | Résultat |
| --- | --- |
| Test D2, puis le même test sans le correctif du service | Vert ; **rouge** sans correctif (1 échec) |
| Test D3, puis le même test sans le correctif du hook | Vert ; **rouge** sans correctif (2 appels au lieu de 1) |
| `npm test` | 85 suites, **1160 tests** |
| `npm run test:tooling` | 41/41 |
| `npm run proof:camera` | PASS, 3 exécutions |
| `typecheck`, `lint`, `format:check`, `check:public-inputs`, `git diff --check` | exit 0 ; plan `sample` |

### Après correctifs : candidat A `948e642` (contient #5 à `f8b0144`)

Seeker, même paquet, SHA-256 `adcdd1da50650303d194f15f13b6ee583836684feb331e44d600d12dd751f83e`, installé par A ; créneau après B et C ; aucune réinstallation. Script de recette privé, une étape par commande (`setup`, `scenarios`, `resume`, `forget`, `late`, `cleanup`). Captures de la fixture seulement.

| Contrôle | Résultat observé | Verdict |
| --- | --- | --- |
| D2 : corps coupé (scénario 6) | « The image could not be loaded. », ni cadre partiel ni « Fetched » | **Pass** (cadre partiel sur `66a7f47f`) |
| D3 : arrière-plan à 3 s, reprise à 5,4 s (scénario 7) | **1 requête ouverte** (2 sur `66a7f47f`) ; fermée à 14 999 ms ; carte « timed out » ; sondage suivant à 15,8 s | **Pass** |
| Redirection vers une autre origine (3) | Refus ; **B : 0 requête** | **Pass** |
| Image (1) | Cadre et « Fetched » | **Pass** |
| Oubli | Contrôle sans oubli : le cadre en cache s'affiche. Après Forget et reconnexion : « Loading image… », puis nouveau cadre | **Pass** |
| Résultat tardif | Lecture lancée avant Forget et livrée à 10 010 ms, après la reconnexion ; la carte rouverte affiche « Loading image… » | **Pass** : le cadre tardif n'est pas réutilisé |
| Autofill | Invite non revue lors des 3 connexions de cette session | Observation, pas une correction |

Nettoyage : profil fixture oublié, retour en démo (placements publics de C intacts), `adb reverse` vides, `font_scale` 1.0, téléphone rendu à A.

**Limites conservées :** un corps tronqué **sans `Content-Length`** (chunked) reste indétectable ; aucune annulation à la sortie d'écran (contrat documenté) ; preuve sur le **Seeker seulement**, Pixel non exécuté.

**Point de revue de B (#5), non reproduit et donc non corrigé :** si le profil est oublié puis reconnecté à la **même URL** (même `profileId`) pendant qu'une lecture est en cours, et que la carte caméra **reste montée** (non focalisée) pendant ce temps, la lecture d'avant l'oubli pourrait être partagée à la reprise (fenêtre ≤ 15 s). Dans la recette Seeker, la carte est démontée et le cadre tardif n'est pas réutilisé. Correctif proposé pour plus tard, hors du code testé à `f8b0144` : inclure l'identifiant de session dans la clé de la lecture partagée, avec un test Jest dédié.

## 6. Présentation actuelle dans Maurice (vrai backend, vrai HA)

Sondage du 17/11 avec `HomeAssistantBackend`, `deviceSummaries` et `assessEntity(…, ready = true)` du code `0f6d5fb`, préférences vides (sans masquage local). Sortie limitée aux comptes, modèles et clés d'intégration ; script privé `.local/d-bitaxe-presence.ts`.

| Carte (appareil HA) | Lectures visibles | « Issues » comptées | Nature des issues |
| --- | --- | --- | --- |
| TP-Link HS103 | 1 | 0 | — |
| PETLIBRO PLAF103 | 23 | 4 | 1 batterie en `attention` ; 3 capteurs à valeur sans règle (`unknown`) |
| Petlibro « Pet » ×2 (entrées de compte) | 9 chacune | 4 chacune | Capteurs à valeur sans règle |
| Bitaxe BM1370 ×2 | 44 chacune | **5 chacune** | Capteurs **textuels avec valeur** sans règle : `autofanspeed`, `bestDiff_formatted`, `bestSessionDiff_formatted`, `overclockEnabled`, `overheat_mode` |
| HA Backup | 5 | 5 | Horodatages `unknown` |

136 entités visibles au total (126 `sensor`, 8 `binary_sensor`, 1 `switch`, 1 `event`). Chaque Bitaxe forme déjà **une seule carte** : les 88 capteurs ne sont pas 88 cartes. Le problème est la densité de chaque carte et l'attention bruitée. Les deux entrées « Pet » du compte Petlibro, que l'inventaire décrit comme n'étant pas des distributeurs, apparaissent comme des cartes d'appareil.

## 7. Proposition : Bitaxe lisibles, entrées « Pet » clarifiées (à décider, non implémentée)

Les Bitaxe sont déjà intégrés dans HA ; ce n'est pas une nouvelle intégration. **Rien n'a été masqué, supprimé ni reclassé**, ni dans HA ni dans Maurice. Toutes les identités ci-dessous viennent du registre HA (snapshot du 17/11) ou du code source de l'intégration, jamais d'un nom d'entité.

### 7a. Bitaxe BM1370 : une carte courte, tout le reste accessible

- **Portée.** Le module ne s'applique que si le fabricant est `Bitaxe`, le modèle `BM1370` et la plateforme `bitaxe` (1.1.1). Il réutilise le mécanisme du Petlibro (`src/core/devices/petlibro.ts`, rôle exact par `translation_key`).
- **Identification sans nom.** L'intégration fixe `unique_id = f"{entry.entry_id}_{description.key}"` (`custom_components/bitaxe/sensor.py:587` ; `_energy` à `:626`). Le rôle est le suffixe exact après `config_entry_id + "_"`, comparé à une liste fermée. Une clé inconnue reste une lecture ordinaire, visible.
- **Carte : 4 lectures-clés.** `hashRate` (GH/s), `temp` (`temperature`, °F), `power` (`power`, W) et `uptimeSeconds` (`duration`). Les 40 autres lectures visibles restent derrière l'expansion existante « All readings for this device ».
- **Expansion : 4 groupes fermés**, sur les 46 clés observées par appareil :
  - Performance : `hashRate*`, `expectedHashrate`, `asic1_hashrate`, `efficiency`, `sharesAccepted`, `sharesRejected`, `errorPercentage`, `asic1_errors`.
  - Thermique et ventilation : `temp`, `temp2`, `vrTemp`, `temptarget`, `fanrpm`, `fan2rpm`, `fanspeed`, `manualFanSpeed`, `minFanSpeed`, `autofanspeed`, `overheat_mode`.
  - Alimentation : `power`, `maxPower`, `voltage`, `nominalVoltage`, `coreVoltage`, `coreVoltageActual`, `current`, `frequency`, `energy`.
  - Minage et réseau : `bestDiff*`, `bestSessionDiff*`, `blockFound`, `blockHeight`, `networkDifficulty`, `poolDifficulty`, `smallCoreCount`, `responseTime`, `wifiRSSI`, `overclockEnabled`.
- **Attention : règles tirées du code de l'intégration**, `sensor.py:396-470`.
  - `overheat_mode` ne vaut que `"Active"` ou `"Normal"` (`:463`). Proposition : `Active` → alerte, `Normal` → normal, toute autre valeur → `unknown`. C'est le seul signal de sécurité de l'ensemble.
  - `autofanspeed` (`On`/`Off`, `:398`) et `overclockEnabled` (`Enabled`/`Disabled`, `:469`) sont des réglages. Ils restent informatifs.
  - `bestDiff_formatted` et `bestSessionDiff_formatted` (`:295`, `:309`) sont des textes d'affichage, informatifs aussi.
  - Effet sur le snapshot du 17/11 : 5 → 0 « issue » par Bitaxe (`overheat_mode` = `Normal` sur les deux), sans masquer une lecture.
- **Propriété.** Le mapper et la sémantique d'attention sont attribués par A ; la présentation partagée relève de B. Décision produit requise avant toute écriture.

### 7b. Entrées « Pet » du Petlibro : des services HA, pas des appareils

- **Constat vérifié.** Les deux entrées ont `manufacturer: "Petlibro"`, `model: "Pet"` et **`entry_type: "service"`** dans le registre d'appareils HA. C'est le marqueur HA d'une entrée qui n'est pas un objet physique. Le même marqueur couvre aussi « Home Assistant Backup », Met.no, Google Translate et une entrée sans fabricant.
- **Contenu de chaque entrée** (rôles par `translation_key`, valeurs gardées privées) :
  - Profil de l'animal (type, race, âge, puce RFID).
  - 3 compteurs de boisson du jour.
  - Objectifs et réglages en catégorie `config`, déjà non visibles par défaut.
- **Cause dans Maurice.** `PhysicalDevice` (`src/core/types.ts:66`) ne porte pas `entry_type`, donc une entrée de service devient une carte d'appareil.
- **Proposition.**
  - Transporter `entry_type` depuis le registre dans `HomeAssistantBackend`.
  - Présenter les entrées `service` sous un libellé distinct (« Service Home Assistant », ici « Profil animal Petlibro »), sans les compter comme des appareils du foyer.
  - **Ne rien masquer** : les lectures visibles aujourd'hui le restent.
  - Le rattachement d'un profil à son distributeur (`bound_device_nums`) n'est pas un lien de registre ; il n'est donc pas proposé.
- **Choix du propriétaire.**
  1. Garder les profils animaux comme cartes de service.
  2. Les déplacer vers le distributeur.
  3. Les laisser dans HA seulement, ce qui exige un geste explicite de sa part et n'est pas fait automatiquement.

## 8. Premier appareil à intégrer : Schlage Encode Plus (prérequis vérifiés, en attente de la connexion)

Choisi parce que c'est l'appareil le plus accessible : il ne demande ni paiement, ni projet développeur, ni OAuth, et l'intégration officielle liste l'Encode Plus comme testé.

| Élément | Constat (17/11, en lecture seule) |
| --- | --- |
| Modèle | Encode Plus (déclaré). Sera confirmé après connexion par le registre HA (fabricant, modèle, firmware) |
| Intégration | `schlage` du cœur 2026.10.1, `cloud_polling`, `config_flow` actif ; `pyschlage` **2026.9.0 installé** dans le conteneur. Entités documentées : serrure, binary_sensor « Keypad disabled », select « Auto Lock Time », sensor « Lock Battery », switches « 1-Touch Locking » et « Keypress Beep » ; rafraîchissement toutes les 30 s |
| Réseau | Depuis le conteneur, poignée de main TLS réussie vers l'API Schlage (`api.allegion.yonomi.cloud`) et vers Cognito `us-west-2` |
| Prérequis côté foyer | Serrure en Wi-Fi dans l'app Schlage Home, sous ce compte. Une serrure appairée d'abord à Apple Home peut ne pas remonter (rapports communautaires, pas la doc HA) |
| **Seule étape utilisateur** | Dans l'interface HA : Paramètres → Appareils et services → Ajouter une intégration → **Schlage** → e-mail et mot de passe Schlage. Les identifiants ne passent ni par le chat ni par D |
| Garde-fous Maurice (code `0f6d5fb`) | **Serrure :** aucune commande de serrure dans l'interface, la carte est en lecture seule avec une mention de délai cloud (`ReadingDetailContent`). **Switches Schlage :** ils apparaîtront avec une carte, mais l'autorisation de puissance est réservée au TP-Link HS103 (`src/commands/switchControl.ts:52-53`, `src/preferences/storage.ts:118`) : aucune commande possible. **Select :** pas de commande. D n'actionne pas la serrure |
| Preuve prévue après connexion | Snapshot HA en lecture seule (modèle, firmware, entités, catégories, état) ; sondage du backend Maurice (carte, lectures visibles, attention) ; capture privée de la carte. Ici, comptes et rôles seulement |

Ensuite :
1. Ring : identifiants et 2FA, sans paiement connu pour l'instantané `live_view`.
2. SmartThings : abonnement probablement requis, à décider par le propriétaire.
3. Nest : achat de 5 $ à autoriser.

## 9. Ce qui reste demandé au propriétaire

1. **Schlage, maintenant** : ajouter l'intégration dans HA (§8), puis répondre « fait ».
2. AIRTAP : référence exacte, sur l'étiquette (AC-RBF4/42/6/62, -B ou -W).
3. Décisions de présentation : la carte Bitaxe (§7a) et les entrées de service « Pet » (§7b, choix 1, 2 ou 3).
4. Plus tard :
   - Ring : connexion dans HA.
   - SmartThings : **accepter ou non** l'abonnement Samsung, s'il est exigé.
   - Nest : **autoriser ou non** les 5 $ Device Access.

Sources officielles consultées le 17/11 : intégrations HA [Nest](https://www.home-assistant.io/integrations/nest/), [Schlage](https://www.home-assistant.io/integrations/schlage/), [SmartThings](https://www.home-assistant.io/integrations/smartthings/), [Ring](https://www.home-assistant.io/integrations/ring/) ; [Nest Learning Thermostat 4e gén.](https://store.google.com/us/product/nest_learning_thermostat_4th_gen?hl=en-US) et [historique des mises à jour Nest](https://support.google.com/googlehome/answer/9263516?hl=en) ; [fiche CSA AC Infinity](https://csa-iot.org/csa_product/ac-infinity-smart-register-booster-fan/). Flex : session `bd544f84-f0b4-4b67-92c9-7bb17a8a8a32`.
