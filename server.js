const express = require("express");
const fetch = require("node-fetch");
const https = require("https");
const path = require("path");

// Agent HTTPS qui accepte les certificats incomplets (usage local uniquement)
const agent = new https.Agent({ rejectUnauthorized: false });

const app = express();
const PORT = 3000;
const API_BASE = "https://api.ecoledirecte.com/v3";
const API_VERSION = "4.75.0";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Stockage temporaire des sessions en attente de double auth
const pendingAuth = new Map();

// ── Utilitaire : extraire les cookies d'une reponse fetch ──
function extractCookies(fetchResponse) {
  const cookies = [];
  const raw = fetchResponse.headers.raw()["set-cookie"];
  if (raw) {
    for (const c of raw) {
      // Extraire seulement "NOM=VALEUR" (avant le premier ";")
      const nameValue = c.split(";")[0].trim();
      cookies.push(nameValue);
    }
  }
  return cookies; // ["GTK=abc123", "autre=xyz"]
}

// ── POST /api/login — authentification ──
app.post("/api/login", async (req, res) => {
  try {
    const { identifiant, motdepasse } = req.body;

    // Etape 1 : GET pour obtenir le GTK via Set-Cookie
    const gtkRes = await fetch(
      `${API_BASE}/login.awp?gtk=1&v=${API_VERSION}`,
      {
        method: "GET",
        headers: { "User-Agent": UA },
        agent,
      }
    );
    const cookies = extractCookies(gtkRes);
    const gtkCookie = cookies.find((c) => c.startsWith("GTK="));
    const gtkValue = gtkCookie ? gtkCookie.split("=").slice(1).join("=") : "";
    console.log("[LOGIN] Etape 1 - GTK cookie obtenu:", gtkCookie ? "oui" : "non");
    console.log("[LOGIN] Etape 1 - Cookies recus:", cookies.length);

    // Etape 2 : POST avec identifiants + cookies GTK + header X-Gtk
    console.log("[LOGIN] Etape 2 - Envoi authentification...");
    const response = await fetch(
      `${API_BASE}/login.awp?v=${API_VERSION}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
          "X-Token": "",
          "X-Gtk": gtkValue,
          Cookie: cookies.join("; "),
        },
        body: `data=${JSON.stringify({
          identifiant,
          motdepasse,
          isRelogin: false,
          uuid: "",
          fa: [],
        })}`,
        agent,
      }
    );

    const loginCookies = extractCookies(response);
    const allCookies = [...cookies, ...loginCookies];

    // Recuperer aussi le token depuis le header X-Token de la reponse
    const responseToken = response.headers.get("x-token");

    const data = await response.json();
    console.log("[LOGIN] Reponse code:", data.code, "message:", data.message);
    console.log("[LOGIN] Token body:", data.token);
    console.log("[LOGIN] Token header:", responseToken);
    console.log("[LOGIN] Cookies GTK:", cookies.length, cookies.map(c => c.substring(0, 30) + "..."));
    console.log("[LOGIN] Cookies login:", loginCookies.length, loginCookies.map(c => c.substring(0, 30) + "..."));

    // Utiliser le token du header en priorite, sinon celui du body
    const activeToken = data.token || responseToken || "";

    // Code 250 = double authentification requise
    if (data.code === 250 && activeToken) {
      console.log("[LOGIN] Double auth requise, token utilise:", activeToken);

      // Stocker les cookies pour l'etape suivante
      pendingAuth.set(activeToken, allCookies);

      // Demander a l'API ce qu'elle attend comme double auth
      const daRes = await fetch(
        `${API_BASE}/connexion/doubleauth.awp?verbe=get&v=${API_VERSION}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": UA,
            "X-Token": activeToken,
            Cookie: allCookies.join("; "),
          },
          body: "data={}",
          agent,
        }
      );
      const daData = await daRes.json();
      console.log("[LOGIN] DoubleAuth GET:", JSON.stringify(daData, null, 2));

      // Si le GET doubleauth echoue aussi, tenter sans cookies login (juste GTK)
      if (daData.code === 520) {
        console.log("[LOGIN] Retry doubleauth avec cookies GTK seuls...");
        const daRes2 = await fetch(
          `${API_BASE}/connexion/doubleauth.awp?verbe=get&v=${API_VERSION}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": UA,
              "X-Token": activeToken,
              Cookie: cookies.join("; "),
            },
            body: "data={}",
            agent,
          }
        );
        const daData2 = await daRes2.json();
        console.log("[LOGIN] DoubleAuth GET retry:", JSON.stringify(daData2, null, 2));

        if (daData2.code !== 520) {
          // Les cookies GTK seuls marchent, mettre a jour le store
          pendingAuth.set(activeToken, cookies);
          res.json({
            code: 250,
            token: activeToken,
            message: "Double authentification requise",
            doubleAuth: daData2.data || daData2,
          });
          return;
        }
      }

      // Renvoyer au frontend les infos de double auth
      res.json({
        code: 250,
        token: activeToken,
        message: "Double authentification requise",
        doubleAuth: daData.data || daData,
      });
      return;
    }

    res.json(data);
  } catch (err) {
    console.error("[LOGIN] Erreur:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/doubleauth — valider la double authentification ──
app.post("/api/doubleauth", async (req, res) => {
  try {
    const { token, answer } = req.body;
    const cookies = pendingAuth.get(token);

    if (!cookies) {
      return res.status(400).json({ error: "Session expiree, reconnectez-vous" });
    }

    console.log("[DOUBLEAUTH] Envoi reponse:", JSON.stringify(answer));

    const response = await fetch(
      `${API_BASE}/connexion/doubleauth.awp?verbe=post&v=${API_VERSION}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
          "X-Token": token,
          Cookie: cookies.join("; "),
        },
        body: `data=${JSON.stringify(answer)}`,
        agent,
      }
    );

    const data = await response.json();
    console.log("[DOUBLEAUTH] Reponse:", JSON.stringify(data, null, 2));

    pendingAuth.delete(token);
    res.json(data);
  } catch (err) {
    console.error("[DOUBLEAUTH] Erreur:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Headers communs pour les requetes authentifiees
function authHeaders(token) {
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Token": token,
    "User-Agent": UA,
  };
}

// ── POST /api/grades/:id — notes ──
app.post("/api/grades/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { token, anneeScolaire } = req.body;

    const response = await fetch(
      `${API_BASE}/eleves/${id}/notes.awp?verbe=get&v=${API_VERSION}`,
      {
        method: "POST",
        headers: authHeaders(token),
        body: `data=${JSON.stringify({ anneeScolaire: anneeScolaire || "" })}`,
        agent,
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/homework/:id — cahier de texte ──
app.post("/api/homework/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.body;

    const response = await fetch(
      `${API_BASE}/Eleves/${id}/cahierdetexte.awp?verbe=get&v=${API_VERSION}`,
      {
        method: "POST",
        headers: authHeaders(token),
        body: "data={}",
        agent,
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/schedule/:id — emploi du temps ──
app.post("/api/schedule/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { token, dateDebut, dateFin } = req.body;

    const response = await fetch(
      `${API_BASE}/E/${id}/emploidutemps.awp?verbe=get&v=${API_VERSION}`,
      {
        method: "POST",
        headers: authHeaders(token),
        body: `data=${JSON.stringify({
          dateDebut: dateDebut || "",
          dateFin: dateFin || "",
          avecTrous: false,
        })}`,
        agent,
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ecoute uniquement sur localhost — pas accessible depuis le reseau
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Dashboard EcoleDirecte demarre sur http://localhost:${PORT}`);
  console.log("Serveur accessible UNIQUEMENT en local (127.0.0.1)");
});
