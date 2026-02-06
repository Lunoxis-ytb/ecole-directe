const express = require("express");
const fetch = require("node-fetch");
const https = require("https");
const path = require("path");
const db = require("./db");

// Agent HTTPS qui accepte les certificats incomplets (usage local uniquement)
const agent = new https.Agent({ rejectUnauthorized: false });

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = "https://api.ecoledirecte.com/v3";
const API_VERSION = "4.90.1";
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

// ── Utilitaire : extraire le token depuis le header x-token ──
function extractHeaderToken(fetchResponse) {
  return fetchResponse.headers.get("x-token") || "";
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
    const headerToken = extractHeaderToken(response);
    const data = await response.json();

    // Le token peut etre dans le header x-token OU dans le body JSON
    const token = headerToken || data.token;

    console.log("[LOGIN] Code:", data.code, "Message:", data.message);
    console.log("[LOGIN] Token body:", data.token ? data.token.substring(0, 20) + "..." : "vide");
    console.log("[LOGIN] Token header:", headerToken ? headerToken.substring(0, 20) + "..." : "vide");
    console.log("[LOGIN] Token utilise:", token ? token.substring(0, 20) + "..." : "AUCUN");
    console.log("[LOGIN] Cookies login:", loginCookies.length);

    // Code 250 = double authentification requise (QCM)
    if (data.code === 250 && token) {
      console.log("[LOGIN] Double auth requise — recuperation question QCM...");

      // Stocker session pour les etapes suivantes
      pendingAuth.set(token, {
        cookies: allCookies,
        gtkCookies: cookies,
        gtkValue,
        identifiant,
        motdepasse,
      });

      // Recuperer la question QCM avec X-Token
      const daResult = await getDoubleAuth(token, allCookies);

      console.log("[LOGIN] DoubleAuth GET result:", JSON.stringify(daResult.data, null, 2));

      // Mettre a jour le token si l'API en a renvoye un nouveau
      if (daResult.token && daResult.token !== token) {
        console.log("[LOGIN] Token mis a jour par doubleauth GET");
        // Re-enregistrer la session avec le nouveau token
        const session = pendingAuth.get(token);
        pendingAuth.delete(token);
        pendingAuth.set(daResult.token, session);
      }

      res.json({
        code: 250,
        token: daResult.token || token,
        message: "Double authentification requise",
        doubleAuth: daResult.data || daResult,
      });
      return;
    }

    // Succes direct (code 200) ou erreur
    if (token && token !== data.token) {
      data.token = token; // Utiliser le token du header si different
    }
    res.json(data);
  } catch (err) {
    console.error("[LOGIN] Erreur:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Recuperer la question QCM pour la double auth ──
async function getDoubleAuth(token, cookies) {
  console.log("[DA-GET] X-Token:", token.substring(0, 20) + "...", "Cookies:", cookies.length);

  const daRes = await fetch(
    `${API_BASE}/connexion/doubleauth.awp?verbe=get&v=${API_VERSION}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
        "X-Token": token,
        Cookie: cookies.join("; "),
      },
      body: "data={}",
      agent,
    }
  );

  const headerToken = extractHeaderToken(daRes);
  const data = await daRes.json();

  console.log("[DA-GET] Code:", data.code, "Message:", data.message || "");
  console.log("[DA-GET] Token header:", headerToken ? headerToken.substring(0, 20) + "..." : "vide");

  // Utiliser le token le plus recent (header > body > original)
  data.token = headerToken || data.token || token;
  return data;
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

    // Soumettre la reponse au QCM avec X-Token
    const response = await fetch(
      `${API_BASE}/connexion/doubleauth.awp?verbe=post&v=${API_VERSION}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
          "X-Token": token,
          Cookie: session.cookies.join("; "),
        },
        body: `data=${JSON.stringify({ choix })}`,
        agent,
      }
    );

    const daHeaderToken = extractHeaderToken(response);
    const daData = await response.json();
    console.log("[DA-POST] Code:", daData.code, "Message:", daData.message || "");
    console.log("[DA-POST] Reponse data:", JSON.stringify(daData.data, null, 2));

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

      const loginHeaderToken = extractHeaderToken(loginRes);
      const loginData = await loginRes.json();
      // Utiliser le token du header si disponible
      if (loginHeaderToken) {
        loginData.token = loginHeaderToken;
      }

      console.log("[DA-POST] Re-login code:", loginData.code, "message:", loginData.message);
      console.log("[DA-POST] Re-login token:", loginData.token ? loginData.token.substring(0, 20) + "..." : "vide");
      console.log("[DA-POST] Re-login accounts:", loginData.data && loginData.data.accounts ? loginData.data.accounts.length : "aucun");
      if (loginData.data && loginData.data.accounts && loginData.data.accounts[0]) {
        const acc = loginData.data.accounts[0];
        console.log("[DA-POST] Account:", acc.id, acc.prenom, acc.nom, "type:", acc.typeCompte);
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

    const headerToken = extractHeaderToken(response);
    const data = await response.json();
    if (headerToken) data.token = headerToken;

    console.log("[GRADES] Code:", data.code, "Notes:", data.data && data.data.notes ? data.data.notes.length : 0,
      "Periodes:", data.data && data.data.periodes ? data.data.periodes.length : 0);
    res.json(data);
  } catch (err) {
    console.error("[GRADES] Erreur:", err.message);
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

    const headerToken = extractHeaderToken(response);
    const data = await response.json();
    if (headerToken) data.token = headerToken;

    console.log("[HOMEWORK] Code:", data.code, "Data keys:", data.data ? Object.keys(data.data).slice(0, 5) : "null");
    res.json(data);
  } catch (err) {
    console.error("[HOMEWORK] Erreur:", err.message);
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

    const headerToken = extractHeaderToken(response);
    const data = await response.json();
    if (headerToken) data.token = headerToken;

    console.log("[SCHEDULE] Code:", data.code, "Events:", data.data ? data.data.length : 0);
    if (data.data && data.data.length > 0) {
      console.log("[SCHEDULE] Sample event:", JSON.stringify(data.data[0], null, 2));
    }
    res.json(data);
  } catch (err) {
    console.error("[SCHEDULE] Erreur:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══ ROUTES PERSISTANCE (Supabase) ══

// ── Session ──
app.post("/api/session/save", async (req, res) => {
  try {
    const { userId, token, prenom, nom, accountData } = req.body;
    await db.saveSession(String(userId), token, prenom, nom, accountData);
    console.log("[SESSION] Sauvegardee pour userId:", userId);
    res.json({ success: true });
  } catch (err) {
    console.error("[SESSION] Erreur save:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/session/load", async (req, res) => {
  try {
    const session = await db.loadSession();
    console.log("[SESSION] Chargee:", session ? session.user_id : "aucune");
    res.json({ success: true, session });
  } catch (err) {
    console.error("[SESSION] Erreur load:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/session", async (req, res) => {
  try {
    const { userId } = req.body || {};
    await db.deleteSession(userId);
    console.log("[SESSION] Supprimee pour userId:", userId || "toutes");
    res.json({ success: true });
  } catch (err) {
    console.error("[SESSION] Erreur delete:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Cache Notes ──
app.post("/api/cache/grades", async (req, res) => {
  try {
    const { userId, data } = req.body;
    await db.saveGradesCache(String(userId), data);
    console.log("[CACHE] Notes sauvegardees pour userId:", userId);
    res.json({ success: true });
  } catch (err) {
    console.error("[CACHE] Erreur save grades:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/cache/grades/:userId", async (req, res) => {
  try {
    const cached = await db.loadGradesCache(req.params.userId);
    console.log("[CACHE] Notes chargees pour userId:", req.params.userId, cached ? "oui" : "non");
    res.json({ success: true, cached });
  } catch (err) {
    console.error("[CACHE] Erreur load grades:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Cache Devoirs ──
app.post("/api/cache/homework", async (req, res) => {
  try {
    const { userId, data } = req.body;
    await db.saveHomeworkCache(String(userId), data);
    console.log("[CACHE] Devoirs sauvegardes pour userId:", userId);
    res.json({ success: true });
  } catch (err) {
    console.error("[CACHE] Erreur save homework:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/cache/homework/:userId", async (req, res) => {
  try {
    const cached = await db.loadHomeworkCache(req.params.userId);
    console.log("[CACHE] Devoirs charges pour userId:", req.params.userId, cached ? "oui" : "non");
    res.json({ success: true, cached });
  } catch (err) {
    console.error("[CACHE] Erreur load homework:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/cache/homework/done", async (req, res) => {
  try {
    const { userId, doneStatus } = req.body;
    await db.saveHomeworkDone(String(userId), doneStatus);
    console.log("[CACHE] Statut devoirs sauvegarde pour userId:", userId);
    res.json({ success: true });
  } catch (err) {
    console.error("[CACHE] Erreur save homework done:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Cache Emploi du temps ──
app.post("/api/cache/schedule", async (req, res) => {
  try {
    const { userId, weekStart, data } = req.body;
    await db.saveScheduleCache(String(userId), weekStart, data);
    console.log("[CACHE] Emploi du temps sauvegarde pour userId:", userId, "semaine:", weekStart);
    res.json({ success: true });
  } catch (err) {
    console.error("[CACHE] Erreur save schedule:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/cache/schedule/:userId/:weekStart", async (req, res) => {
  try {
    const cached = await db.loadScheduleCache(req.params.userId, req.params.weekStart);
    console.log("[CACHE] Emploi du temps charge pour userId:", req.params.userId, "semaine:", req.params.weekStart, cached ? "oui" : "non");
    res.json({ success: true, cached });
  } catch (err) {
    console.error("[CACHE] Erreur load schedule:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Ecoute sur toutes les interfaces — accessible depuis le reseau local
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Dashboard EcoleDirecte demarre sur http://localhost:${PORT}`);
  console.log(`Aussi accessible sur le reseau local via http://192.168.1.97:${PORT}`);
});
