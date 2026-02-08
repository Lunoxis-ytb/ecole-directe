// ══ TEACHER — Module dashboard professeur (donnees de demo) ══
const Teacher = (() => {
  // ── Donnees de demo ──
  const MATIERE = "Mathematiques";
  const PROF_NOM = "M. Dupont";

  const CLASSES = [
    { id: 1, nom: "3eme A", niveau: "3eme", nbEleves: 28, moyenne: 13.2 },
    { id: 2, nom: "2nde B", niveau: "2nde", nbEleves: 32, moyenne: 12.8 },
    { id: 3, nom: "1ere C", niveau: "1ere", nbEleves: 25, moyenne: 14.1 },
  ];

  const PRENOMS = [
    "Emma","Lucas","Lea","Hugo","Chloe","Nathan","Manon","Louis","Camille","Theo",
    "Jade","Ethan","Lina","Raphael","Alice","Arthur","Sarah","Jules","Ines","Gabriel",
    "Louise","Adam","Eva","Tom","Clara","Noah","Zoe","Liam","Juliette","Mathis",
    "Rose","Leo","Anna","Paul","Mila","Nolan","Ambre","Axel","Lucie","Victor",
    "Romane","Sacha","Oceane","Maxime","Margot","Samuel","Elsa","Mohamed","Charlotte","Aaron"
  ];

  const NOMS = [
    "Martin","Bernard","Dubois","Thomas","Robert","Richard","Petit","Durand","Leroy","Moreau",
    "Simon","Laurent","Lefebvre","Michel","Garcia","David","Bertrand","Roux","Vincent","Fournier",
    "Morel","Girard","Andre","Lefevre","Mercier","Dupont","Lambert","Bonnet","Francois","Martinez",
    "Legrand","Garnier","Faure","Rousseau","Blanc","Guerin","Muller","Henry","Roussel","Nicolas",
    "Perrin","Morin","Mathieu","Clement","Gauthier","Dumont","Lopez","Fontaine","Chevalier","Robin"
  ];

  // Generateur de seed pour des notes coherentes
  function seededRandom(seed) {
    let s = seed;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  // Generer les eleves pour une classe
  function generateEleves(classe) {
    const rng = seededRandom(classe.id * 1000);
    const eleves = [];
    const used = new Set();
    for (let i = 0; i < classe.nbEleves; i++) {
      let prenom, nom, key;
      do {
        prenom = PRENOMS[Math.floor(rng() * PRENOMS.length)];
        nom = NOMS[Math.floor(rng() * NOMS.length)];
        key = prenom + nom;
      } while (used.has(key));
      used.add(key);

      // Moyenne entre 6 et 19, centree autour de la moyenne de classe
      const base = classe.moyenne + (rng() - 0.5) * 10;
      const moy = Math.max(4, Math.min(19.5, base));

      // Generer 4-6 notes individuelles
      const nbNotes = 4 + Math.floor(rng() * 3);
      const notes = [];
      for (let j = 0; j < nbNotes; j++) {
        const n = Math.max(1, Math.min(20, moy + (rng() - 0.5) * 8));
        notes.push(Math.round(n * 2) / 2); // arrondi au 0.5
      }

      eleves.push({
        id: classe.id * 100 + i,
        prenom,
        nom,
        moyenne: Math.round(moy * 10) / 10,
        notes,
      });
    }
    // Trier par nom
    eleves.sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
    return eleves;
  }

  // Evaluations par classe
  const EVALUATIONS = {
    1: [
      { id: 1, titre: "DS Fonctions", date: "2026-01-15", coeff: 2 },
      { id: 2, titre: "Interro Thales", date: "2026-01-22", coeff: 1 },
      { id: 3, titre: "DS Calcul litteral", date: "2026-02-03", coeff: 2 },
      { id: 4, titre: "DM Probabilites", date: "2025-12-18", coeff: 1 },
      { id: 5, titre: "Interro Fractions", date: "2025-11-20", coeff: 1 },
    ],
    2: [
      { id: 6, titre: "DS Vecteurs", date: "2026-01-17", coeff: 2 },
      { id: 7, titre: "Interro Equations", date: "2026-01-28", coeff: 1 },
      { id: 8, titre: "DS Fonctions affines", date: "2026-02-05", coeff: 2 },
      { id: 9, titre: "DM Statistiques", date: "2025-12-12", coeff: 1 },
    ],
    3: [
      { id: 10, titre: "DS Suites", date: "2026-01-20", coeff: 2 },
      { id: 11, titre: "Interro Derivation", date: "2026-01-30", coeff: 1 },
      { id: 12, titre: "DS Second degre", date: "2026-02-04", coeff: 2 },
      { id: 13, titre: "DM Exponentielle", date: "2025-12-20", coeff: 1 },
      { id: 14, titre: "Interro Probabilites", date: "2025-11-28", coeff: 1 },
      { id: 15, titre: "DS Trigonometrie", date: "2025-11-05", coeff: 2 },
    ],
  };

  // EDT prof (semaine type)
  const EDT = [
    { jour: "Lundi", debut: "08:00", fin: "09:00", classe: "3eme A", salle: "B204" },
    { jour: "Lundi", debut: "10:00", fin: "11:00", classe: "1ere C", salle: "A112" },
    { jour: "Mardi", debut: "09:00", fin: "10:00", classe: "2nde B", salle: "B204" },
    { jour: "Mardi", debut: "14:00", fin: "15:00", classe: "3eme A", salle: "B204" },
    { jour: "Mercredi", debut: "08:00", fin: "09:00", classe: "1ere C", salle: "A112" },
    { jour: "Jeudi", debut: "10:00", fin: "11:00", classe: "2nde B", salle: "C301" },
    { jour: "Jeudi", debut: "14:00", fin: "16:00", classe: "1ere C", salle: "A112" },
    { jour: "Vendredi", debut: "09:00", fin: "10:00", classe: "3eme A", salle: "B204" },
  ];

  // Devoirs donnes
  const DEVOIRS = [
    { id: 1, classe: "3eme A", titre: "Exercices Thales p.142 n°3,5,7", dateRendu: "2026-02-10", type: "DM" },
    { id: 2, classe: "2nde B", titre: "DS Fonctions affines - Revision ch.5", dateRendu: "2026-02-12", type: "DS" },
    { id: 3, classe: "1ere C", titre: "DM Derivation - Probleme ouvert", dateRendu: "2026-02-14", type: "DM" },
    { id: 4, classe: "3eme A", titre: "Interro Calcul litteral - Apprendre cours", dateRendu: "2026-02-07", type: "Interro" },
  ];

  // Cache des eleves generes
  const elevesCache = {};

  function getEleves(classeId) {
    if (!elevesCache[classeId]) {
      const classe = CLASSES.find((c) => c.id === classeId);
      if (classe) elevesCache[classeId] = generateEleves(classe);
    }
    return elevesCache[classeId] || [];
  }

  // ── Rendu ──
  let currentClasseId = null;
  let currentTab = "classes";

  function init() {
    renderStats();
    initTeacherTabs();
    renderClasses();
  }

  function renderStats() {
    const totalEleves = CLASSES.reduce((s, c) => s + c.nbEleves, 0);
    const moyGen = (CLASSES.reduce((s, c) => s + c.moyenne * c.nbEleves, 0) / totalEleves).toFixed(1);

    // Trouver le prochain cours
    const jours = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    const now = new Date();
    const jourNom = jours[now.getDay()];
    const heure = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    let prochainCours = null;

    // Chercher dans le jour actuel d'abord
    const coursAujourdhui = EDT.filter((c) => c.jour === jourNom && c.debut > heure);
    if (coursAujourdhui.length > 0) {
      prochainCours = coursAujourdhui[0];
    } else {
      // Chercher dans les jours suivants
      const ordreJours = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
      const idxAuj = ordreJours.indexOf(jourNom);
      for (let i = 1; i <= 5; i++) {
        const idx = (idxAuj + i) % 5;
        const coursDuJour = EDT.filter((c) => c.jour === ordreJours[idx]);
        if (coursDuJour.length > 0) {
          prochainCours = coursDuJour[0];
          break;
        }
      }
    }

    document.getElementById("tstat-classes").textContent = CLASSES.length;
    document.getElementById("tstat-eleves").textContent = totalEleves;
    document.getElementById("tstat-moyenne").textContent = moyGen;
    document.getElementById("tstat-prochain").textContent = prochainCours
      ? `${prochainCours.classe} - ${prochainCours.debut}`
      : "Aucun";
  }

  function initTeacherTabs() {
    const tabs = document.querySelectorAll(".teacher-tab");
    const panels = document.querySelectorAll(".teacher-tab-panel");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.ttab;
        currentTab = target;

        tabs.forEach((t) => t.classList.remove("active"));
        panels.forEach((p) => p.classList.remove("active"));

        tab.classList.add("active");
        document.getElementById(`ttab-${target}`).classList.add("active");

        if (target === "classes") renderClasses();
        if (target === "notes") renderNotes();
        if (target === "schedule") renderSchedule();
        if (target === "devoirs") renderDevoirs();
      });
    });
  }

  // ── Mes Classes ──
  function renderClasses() {
    const container = document.getElementById("teacher-classes-container");
    if (!container) return;

    if (currentClasseId) {
      renderClasseDetail(currentClasseId);
      return;
    }

    let html = '<div class="t-classes-grid">';
    for (const c of CLASSES) {
      const eleves = getEleves(c.id);
      // Repartition des notes
      const sup14 = eleves.filter((e) => e.moyenne >= 14).length;
      const entre10et14 = eleves.filter((e) => e.moyenne >= 10 && e.moyenne < 14).length;
      const inf10 = eleves.filter((e) => e.moyenne < 10).length;

      html += `
        <div class="t-class-card" data-classe="${c.id}">
          <div class="t-class-header">
            <h3>${c.nom}</h3>
            <span class="t-class-badge">${MATIERE}</span>
          </div>
          <div class="t-class-stats">
            <div class="t-class-stat">
              <span class="t-class-stat-value">${c.nbEleves}</span>
              <span class="t-class-stat-label">Eleves</span>
            </div>
            <div class="t-class-stat">
              <span class="t-class-stat-value avg-color" style="color:${c.moyenne >= 14 ? 'var(--green)' : c.moyenne >= 10 ? 'var(--orange)' : 'var(--red)'}">${c.moyenne}</span>
              <span class="t-class-stat-label">Moyenne</span>
            </div>
          </div>
          <div class="t-class-repartition">
            <div class="t-repart-bar">
              <div class="t-repart-segment t-repart-good" style="width:${(sup14 / c.nbEleves * 100).toFixed(0)}%"></div>
              <div class="t-repart-segment t-repart-mid" style="width:${(entre10et14 / c.nbEleves * 100).toFixed(0)}%"></div>
              <div class="t-repart-segment t-repart-bad" style="width:${(inf10 / c.nbEleves * 100).toFixed(0)}%"></div>
            </div>
            <div class="t-repart-legend">
              <span class="t-legend-good">${sup14} &ge;14</span>
              <span class="t-legend-mid">${entre10et14} 10-14</span>
              <span class="t-legend-bad">${inf10} &lt;10</span>
            </div>
          </div>
        </div>`;
    }
    html += "</div>";
    container.innerHTML = html;

    // Clic sur une carte classe
    container.querySelectorAll(".t-class-card").forEach((card) => {
      card.addEventListener("click", () => {
        currentClasseId = parseInt(card.dataset.classe);
        renderClasseDetail(currentClasseId);
      });
    });
  }

  function renderClasseDetail(classeId) {
    const container = document.getElementById("teacher-classes-container");
    const classe = CLASSES.find((c) => c.id === classeId);
    if (!classe || !container) return;

    const eleves = getEleves(classeId);

    let html = `
      <button class="t-back-btn" id="t-back-classes">&larr; Retour aux classes</button>
      <h3 class="t-detail-title">${classe.nom} — ${MATIERE}</h3>
      <div class="t-eleves-table-wrap">
        <table class="t-eleves-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Prenom</th>
              <th>Moyenne</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>`;

    for (const e of eleves) {
      const avgClass = e.moyenne >= 14 ? "avg-good" : e.moyenne >= 10 ? "avg-mid" : "avg-bad";
      html += `
            <tr>
              <td class="t-eleve-nom">${e.nom}</td>
              <td>${e.prenom}</td>
              <td class="${avgClass}">${e.moyenne.toFixed(1)}</td>
              <td class="t-notes-list">${e.notes.map((n) => `<span class="t-note-chip ${n >= 14 ? 'good' : n >= 10 ? 'mid' : 'bad'}">${n.toFixed(1)}</span>`).join(" ")}</td>
            </tr>`;
    }

    html += `
          </tbody>
        </table>
      </div>`;

    container.innerHTML = html;

    document.getElementById("t-back-classes").addEventListener("click", () => {
      currentClasseId = null;
      renderClasses();
    });
  }

  // ── Saisie Notes ──
  function renderNotes() {
    const container = document.getElementById("teacher-notes-container");
    if (!container) return;

    let html = `
      <div class="t-notes-selectors">
        <select id="t-note-classe-select">
          <option value="">Choisir une classe</option>
          ${CLASSES.map((c) => `<option value="${c.id}">${c.nom}</option>`).join("")}
        </select>
        <select id="t-note-eval-select" disabled>
          <option value="">Choisir une evaluation</option>
        </select>
      </div>
      <div id="t-notes-grid"></div>`;

    container.innerHTML = html;

    const classeSelect = document.getElementById("t-note-classe-select");
    const evalSelect = document.getElementById("t-note-eval-select");

    classeSelect.addEventListener("change", () => {
      const cid = parseInt(classeSelect.value);
      if (!cid) {
        evalSelect.disabled = true;
        evalSelect.innerHTML = '<option value="">Choisir une evaluation</option>';
        document.getElementById("t-notes-grid").innerHTML = "";
        return;
      }
      const evals = EVALUATIONS[cid] || [];
      evalSelect.disabled = false;
      evalSelect.innerHTML =
        '<option value="">Choisir une evaluation</option>' +
        evals.map((ev) => `<option value="${ev.id}">${ev.titre} (${ev.date})</option>`).join("");
    });

    evalSelect.addEventListener("change", () => {
      const cid = parseInt(classeSelect.value);
      const eid = parseInt(evalSelect.value);
      if (!cid || !eid) {
        document.getElementById("t-notes-grid").innerHTML = "";
        return;
      }
      renderNotesGrid(cid, eid);
    });
  }

  function renderNotesGrid(classeId, evalId) {
    const grid = document.getElementById("t-notes-grid");
    const eleves = getEleves(classeId);
    const evals = EVALUATIONS[classeId] || [];
    const evaluation = evals.find((e) => e.id === evalId);
    if (!evaluation || !grid) return;

    const evalIdx = evals.indexOf(evaluation);

    let html = `
      <div class="t-notes-eval-info">
        <strong>${evaluation.titre}</strong> — ${evaluation.date} — Coeff. ${evaluation.coeff}
      </div>
      <div class="t-eleves-table-wrap">
        <table class="t-eleves-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Prenom</th>
              <th>Note /20</th>
            </tr>
          </thead>
          <tbody>`;

    for (const e of eleves) {
      const note = e.notes[evalIdx % e.notes.length];
      const cls = note >= 14 ? "avg-good" : note >= 10 ? "avg-mid" : "avg-bad";
      html += `
            <tr>
              <td class="t-eleve-nom">${e.nom}</td>
              <td>${e.prenom}</td>
              <td class="${cls}">${note.toFixed(1)}</td>
            </tr>`;
    }

    html += `
          </tbody>
        </table>
      </div>`;

    grid.innerHTML = html;
  }

  // ── Emploi du temps ──
  function renderSchedule() {
    const container = document.getElementById("teacher-schedule-container");
    if (!container) return;

    const jours = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
    const heures = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"];

    let html = '<div class="schedule-grid t-schedule">';

    // Headers
    html += '<div class="schedule-header"></div>';
    for (const j of jours) {
      html += `<div class="schedule-header">${j}</div>`;
    }

    // Lignes horaires
    for (let h = 0; h < heures.length - 1; h++) {
      html += `<div class="schedule-time">${heures[h]}</div>`;
      for (const j of jours) {
        html += `<div class="schedule-cell">`;
        // Trouver les cours de ce creneau
        const cours = EDT.filter(
          (c) => c.jour === j && c.debut <= heures[h] && c.fin > heures[h]
        );
        for (const c of cours) {
          const colorIdx = CLASSES.findIndex((cl) => cl.nom === c.classe);
          html += `
            <div class="schedule-event color-${colorIdx >= 0 ? colorIdx + 1 : 0}" style="position:relative;top:0;left:0;right:0;">
              <div class="event-subject">${c.classe}</div>
              <div class="event-room">${c.salle}</div>
            </div>`;
        }
        html += `</div>`;
      }
    }

    html += "</div>";
    container.innerHTML = html;
  }

  // ── Devoirs donnes ──
  function renderDevoirs() {
    const container = document.getElementById("teacher-devoirs-container");
    if (!container) return;

    // Trier par date de rendu (plus proche en premier)
    const sorted = [...DEVOIRS].sort((a, b) => a.dateRendu.localeCompare(b.dateRendu));

    let html = "";
    for (const d of sorted) {
      const dateObj = new Date(d.dateRendu + "T00:00:00");
      const now = new Date();
      const isPassed = dateObj < now;
      const dateStr = dateObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

      const typeClass = d.type === "DS" ? "t-devoir-ds" : d.type === "DM" ? "t-devoir-dm" : "t-devoir-interro";

      html += `
        <div class="t-devoir-item ${isPassed ? 't-devoir-passed' : ''}">
          <div class="t-devoir-type ${typeClass}">${d.type}</div>
          <div class="t-devoir-body">
            <div class="t-devoir-titre">${d.titre}</div>
            <div class="t-devoir-meta">
              <span class="t-devoir-classe">${d.classe}</span>
              <span class="t-devoir-date">${isPassed ? 'Rendu le' : 'Pour le'} ${dateStr}</span>
            </div>
          </div>
        </div>`;
    }

    container.innerHTML = html || '<p class="loading">Aucun devoir donne</p>';
  }

  return { init, renderClasses, renderNotes, renderSchedule, renderDevoirs };
})();
