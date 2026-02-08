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

  // ── Utilitaire Base64 (avec support UTF-8 pour les accents) ──
  function decodeB64(str) {
    try {
      const bytes = Uint8Array.from(atob(str), c => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      try { return atob(str); } catch { return str; }
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
    // Supprimer de Supabase aussi
    API.deleteSession();
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

  // ── Admin role switch ──
  const ADMIN_USER_ID = "2917";
  let currentRole = "student";

  let roleSwitchInitialized = false;

  function initRoleSwitch() {
    const roleSwitch = document.getElementById("role-switch");
    if (String(API.userId) === ADMIN_USER_ID) {
      roleSwitch.style.display = "";
    } else {
      roleSwitch.style.display = "none";
      return;
    }

    if (roleSwitchInitialized) return;
    roleSwitchInitialized = true;

    const btns = roleSwitch.querySelectorAll(".role-btn");
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const role = btn.dataset.role;
        if (role === currentRole) return;
        currentRole = role;
        btns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        applyRole(role);
      });
    });
  }

  function applyRole(role) {
    const studentDashboard = document.querySelector("#dashboard-page > .stats-bar");
    const studentTabs = document.querySelector("#dashboard-page > .tabs");
    const studentContent = document.querySelector("#dashboard-page > .tab-content");
    const teacherDashboard = document.getElementById("teacher-dashboard");

    if (role === "teacher") {
      if (studentDashboard) studentDashboard.style.display = "none";
      if (studentTabs) studentTabs.style.display = "none";
      if (studentContent) studentContent.style.display = "none";
      if (teacherDashboard) {
        teacherDashboard.style.display = "block";
        Teacher.init();
      }
      document.body.classList.add("teacher-mode");
    } else {
      if (studentDashboard) studentDashboard.style.display = "";
      if (studentTabs) studentTabs.style.display = "";
      if (studentContent) studentContent.style.display = "";
      if (teacherDashboard) teacherDashboard.style.display = "none";
      document.body.classList.remove("teacher-mode");
    }
  }

  function resetRoleSwitch() {
    currentRole = "student";
    roleSwitchInitialized = false;
    const roleSwitch = document.getElementById("role-switch");
    roleSwitch.style.display = "none";
    const btns = roleSwitch.querySelectorAll(".role-btn");
    btns.forEach((b) => b.classList.remove("active"));
    const studentBtn = roleSwitch.querySelector('[data-role="student"]');
    if (studentBtn) studentBtn.classList.add("active");
    document.body.classList.remove("teacher-mode");
  }

  function showDashboard(prenom, nom, offline) {
    hideAllPages();
    dashboardPage.classList.add("active");
    document.getElementById("student-name").textContent =
      `${prenom} ${nom}`;
    initRoleSwitch();

    // Retirer l'ancien bandeau hors-ligne s'il existe
    const oldBanner = document.querySelector(".offline-banner");
    if (oldBanner) oldBanner.remove();

    if (offline) {
      const banner = document.createElement("div");
      banner.className = "offline-banner";
      banner.innerHTML = `<span>Mode hors-ligne — EcoleDirecte est indisponible, donnees du cache</span><button class="offline-dismiss">&#10005;</button>`;
      dashboardPage.prepend(banner);
      banner.querySelector(".offline-dismiss").addEventListener("click", () => banner.remove());
    }
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
        if (target === "viescolaire" && !VieScolaire.rawData) {
          VieScolaire.load();
        }
        if (target === "messages" && !Messages.rawData) {
          Messages.load();
        }
        if (target === "bulletin") {
          Bulletin.render();
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

    // Bulletin period selector
    const bulSelect = document.getElementById("bulletin-period-select");
    bulSelect.addEventListener("change", () => {
      Bulletin.render(bulSelect.value || undefined);
    });
  }

  // ── Mode hors-ligne : si ED est down mais qu'on a une session en cache ──
  async function tryOfflineMode(errorMsg) {
    // Detecter si c'est une erreur serveur ED (pas des mauvais identifiants)
    const isServerError = errorMsg && (
      errorMsg.includes("74000") ||
      errorMsg.includes("connexion au serveur") ||
      errorMsg.includes("HFSQL") ||
      errorMsg.includes("fetch") ||
      errorMsg.includes("network") ||
      errorMsg.includes("500") ||
      errorMsg.includes("502") ||
      errorMsg.includes("503") ||
      errorMsg.includes("504")
    );
    if (!isServerError) return false;

    // Chercher une session sauvegardee
    const session = await loadSession();
    if (!session) return false;

    console.log("[OFFLINE] EcoleDirecte down, basculement en mode hors-ligne");
    API.token = session.token;
    API.userId = session.userId;
    showDashboard(session.prenom, session.nom, true);
    loadDashboard();
    return true;
  }

  // ── Charger le dashboard ──
  async function loadDashboard() {
    // Mettre les stats a 0 par defaut (au lieu de --)
    document.getElementById("stat-homework").textContent = "0";
    document.getElementById("stat-absences").textContent = "0";
    // Init schedule (navigation listeners)
    Schedule.init();
    // Charger tous les modules en parallele (cache-first dans chaque module)
    Grades.load();
    Schedule.load();
    Homework.load();
    VieScolaire.load();
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
      } else if (await tryOfflineMode(result.message)) {
        // Mode hors-ligne active
      } else {
        loginError.textContent = result.message || "Echec de connexion";
      }
    } catch (err) {
      console.error("[LOGIN] Erreur:", err);
      if (!(await tryOfflineMode(err.message))) {
        loginError.textContent = "Erreur de connexion au serveur : " + err.message;
      }
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
    Grades.currentNotes = null;
    Homework.rawData = null;
    Homework.doneStatus = {};
    VieScolaire.rawData = null;
    Messages.rawData = null;
    Messages.currentMessage = null;
    if (Grades.chart) {
      Grades.chart.destroy();
      Grades.chart = null;
    }
    resetRoleSwitch();
    applyRole("student");
    showLogin();
  });

  // ── PWA Install Prompt ──
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // Check cooldown (7 days)
    const dismissed = localStorage.getItem("edmm_install_dismissed");
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    showInstallBanner();
  });

  function showInstallBanner() {
    if (document.querySelector(".install-banner")) return;

    const banner = document.createElement("div");
    banner.className = "install-banner";
    banner.innerHTML = `
      <span>Installer EDMM pour un acces rapide</span>
      <div class="install-actions">
        <button class="install-btn" id="install-accept">Installer</button>
        <button class="install-dismiss" id="install-dismiss">Plus tard</button>
      </div>
    `;
    document.body.prepend(banner);

    document.getElementById("install-accept").addEventListener("click", async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;
        console.log("[PWA] Install choice:", result.outcome);
        deferredPrompt = null;
      }
      banner.remove();
    });

    document.getElementById("install-dismiss").addEventListener("click", () => {
      localStorage.setItem("edmm_install_dismissed", String(Date.now()));
      banner.remove();
    });
  }

  // Detect standalone mode (installed PWA)
  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    document.body.classList.add("pwa-mode");
  }

  // ── Settings menu ──
  const settingsBtn = document.getElementById("settings-btn");
  const settingsMenu = document.getElementById("settings-menu");

  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsMenu.classList.toggle("open");
  });

  document.addEventListener("click", () => {
    settingsMenu.classList.remove("open");
  });

  settingsMenu.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // ── Theme toggle ──
  const themeToggle = document.getElementById("theme-toggle");
  const themeIcon = document.getElementById("theme-icon");
  const themeLabel = document.getElementById("theme-label");
  const savedTheme = localStorage.getItem("edmm_theme") || "dark";

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    if (themeToggle) themeToggle.classList.toggle("active", theme === "light");
    if (themeIcon) themeIcon.innerHTML = theme === "light" ? "&#9788;" : "&#9790;";
    if (themeLabel) themeLabel.textContent = theme === "light" ? "Mode sombre" : "Mode clair";
    localStorage.setItem("edmm_theme", theme);
  }

  applyTheme(savedTheme);

  document.getElementById("theme-toggle-item").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
    settingsMenu.classList.remove("open");
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
