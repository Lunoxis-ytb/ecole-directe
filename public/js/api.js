// ══ API CLIENT — fetch vers le proxy local ══
const API = {
  token: null,
  userId: null,

  // Extraire les infos du compte (parent ou eleve)
  _processLoginSuccess(data) {
    this.token = data.token;
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
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiant, motdepasse }),
    });

    const data = await res.json();
    console.log("[API] Login response code:", data.code);

    if (data.code === 200 && data.token) {
      return this._processLoginSuccess(data);
    }

    // Code 250 = double authentification requise
    if (data.code === 250 && data.token) {
      return {
        success: false,
        needDoubleAuth: true,
        token: data.token,
        doubleAuth: data.doubleAuth,
        message: data.message,
      };
    }

    return {
      success: false,
      message: data.message || "Identifiants incorrects",
    };
  },

  // Valider la double authentification (envoi du choix QCM)
  async submitDoubleAuth(token, choix) {
    const res = await fetch("/api/doubleauth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, choix }),
    });

    const data = await res.json();
    console.log("[API] DoubleAuth response code:", data.code);

    if (data.code === 200 && data.token) {
      return this._processLoginSuccess(data);
    }

    return {
      success: false,
      message: data.message || "Echec de la double authentification",
    };
  },

  // Recupere les notes
  async getGrades() {
    console.log("[API] getGrades userId:", this.userId);
    const res = await fetch(`/api/grades/${this.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: this.token }),
    });

    const data = await res.json();

    if (data.code === 200) {
      if (data.token) this.token = data.token;
      return { success: true, data: data.data };
    }

    return { success: false, message: data.message };
  },

  // Recupere les devoirs
  async getHomework() {
    console.log("[API] getHomework userId:", this.userId);
    const res = await fetch(`/api/homework/${this.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: this.token }),
    });

    const data = await res.json();

    if (data.code === 200) {
      if (data.token) this.token = data.token;
      return { success: true, data: data.data };
    }

    return { success: false, message: data.message };
  },

  // Recupere l'emploi du temps
  async getSchedule(dateDebut, dateFin) {
    console.log("[API] getSchedule userId:", this.userId);
    const res = await fetch(`/api/schedule/${this.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: this.token, dateDebut, dateFin }),
    });

    const data = await res.json();

    if (data.code === 200) {
      if (data.token) this.token = data.token;
      return { success: true, data: data.data };
    }

    return { success: false, message: data.message };
  },
};
