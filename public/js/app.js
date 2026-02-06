// ══ APP — Orchestrateur principal ══
(async function () {
  const loginPage = document.getElementById("login-page");
  const doubleAuthPage = document.getElementById("doubleauth-page");
  const dashboardPage = document.getElementById("dashboard-page");
  const loginForm = document.getElementById("login-form");
  const loginBtn = document.getElementById("login-btn");
  const loginError = document.getElementById("login-error");
  const logoutBtn = document.getElementById("logout-btn");

  // Double auth elements
  const daForm = document.getElementById("doubleauth-form");
  const daQuestion = document.getElementById("da-question");
  const daPropositions = document.getElementById("da-propositions");
  const daChoixInput = document.getElementById("da-choix");
  const daBtn = document.getElementById("da-btn");
  const daError = document.getElementById("da-error");
  let pendingDAToken = null;

  // ── Utilitaire Base64 ──
  function decodeB64(str) {
    try {
      return atob(str);
    } catch {
      return str;
    }
  }

  // ── Session persistante (SQLite via API) ──
  async function saveSession(token, userId, prenom, nom, accountData) {
    // Sauvegarder localement en sessionStorage (fallback rapide)
    sessionStorage.setItem("ed_token", token);
    sessionStorage.setItem("ed_userId", userId);
    sessionStorage.setItem("ed_prenom", prenom);
    sessionStorage.setItem("ed_nom", nom);
    // Sauvegarder en SQLite (persistant entre sessions navigateur)
    API.saveSession(userId, token, prenom, nom, accountData);
  }

  async function loadSession() {
    // D'abord essayer sessionStorage (rapide, meme onglet)
    const token = sessionStorage.getItem("ed_token");
    const userId = sessionStorage.getItem("ed_userId");
    const prenom = sessionStorage.getItem("ed_prenom");
    const nom = sessionStorage.getItem("ed_nom");
    if (token && userId) {
      return { token, userId, prenom, nom };
    }

    // Sinon essayer SQLite (persistant entre fermetures navigateur)
    const dbSession = await API.loadSession();
    if (dbSession) {
      // Restaurer en sessionStorage pour les acces suivants
      sessionStorage.setItem("ed_token", dbSession.token);
      sessionStorage.setItem("ed_userId", dbSession.user_id);
      sessionStorage.setItem("ed_prenom", dbSession.prenom);
      sessionStorage.setItem("ed_nom", dbSession.nom);
      return {
        token: dbSession.token,
        userId: dbSession.user_id,
        prenom: dbSession.prenom,
        nom: dbSession.nom,
      };
    }

    return null;
  }

  async function clearSession() {
    sessionStorage.removeItem("ed_token");
    sessionStorage.removeItem("ed_userId");
    sessionStorage.removeItem("ed_prenom");
    sessionStorage.removeItem("ed_nom");
    // Supprimer de SQLite aussi
    API.deleteSession(API.userId);
  }

  // ── Navigation pages ──
  function hideAllPages() {
    loginPage.classList.remove("active");
    doubleAuthPage.classList.remove("active");
    dashboardPage.classList.remove("active");
  }

  function showLogin() {
    hideAllPages();
    loginPage.classList.add("active");
  }

  function showDoubleAuth(doubleAuthData) {
    hideAllPages();
    doubleAuthPage.classList.add("active");
    daError.textContent = "";
    daChoixInput.value = "";
    daBtn.disabled = true;

    console.log("[DA] Donnees double auth:", JSON.stringify(doubleAuthData));

    // Decoder et afficher la question (Base64)
    if (doubleAuthData && doubleAuthData.question) {
      daQuestion.textContent = decodeB64(doubleAuthData.question);
    } else {
      daQuestion.textContent = "Verification de securite";
    }

    // Afficher les propositions comme boutons cliquables
    daPropositions.innerHTML = "";

    if (doubleAuthData && doubleAuthData.propositions && doubleAuthData.propositions.length > 0) {
      for (const prop of doubleAuthData.propositions) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "da-option";
        btn.textContent = decodeB64(prop);
        btn.dataset.value = prop; // Garder la valeur Base64 originale

        btn.addEventListener("click", () => {
          // Deselectionner tous les autres
          daPropositions.querySelectorAll(".da-option").forEach((b) => b.classList.remove("selected"));
          btn.classList.add("selected");
          daChoixInput.value = prop;
          daBtn.disabled = false;
        });

        daPropositions.appendChild(btn);
      }
    } else {
      // Pas de propositions — afficher un champ texte en fallback
      daPropositions.innerHTML = '<input type="text" id="da-fallback-input" class="da-fallback" placeholder="Votre reponse..." style="width:100%;padding:12px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:15px;">';
      const fallbackInput = document.getElementById("da-fallback-input");
      fallbackInput.addEventListener("input", () => {
        daChoixInput.value = fallbackInput.value;
        daBtn.disabled = !fallbackInput.value.trim();
      });
      fallbackInput.focus();
    }
  }

  function showDashboard(prenom, nom) {
    hideAllPages();
    dashboardPage.classList.add("active");
    document.getElementById("student-name").textContent =
      `${prenom} ${nom}`;
  }

  // ── Navigation onglets ──
  function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll(".tab-panel");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab;

        tabs.forEach((t) => t.classList.remove("active"));
        panels.forEach((p) => p.classList.remove("active"));

        tab.classList.add("active");
        document.getElementById(`tab-${target}`).classList.add("active");

        if (target === "homework" && !Homework.rawData) {
          Homework.load();
        }
        if (target === "schedule") {
          Schedule.load();
        }
      });
    });
  }

  // ── Trimestre selector ──
  function initTrimesterSelect() {
    const select = document.getElementById("trimester-select");
    select.addEventListener("change", () => {
      const value = select.value || undefined;
      Grades.render(value);
    });
  }

  // ── Charger le dashboard ──
  async function loadDashboard() {
    // Charger notes en premier (bloquant pour l'affichage)
    await Grades.load();
    // Charger devoirs + emploi du temps en parallele pour les stats
    Schedule.init();
    Schedule.load();
    Homework.load();
  }

  // ── Toggle mot de passe ──
  const togglePwd = document.getElementById("toggle-password");
  const pwdInput = document.getElementById("password");
  togglePwd.addEventListener("click", () => {
    if (pwdInput.type === "password") {
      pwdInput.type = "text";
      togglePwd.title = "Masquer le mot de passe";
    } else {
      pwdInput.type = "password";
      togglePwd.title = "Afficher le mot de passe";
    }
  });

  // ── Login ──
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";
    loginBtn.disabled = true;
    loginBtn.textContent = "Connexion...";

    const identifiant = document.getElementById("username").value.trim();
    const motdepasse = document.getElementById("password").value;

    try {
      const result = await API.login(identifiant, motdepasse);
      console.log("[LOGIN] Resultat:", result);

      if (result.success) {
        saveSession(result.token, API.userId, result.prenom, result.nom, result.account);
        showDashboard(result.prenom, result.nom);
        loadDashboard();
      } else if (result.needDoubleAuth) {
        pendingDAToken = result.token;
        showDoubleAuth(result.doubleAuth);
      } else {
        loginError.textContent = result.message || "Echec de connexion";
      }
    } catch (err) {
      loginError.textContent = "Erreur de connexion au serveur : " + err.message;
      console.error("[LOGIN] Erreur:", err);
    }

    loginBtn.disabled = false;
    loginBtn.textContent = "Se connecter";
  });

  // ── Double Auth (QCM) ──
  daForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    daError.textContent = "";
    daBtn.disabled = true;
    daBtn.textContent = "Verification...";

    try {
      const choix = daChoixInput.value;
      if (!choix) {
        daError.textContent = "Selectionnez une reponse";
        daBtn.disabled = false;
        daBtn.textContent = "Valider";
        return;
      }

      const result = await API.submitDoubleAuth(pendingDAToken, choix);
      console.log("[DA] Resultat:", result);

      if (result.success) {
        saveSession(result.token, API.userId, result.prenom, result.nom, result.account);
        showDashboard(result.prenom, result.nom);
        loadDashboard();
      } else {
        daError.textContent = result.message || "Echec de verification";
      }
    } catch (err) {
      daError.textContent = "Erreur : " + err.message;
      console.error("[DA] Erreur:", err);
    }

    daBtn.disabled = false;
    daBtn.textContent = "Valider";
  });

  // ── Logout ──
  logoutBtn.addEventListener("click", () => {
    clearSession();
    API.token = null;
    API.userId = null;
    Grades.rawData = null;
    Homework.rawData = null;
    if (Grades.chart) {
      Grades.chart.destroy();
      Grades.chart = null;
    }
    showLogin();
  });

  // ── Init ──
  initTabs();
  initTrimesterSelect();

  // Chargement session async (sessionStorage + fallback SQLite)
  const session = await loadSession();
  if (session) {
    API.token = session.token;
    API.userId = session.userId;
    showDashboard(session.prenom, session.nom);
    loadDashboard();
  } else {
    showLogin();
  }
})();
