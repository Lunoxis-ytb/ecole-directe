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

// Log toutes les requetes API
app.use("/api", (req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

app.use(express.static(path.join(__dirname, "public")));

// Stockage temporaire des sessions en attente de double auth
// Cle = token, Valeur = { cookies, identifiant, motdepasse }
const pendingAuth = new Map();

// ── Utilitaire : extraire les cookies d'une reponse fetch ──
function extractCookies(fetchResponse) {
  const cookies = [];
  const raw = fetchResponse.headers.raw()["set-cookie"];
  if (raw) {
    for (const c of raw) {
      const nameValue = c.split(";")[0].trim();
      cookies.push(nameValue);
    }
  }
  return cookies;
}

// ── Etape 1 commune : obtenir GTK cookies ──
async function getGtkCookies() {
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
  console.log("[GTK] Cookies recus:", cookies.length, "GTK:", gtkCookie ? "oui" : "non");
  return { cookies, gtkValue };
}

// ── POST /api/login — authentification ──
app.post("/api/login", async (req, res) => {
  try {
    const { identifiant, motdepasse, fa } = req.body;

    // Etape 1 : GTK
    const { cookies, gtkValue } = await getGtkCookies();

    // Etape 2 : POST login
    console.log("[LOGIN] Envoi authentification...");
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
          fa: fa || [],
        })}`,
        agent,
      }
    );

    const loginCookies = extractCookies(response);
    const allCookies = [...cookies, ...loginCookies];
    const data = await response.json();

    console.log("[LOGIN] Code:", data.code, "Message:", data.message);
    console.log("[LOGIN] Token:", data.token ? data.token.substring(0, 20) + "..." : "vide");
    console.log("[LOGIN] Cookies login:", loginCookies.length);

    // Code 250 = double authentification requise (QCM)
    if (data.code === 250 && data.token) {
      console.log("[LOGIN] Double auth requise — recuperation question QCM...");

      // Stocker session pour les etapes suivantes
      pendingAuth.set(data.token, {
        cookies: allCookies,
        gtkCookies: cookies,
        gtkValue,
        identifiant,
        motdepasse,
      });

      // Tenter de recuperer la question avec X-Token
      let daData = await tryGetDoubleAuth(data.token, allCookies);

      // Si echec, tenter avec 2FA-Token
      if (daData.code === 520) {
        console.log("[LOGIN] Retry avec 2FA-Token...");
        daData = await tryGetDoubleAuth(data.token, allCookies, true);
      }

      // Si echec, tenter avec cookies GTK seuls
      if (daData.code === 520) {
        console.log("[LOGIN] Retry avec cookies GTK seuls...");
        daData = await tryGetDoubleAuth(data.token, cookies);
      }

      // Si echec, tenter avec cookies GTK seuls + 2FA-Token
      if (daData.code === 520) {
        console.log("[LOGIN] Retry avec cookies GTK + 2FA-Token...");
        daData = await tryGetDoubleAuth(data.token, cookies, true);
      }

      console.log("[LOGIN] DoubleAuth GET final:", JSON.stringify(daData, null, 2));

      res.json({
        code: 250,
        token: data.token,
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

// ── Tenter un GET doubleauth avec differentes combinaisons de headers ──
async function tryGetDoubleAuth(token, cookies, use2FA = false) {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": UA,
    Cookie: cookies.join("; "),
  };

  if (use2FA) {
    headers["2FA-Token"] = token;
    headers["X-Token"] = "";
  } else {
    headers["X-Token"] = token;
  }

  console.log("[DA-GET] Headers:", use2FA ? "2FA-Token" : "X-Token", "Cookies:", cookies.length);

  const daRes = await fetch(
    `${API_BASE}/connexion/doubleauth.awp?verbe=get&v=${API_VERSION}`,
    {
      method: "POST",
      headers,
      body: "data={}",
      agent,
    }
  );
  return await daRes.json();
}

// ── POST /api/doubleauth — soumettre la reponse QCM ──
app.post("/api/doubleauth", async (req, res) => {
  try {
    const { token, choix } = req.body;
    const session = pendingAuth.get(token);

    if (!session) {
      return res.status(400).json({ error: "Session expiree, reconnectez-vous" });
    }

    console.log("[DA-POST] Envoi choix:", choix);

    // Soumettre la reponse au QCM (utiliser 2FA-Token comme pour le GET)
    const response = await fetch(
      `${API_BASE}/connexion/doubleauth.awp?verbe=post&v=${API_VERSION}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
          "2FA-Token": token,
          "X-Token": "",
          Cookie: session.cookies.join("; "),
        },
        body: `data=${JSON.stringify({ choix })}`,
        agent,
      }
    );

    const daData = await response.json();
    console.log("[DA-POST] Reponse:", JSON.stringify(daData, null, 2));

    // Si succes (code 200), on recoit cn + cv → re-login avec fa
    if (daData.code === 200 && daData.data && daData.data.cn && daData.data.cv) {
      console.log("[DA-POST] cn/cv recus — re-login avec fa...");

      const fa = [{ cn: daData.data.cn, cv: daData.data.cv }];

      // Re-obtenir un GTK frais
      const { cookies: freshCookies, gtkValue: freshGtk } = await getGtkCookies();

      const loginRes = await fetch(
        `${API_BASE}/login.awp?v=${API_VERSION}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": UA,
            "X-Token": "",
            "X-Gtk": freshGtk,
            Cookie: freshCookies.join("; "),
          },
          body: `data=${JSON.stringify({
            identifiant: session.identifiant,
            motdepasse: session.motdepasse,
            isRelogin: false,
            uuid: "",
            fa,
          })}`,
          agent,
        }
      );

      const loginData = await loginRes.json();
      console.log("[DA-POST] Re-login code:", loginData.code, "message:", loginData.message);
      console.log("[DA-POST] Re-login token:", loginData.token ? loginData.token.substring(0, 20) + "..." : "vide");
      console.log("[DA-POST] Re-login accounts:", loginData.data && loginData.data.accounts ? loginData.data.accounts.length : "aucun");
      if (loginData.data && loginData.data.accounts && loginData.data.accounts[0]) {
        const acc = loginData.data.accounts[0];
        console.log("[DA-POST] Account:", acc.id, acc.prenom, acc.nom, "type:", acc.typeCompte);
        // Pour les comptes parents, trouver l'eleve
        if (acc.profile && acc.profile.eleves) {
          console.log("[DA-POST] Eleves:", JSON.stringify(acc.profile.eleves.map(e => ({ id: e.id, prenom: e.prenom, nom: e.nom }))));
        }
      }

      pendingAuth.delete(token);
      res.json(loginData);
      return;
    }

    pendingAuth.delete(token);
    res.json(daData);
  } catch (err) {
    console.error("[DA-POST] Erreur:", err.message);
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
