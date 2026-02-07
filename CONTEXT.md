# EcoleDirecte Dashboard — Contexte pour continuer le debug

## Description du projet
Dashboard local (Node.js + Express) qui se connecte a l'API EcoleDirecte pour afficher :
- Moyenne generale et moyenne de classe
- Notes par matiere (tableau + graphique Chart.js)
- Devoirs (cahier de texte avec checkbox fait/pas fait)
- Emploi du temps (grille semaine lundi-vendredi)

## Architecture
```
ecole-directe-dashboard/
├── server.js               # Proxy Node.js Express (port 3000, localhost only)
├── package.json            # express + node-fetch v2
└── public/
    ├── index.html          # Login + double auth + dashboard (3 pages)
    ├── css/style.css       # Theme sombre, responsive
    └── js/
        ├── api.js          # Client API frontend (login, doubleauth, grades, homework, schedule)
        ├── app.js          # Orchestrateur (navigation, session, login/logout, double auth)
        ├── grades.js       # Module Notes
        ├── homework.js     # Module Devoirs
        └── schedule.js     # Module Emploi du temps
```

## Problemes corriges
1. **GTK token** : L'API EcoleDirecte ne renvoie plus le GTK dans le body JSON (body vide, content-length: 0). Le GTK est maintenant dans un header `Set-Cookie`. → Corrige dans `server.js` avec `extractCookies()`.

2. **Certificat SSL** : `node-fetch` echouait avec "unable to verify the first certificate". → Corrige en ajoutant un `https.Agent({ rejectUnauthorized: false })` a tous les appels fetch.

3. **Code 250 (double auth)** : Le login renvoie `code: 250` avec un token valide (= identifiants corrects) mais demande une double authentification. → Page double auth ajoutee dans le frontend + endpoint `/api/doubleauth` dans le serveur.

## BUG CORRIGE — Token invalide sur doubleauth (520)
### Probleme
Apres le login (code 250, token recu), l'appel a `doubleauth.awp?verbe=get` retournait `code: 520, "Token invalide !"`.

### Causes identifiees et corrigees
1. **Token dans le header** : L'API renvoie le token dans le header `x-token` de la reponse, pas seulement dans le body JSON. Le code extrait maintenant le token des deux sources (header prioritaire).
2. **Header `2FA-Token` inexistant** : Le code envoyait un header `2FA-Token` qui n'existe pas dans l'API EcoleDirecte. Seul `X-Token` est valide. Supprime.
3. **Version API obsolete** : Mise a jour de `4.75.0` vers `4.90.1` (version la plus recente confirmee).
4. **Token non mis a jour** : Chaque reponse API renvoie un nouveau token. Le code suit maintenant les mises a jour du token entre chaque requete.

### Corrections appliquees (server.js)
- Ajout de `extractHeaderToken()` pour lire le header `x-token`
- Login : extrait le token du header OU du body (`headerToken || data.token`)
- DoubleAuth GET : utilise `X-Token` uniquement, met a jour le token dans la pendingAuth Map
- DoubleAuth POST : utilise `X-Token` au lieu de `2FA-Token`
- Re-login apres cn/cv : extrait aussi le token du header

### Commande pour tester
```bash
cd C:\Users\matli\ecole-directe
node server.js
# Ouvrir http://localhost:3000
```

### Logs du serveur
Le serveur affiche maintenant clairement :
- `[LOGIN] Token body:` / `Token header:` / `Token utilise:` → montre d'ou vient le token
- `[DA-GET] Code:` / `Token header:` → resultat du doubleauth GET
- `[DA-POST] Code:` / `Reponse data:` → resultat de la soumission QCM

## Flux de login EcoleDirecte (tel qu'on le comprend)
1. `GET login.awp?gtk=1` → recoit cookies GTK via Set-Cookie
2. `POST login.awp` avec cookies GTK + identifiants → code 200 (succes) ou 250 (double auth)
3. Si 250 : `POST connexion/doubleauth.awp?verbe=get` avec token → recoit la question
4. `POST connexion/doubleauth.awp?verbe=post` avec la reponse → code 200 + token final
5. Utiliser le token final pour les appels notes/devoirs/emploidutemps

## Pour lancer le projet
```bash
cd C:\Users\login\ecole-directe-dashboard
npm install   # si node_modules absent
npm start     # ou: node server.js
# Ouvrir http://localhost:3000
```
