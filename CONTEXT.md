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

## BUG EN COURS — Token invalide sur doubleauth
### Symptome
Apres le login (code 250, token recu), l'appel a `doubleauth.awp?verbe=get` retourne `code: 520, "Token invalide !"`. Du coup la validation de la double auth echoue aussi.

### Ce qu'on sait
- Le GET `login.awp?gtk=1` renvoie 2 cookies (GTK + un autre long cookie hex)
- Le POST `login.awp` avec ces cookies + identifiants renvoie `code: 250` + un token UUID
- Le POST `connexion/doubleauth.awp?verbe=get` avec ce token + cookies renvoie `520 Token invalide`

### Pistes a explorer
1. **Le token est peut-etre dans le header `X-Token` de la reponse login**, pas dans le body JSON. On a ajoute du logging pour verifier (`responseToken` vs `data.token`). → VERIFIER LES LOGS.
2. **Les cookies de la reponse login** sont peut-etre importants. On log maintenant `loginCookies` pour verifier.
3. **La reponse login pourrait definir un cookie de session** necessaire pour le doubleauth. Il faut verifier si `extractCookies(response)` capture bien tous les cookies.
4. **Le format de l'appel doubleauth** est peut-etre different. Tester avec GET au lieu de POST, ou changer les headers.
5. **La version API `4.75.0`** est peut-etre obsolete. Verifier la version actuelle sur le vrai site ecoledirecte.com.

### Commande pour tester manuellement
```bash
# Lancer le serveur
cd C:\Users\login\ecole-directe-dashboard
node server.js

# Tester le login (les logs du serveur affichent tout)
curl -s -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d "{\"identifiant\":\"XXXXX\",\"motdepasse\":\"XXXXX\"}"
```

### Logs attendus a analyser
Le serveur log maintenant :
- `Token body:` vs `Token header:` → lequel est le bon ?
- `Cookies GTK:` → les 2 cookies du GET initial
- `Cookies login:` → cookies retournes par le POST login (potentiellement vide ?)
- `DoubleAuth GET:` → la reponse de l'API
- `DoubleAuth GET retry:` → tentative avec cookies GTK seuls

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
