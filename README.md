# EcoleDirecte Dashboard

Dashboard local pour consulter vos donnees EcoleDirecte : notes, devoirs et emploi du temps.

## Fonctionnalites
- Connexion avec vos identifiants EcoleDirecte
- Moyenne generale et moyenne de classe
- Notes par matiere avec graphique
- Cahier de texte avec suivi des devoirs
- Emploi du temps semaine

## Installation
```bash
npm install
npm start
```
Ouvrir http://localhost:3000

## Technique
- **Backend** : Node.js + Express (proxy local vers l'API EcoleDirecte)
- **Frontend** : HTML/CSS/JS vanilla + Chart.js
- Le serveur ecoute uniquement sur `127.0.0.1` (pas accessible depuis le reseau)

## Etat actuel
Voir [CONTEXT.md](CONTEXT.md) pour le detail du debug en cours (double authentification).
