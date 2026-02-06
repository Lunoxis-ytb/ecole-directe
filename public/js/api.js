// ══ API CLIENT — fetch vers le proxy local ══
const API = {
  token: null,
  userId: null,

  // Authentification
  async login(identifiant, motdepasse) {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiant, motdepasse }),
    });

    const data = await res.json();

    if (data.code === 200 && data.token) {
      this.token = data.token;
      const account = data.data.accounts[0];
      this.userId = account.id;
      return {
        success: true,
        token: data.token,
        account,
        prenom: account.prenom,
        nom: account.nom,
      };
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

  // Valider la double authentification
  async submitDoubleAuth(token, answer) {
    const res = await fetch("/api/doubleauth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, answer }),
    });

    const data = await res.json();

    if (data.code === 200 && data.token) {
      this.token = data.token;
      const account = data.data.accounts[0];
      this.userId = account.id;
      return {
        success: true,
        token: data.token,
        account,
        prenom: account.prenom,
        nom: account.nom,
      };
    }

    return {
      success: false,
      message: data.message || "Echec de la double authentification",
    };
  },

  // Récupère les notes
  async getGrades() {
    const res = await fetch(`/api/grades/${this.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: this.token }),
    });

    const data = await res.json();

    if (data.code === 200) {
      // Mettre à jour le token si l'API en renvoie un nouveau
      if (data.token) this.token = data.token;
      return { success: true, data: data.data };
    }

    return { success: false, message: data.message };
  },

  // Récupère les devoirs
  async getHomework() {
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

  // Récupère l'emploi du temps
  async getSchedule(dateDebut, dateFin) {
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
