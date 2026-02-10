// ══ API CLIENT — fetch vers le proxy local ══
const API_BASE = window.Capacitor ? "https://ecole-directe.onrender.com" : "";

const API = {
  token: null,
  userId: null,

  // Device ID unique par navigateur (isole les sessions entre appareils)
  getDeviceId() {
    let id = localStorage.getItem("edmm_device_id");
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("edmm_device_id", id);
    }
    return id;
  },

  // ── Nettoyage anciennes cles (migration securite) ──
  _cleanupLegacy() {
    localStorage.removeItem("edmm_creds");
    localStorage.removeItem("edmm_fa");
  },

  // ── Credentials server-side (plus de stockage client) ──
  _setHasCredentials(has) {
    if (has) localStorage.setItem("edmm_has_creds", "1");
    else localStorage.removeItem("edmm_has_creds");
  },
  hasCredentials() {
    return localStorage.getItem("edmm_has_creds") === "1";
  },
  async clearCredentials() {
    this._setHasCredentials(false);
    try {
      await fetch(API_BASE + "/api/credentials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: this.getDeviceId() }),
      });
    } catch {}
  },

  // ── Re-login automatique si token expire (code 520) ──
  _tokenExpiredCallback: null, // set by app.js

  async _handleTokenExpired() {
    console.log("[API] Token expire (520), tentative re-login...");
    if (!this.hasCredentials()) {
      if (this._tokenExpiredCallback) this._tokenExpiredCallback();
      return false;
    }
    try {
      const result = await this.autoLogin();
      if (result.success) {
        console.log("[API] Re-login auto reussi");
        return true;
      }
    } catch (err) {
      console.error("[API] Re-login auto echoue:", err);
    }
    if (this._tokenExpiredCallback) this._tokenExpiredCallback();
    return false;
  },

  // Wrapper pour les appels API authentifies — re-login auto si 520
  async _authFetch(url, body) {
    let data;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, token: this.token }),
      });
      data = await res.json();
    } catch (err) {
      return { code: 0, message: "Erreur reseau : " + err.message };
    }

    if (data.code === 520) {
      const relogged = await this._handleTokenExpired();
      if (relogged) {
        try {
          const res2 = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, token: this.token }),
          });
          return await res2.json();
        } catch (err) {
          return { code: 0, message: "Erreur reseau au retry : " + err.message };
        }
      }
      return data;
    }

    if (data.code === 200 && data.token) this.token = data.token;
    return data;
  },

  // Extraire les infos du compte (parent ou eleve)
  _processLoginSuccess(data) {
    this.token = data.token;

    // Validation reponse API
    if (!data.data || !data.data.accounts || data.data.accounts.length === 0) {
      console.error("[API] Reponse login invalide: pas de comptes");
      return { success: false, message: "Reponse serveur invalide" };
    }

    const account = data.data.accounts[0];

    // Compte parent (typeCompte "1") → utiliser l'ID de l'eleve
    if (
      account.typeCompte === "1" &&
      account.profile &&
      account.profile.eleves &&
      account.profile.eleves.length > 0
    ) {
      const eleve = account.profile.eleves[0];
      this.userId = eleve.id;
      console.log("[API] Compte parent detecte, eleve:", eleve.id, eleve.prenom, eleve.nom);
      return {
        success: true,
        token: data.token,
        account,
        prenom: eleve.prenom,
        nom: eleve.nom,
      };
    }

    // Compte eleve direct
    this.userId = account.id;
    console.log("[API] Compte eleve:", account.id, account.prenom, account.nom);
    return {
      success: true,
      token: data.token,
      account,
      prenom: account.prenom,
      nom: account.nom,
    };
  },

  // Authentification
  async login(identifiant, motdepasse) {
    const body = { identifiant, motdepasse, deviceId: this.getDeviceId() };

    const res = await fetch(API_BASE + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    console.log("[API] Login response code:", data.code);

    if (data.code === 200 && data.token) {
      this._setHasCredentials(true);
      return this._processLoginSuccess(data);
    }

    // Code 250 = double authentification requise
    if (data.code === 250 && data.token) {
      return {
        success: false,
        needDoubleAuth: true,
        token: data.token,
        identifiant: data.identifiant,
        doubleAuth: data.doubleAuth,
        message: data.message,
      };
    }

    return {
      success: false,
      message: data.message || data.error || "Identifiants incorrects",
    };
  },

  // Valider la double authentification (envoi du choix QCM)
  async submitDoubleAuth(identifiant, choix) {
    const res = await fetch(API_BASE + "/api/doubleauth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiant, choix, deviceId: this.getDeviceId() }),
    });

    const data = await res.json();
    console.log("[API] DoubleAuth response code:", data.code);

    if (data.code === 200 && data.token) {
      this._setHasCredentials(true);
      return this._processLoginSuccess(data);
    }

    return {
      success: false,
      message: data.message || "Echec de la double authentification",
    };
  },

  // Auto-login avec credentials sauvegardes cote serveur
  async autoLogin() {
    const res = await fetch(API_BASE + "/api/autologin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: this.getDeviceId() }),
    });

    const data = await res.json();
    console.log("[API] AutoLogin response:", data.code || data.success);

    if (data.code === 200 && data.token) {
      return this._processLoginSuccess(data);
    }

    if (data.code === 250 && data.token) {
      return {
        success: false,
        needDoubleAuth: true,
        token: data.token,
        identifiant: data.identifiant,
        doubleAuth: data.doubleAuth,
        message: data.message,
      };
    }

    this._setHasCredentials(false);
    return {
      success: false,
      message: data.message || "Auto-login impossible",
    };
  },

  // Recupere les notes
  async getGrades() {
    console.log("[API] getGrades userId:", this.userId);
    const data = await this._authFetch(`${API_BASE}/api/grades/${this.userId}`, {});
    if (data.code === 200) return { success: true, data: data.data };
    return { success: false, message: data.message };
  },

  // Recupere les devoirs
  async getHomework() {
    console.log("[API] getHomework userId:", this.userId);
    const data = await this._authFetch(`${API_BASE}/api/homework/${this.userId}`, {});
    if (data.code === 200) return { success: true, data: data.data };
    return { success: false, message: data.message };
  },

  // ══ PERSISTANCE (SQLite via serveur) ══

  async saveSession(userId, token, prenom, nom, accountData) {
    try {
      await fetch(API_BASE + "/api/session/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: this.getDeviceId(), userId, token, prenom, nom, accountData }),
      });
    } catch (err) {
      console.warn("[API] saveSession erreur (non bloquant):", err.message);
    }
  },

  async loadSession() {
    try {
      const res = await fetch(`${API_BASE}/api/session/load/${this.getDeviceId()}`);
      const data = await res.json();
      return data.session || null;
    } catch (err) {
      console.warn("[API] loadSession erreur:", err.message);
      return null;
    }
  },

  async deleteSession() {
    try {
      await fetch(API_BASE + "/api/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: this.getDeviceId() }),
      });
    } catch (err) {
      console.warn("[API] deleteSession erreur (non bloquant):", err.message);
    }
  },

  async saveGradesCache(data) {
    try {
      await fetch(API_BASE + "/api/cache/grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: this.userId, data }),
      });
    } catch (err) {
      console.warn("[API] saveGradesCache erreur (non bloquant):", err.message);
    }
  },

  async loadGradesCache() {
    try {
      const res = await fetch(`${API_BASE}/api/cache/grades/${this.userId}`);
      const result = await res.json();
      return result.cached || null;
    } catch (err) {
      console.warn("[API] loadGradesCache erreur:", err.message);
      return null;
    }
  },

  async saveHomeworkCache(data) {
    try {
      await fetch(API_BASE + "/api/cache/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: this.userId, data }),
      });
    } catch (err) {
      console.warn("[API] saveHomeworkCache erreur (non bloquant):", err.message);
    }
  },

  async loadHomeworkCache() {
    try {
      const res = await fetch(`${API_BASE}/api/cache/homework/${this.userId}`);
      const result = await res.json();
      return result.cached || null;
    } catch (err) {
      console.warn("[API] loadHomeworkCache erreur:", err.message);
      return null;
    }
  },

  async saveHomeworkDone(doneStatus) {
    try {
      await fetch(API_BASE + "/api/cache/homework/done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: this.userId, doneStatus }),
      });
    } catch (err) {
      console.warn("[API] saveHomeworkDone erreur (non bloquant):", err.message);
    }
  },

  async saveScheduleCache(weekStart, data) {
    try {
      await fetch(API_BASE + "/api/cache/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: this.userId, weekStart, data }),
      });
    } catch (err) {
      console.warn("[API] saveScheduleCache erreur (non bloquant):", err.message);
    }
  },

  async loadScheduleCache(weekStart) {
    try {
      const res = await fetch(`${API_BASE}/api/cache/schedule/${this.userId}/${weekStart}`);
      const result = await res.json();
      return result.cached || null;
    } catch (err) {
      console.warn("[API] loadScheduleCache erreur:", err.message);
      return null;
    }
  },

  // Recupere la vie scolaire
  async getVieScolaire() {
    console.log("[API] getVieScolaire userId:", this.userId);
    const data = await this._authFetch(`${API_BASE}/api/viescolaire/${this.userId}`, {});
    if (data.code === 200) return { success: true, data: data.data };
    return { success: false, message: data.message };
  },

  async saveVieScolaireCache(data) {
    // Sauvegarder en localStorage (toujours disponible)
    try {
      localStorage.setItem(`edmm_vs_cache_${this.userId}`, JSON.stringify({ data, updated_at: new Date().toISOString() }));
    } catch {}
    // Tenter aussi Supabase (peut echouer si table absente)
    try {
      await fetch(API_BASE + "/api/cache/viescolaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: this.userId, data }),
      });
    } catch (err) {
      console.warn("[API] saveVieScolaireCache erreur (non bloquant):", err.message);
    }
  },

  async loadVieScolaireCache() {
    // D'abord Supabase
    try {
      const res = await fetch(`${API_BASE}/api/cache/viescolaire/${this.userId}`);
      const result = await res.json();
      if (result.cached) return result.cached;
    } catch {}
    // Fallback localStorage
    try {
      const stored = localStorage.getItem(`edmm_vs_cache_${this.userId}`);
      if (stored) return JSON.parse(stored);
    } catch {}
    return null;
  },

  // Recupere les messages
  async getMessages(type) {
    console.log("[API] getMessages userId:", this.userId, "type:", type);
    const data = await this._authFetch(`${API_BASE}/api/messages/${this.userId}`, { typeRecup498: type || "received" });
    if (data.code === 200) return { success: true, data: data.data };
    return { success: false, message: data.message };
  },

  // Lire un message specifique
  async readMessage(msgId, mode) {
    const data = await this._authFetch(`${API_BASE}/api/messages/${this.userId}/read/${msgId}`, { mode: mode || "destinataire" });
    if (data.code === 200) return { success: true, data: data.data };
    return { success: false, message: data.message };
  },

  // Envoyer un message (repondre)
  async sendMessage(messageData) {
    const data = await this._authFetch(`${API_BASE}/api/messages/${this.userId}/send`, { messageData });
    if (data.code === 200) return { success: true, data: data.data };
    return { success: false, message: data.message };
  },

  // Recupere l'emploi du temps
  async getSchedule(dateDebut, dateFin) {
    console.log("[API] getSchedule userId:", this.userId);
    const data = await this._authFetch(`${API_BASE}/api/schedule/${this.userId}`, { dateDebut, dateFin });
    if (data.code === 200) return { success: true, data: data.data };

    return { success: false, message: data.message };
  },
};
