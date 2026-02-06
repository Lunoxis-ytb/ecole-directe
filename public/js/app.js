// ══ APP — Orchestrateur principal ══
(function () {
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
  const daLabel = document.getElementById("da-label");
  const daAnswer = document.getElementById("da-answer");
  const daBtn = document.getElementById("da-btn");
  const daError = document.getElementById("da-error");
  let pendingDAToken = null;

  // ── Session (sessionStorage) ──
  function saveSession(token, userId, prenom, nom) {
    sessionStorage.setItem("ed_token", token);
    sessionStorage.setItem("ed_userId", userId);
    sessionStorage.setItem("ed_prenom", prenom);
    sessionStorage.setItem("ed_nom", nom);
  }

  function loadSession() {
    const token = sessionStorage.getItem("ed_token");
    const userId = sessionStorage.getItem("ed_userId");
    const prenom = sessionStorage.getItem("ed_prenom");
    const nom = sessionStorage.getItem("ed_nom");
    if (token && userId) {
      return { token, userId, prenom, nom };
    }
    return null;
  }

  function clearSession() {
    sessionStorage.removeItem("ed_token");
    sessionStorage.removeItem("ed_userId");
    sessionStorage.removeItem("ed_prenom");
    sessionStorage.removeItem("ed_nom");
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
    daAnswer.value = "";
    daError.textContent = "";

    // Afficher la question selon le type de double auth
    if (doubleAuthData && doubleAuthData.question) {
      daQuestion.textContent = doubleAuthData.question;
    } else if (doubleAuthData && doubleAuthData.typeDA) {
      daQuestion.textContent = "Verification requise (" + doubleAuthData.typeDA + ")";
    } else {
      daQuestion.textContent = "Entrez votre date de naissance (JJ/MM/AAAA)";
    }
    console.log("[DA] Donnees double auth:", JSON.stringify(doubleAuthData));
    daAnswer.focus();
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

        // Charger les données si pas encore fait
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
    // Charger notes en premier (onglet par défaut)
    await Grades.load();

    // Initialiser le module emploi du temps
    Schedule.init();
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
      console.log("[LOGIN] Tentative de connexion...");
      const result = await API.login(identifiant, motdepasse);
      console.log("[LOGIN] Resultat:", result);

      if (result.success) {
        saveSession(result.token, API.userId, result.prenom, result.nom);
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

  // ── Double Auth ──
  daForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    daError.textContent = "";
    daBtn.disabled = true;
    daBtn.textContent = "Verification...";

    try {
      const answer = daAnswer.value.trim();
      const result = await API.submitDoubleAuth(pendingDAToken, { question: answer });
      console.log("[DA] Resultat:", result);

      if (result.success) {
        saveSession(result.token, API.userId, result.prenom, result.nom);
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

  // Vérifier session existante
  const session = loadSession();
  if (session) {
    API.token = session.token;
    API.userId = session.userId;
    showDashboard(session.prenom, session.nom);
    loadDashboard();
  } else {
    showLogin();
  }
})();
