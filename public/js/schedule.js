// ══ MODULE EMPLOI DU TEMPS ══
const Schedule = {
  currentWeekStart: null,
  _initialized: false,
  _lastRenderHash: null,

  _hashData(data) {
    try {
      const str = JSON.stringify(data);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
      }
      return hash;
    } catch { return Math.random(); }
  },

  init() {
    // Calculer le lundi de la semaine courante
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Lundi = 1
    this.currentWeekStart = new Date(now);
    this.currentWeekStart.setDate(now.getDate() + diff);
    this.currentWeekStart.setHours(0, 0, 0, 0);

    // Eviter d'ajouter des listeners en double (logout → re-login)
    if (this._initialized) return;
    this._initialized = true;

    document.getElementById("prev-week").addEventListener("click", () => {
      this.currentWeekStart.setDate(this.currentWeekStart.getDate() - 7);
      this.load();
    });

    document.getElementById("next-week").addEventListener("click", () => {
      this.currentWeekStart.setDate(this.currentWeekStart.getDate() + 7);
      this.load();
    });
  },

  formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },

  async load() {
    const container = document.getElementById("schedule-container");
    container.innerHTML =
      '<p class="loading">Chargement de l\'emploi du temps...</p>';

    const weekEnd = new Date(this.currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 4); // Vendredi

    const dateDebut = this.formatDate(this.currentWeekStart);
    const dateFin = this.formatDate(weekEnd);

    // Mettre a jour le label
    const options = { day: "numeric", month: "short" };
    const startLabel = this.currentWeekStart.toLocaleDateString("fr-FR", options);
    const endLabel = weekEnd.toLocaleDateString("fr-FR", options);
    document.getElementById("week-label").textContent =
      `${startLabel} - ${endLabel} ${weekEnd.getFullYear()}`;

    // ── Cache-first : afficher le cache immediatement ──
    let currentEvents = null;
    const cached = await API.loadScheduleCache(dateDebut);
    if (cached && cached.data) {
      console.log("[SCHEDULE] Cache trouve pour semaine", dateDebut);
      this._lastRenderHash = this._hashData(cached.data);
      this.render(cached.data);
      currentEvents = cached.data;
    }

    // ── Puis fetch les donnees fraiches ──
    const result = await API.getSchedule(dateDebut, dateFin);
    if (result.success) {
      const newHash = this._hashData(result.data);
      if (newHash !== this._lastRenderHash) {
        this._lastRenderHash = newHash;
        this.render(result.data);
      }
      currentEvents = result.data;
      API.saveScheduleCache(dateDebut, result.data);
    } else if (!cached) {
      const errP = document.createElement("p");
      errP.className = "loading";
      errP.textContent = "Erreur : " + (result.message || "Inconnue");
      container.innerHTML = "";
      container.appendChild(errP);
    }

    // Chercher le prochain cours en arriere-plan
    this.updateNextClass(currentEvents);
  },

  render(events) {
    const container = document.getElementById("schedule-container");

    if (!events || events.length === 0) {
      container.innerHTML =
        '<p class="loading">Aucun cours cette semaine</p>';
      return;
    }

    const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
    const startHour = 8;
    const endHour = 18;

    // Construire la grille avec un lookup map (evite querySelector en boucle)
    const grid = document.createElement("div");
    grid.className = "schedule-grid";
    const cellMap = {}; // "day-hour" → element

    // Header
    const emptyHeader = document.createElement("div");
    emptyHeader.className = "schedule-header";
    grid.appendChild(emptyHeader);
    for (const day of days) {
      const h = document.createElement("div");
      h.className = "schedule-header";
      h.textContent = day;
      grid.appendChild(h);
    }

    // Lignes horaires
    for (let h = startHour; h < endHour; h++) {
      const timeEl = document.createElement("div");
      timeEl.className = "schedule-time";
      timeEl.textContent = `${h}h`;
      grid.appendChild(timeEl);

      for (let d = 0; d < 5; d++) {
        const cell = document.createElement("div");
        cell.className = "schedule-cell";
        cellMap[`${d}-${h}`] = cell;
        grid.appendChild(cell);
      }
    }

    // Attribuer une couleur par matiere
    const subjectColors = {};
    let colorIndex = 0;
    for (const ev of events) {
      const subj = ev.matiere || ev.text || "Cours";
      if (!(subj in subjectColors)) {
        subjectColors[subj] = colorIndex % 12;
        colorIndex++;
      }
    }

    // Placer les evenements (lookup direct, pas de querySelector)
    for (const ev of events) {
      if (!ev.start_date && !ev.startDate) continue;

      const startStr = ev.start_date || ev.startDate;
      const endStr = ev.end_date || ev.endDate;

      const start = new Date(startStr.replace(" ", "T"));
      const end = new Date(endStr.replace(" ", "T"));

      const dayIndex = start.getDay() - 1;
      if (dayIndex < 0 || dayIndex > 4) continue;

      const endMinutes = end.getHours() * 60 + end.getMinutes();
      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const durationMinutes = endMinutes - startMinutes;

      const hourSlot = start.getHours();
      if (hourSlot < startHour || hourSlot >= endHour) continue;

      const cell = cellMap[`${dayIndex}-${hourSlot}`];
      if (!cell) continue;

      const minuteOffset = start.getMinutes();
      const topPx = minuteOffset;
      const heightPx = Math.max(durationMinutes, 25);

      const subject = ev.matiere || ev.text || "Cours";
      const room = ev.salle || ev.room || "";
      const prof = ev.prof || ev.teacher || "";

      const isAnnule = ev.isAnnule || ev.isCancelled;
      const colorClass = `color-${subjectColors[subject] || 0}`;

      const eventEl = document.createElement("div");
      eventEl.className = `schedule-event ${colorClass}${isAnnule ? " cancelled" : ""}`;
      eventEl.style.top = `${topPx}px`;
      eventEl.style.height = `${heightPx}px`;

      eventEl.innerHTML = `
        <div class="event-subject">${subject}${isAnnule ? " (Annule)" : ""}</div>
        ${room ? `<div class="event-room">${room}</div>` : ""}
      `;

      eventEl.title = `${subject}\n${room}\n${prof}`;
      cell.appendChild(eventEl);
    }

    container.innerHTML = "";
    container.appendChild(grid);
  },

  async updateNextClass(events) {
    const now = new Date();
    const el = document.getElementById("stat-next-class");
    let nextClass = null;

    function findNext(evList) {
      if (!evList || evList.length === 0) return;
      for (const ev of evList) {
        // Ignorer les conges, PFMP (stages), et events annules
        const type = (ev.typeCours || "").toUpperCase();
        if (type === "CONGE") continue;
        if (ev.isAnnule || ev.isCancelled) continue;
        const startStr = ev.start_date || ev.startDate;
        if (!startStr) continue;
        const start = new Date(startStr.replace(" ", "T"));
        if (start > now && (!nextClass || start < nextClass.start)) {
          nextClass = { start, subject: ev.matiere || ev.text || "Cours" };
        }
      }
    }

    // 1. Chercher dans les evenements de la semaine courante
    findNext(events);

    // 2. Si rien, chercher dans le cache + API en parallele pour les semaines futures
    if (!nextClass) {
      const weekDates = [];
      for (let w = 1; w <= 4; w++) {
        const weekStart = new Date(this.currentWeekStart);
        weekStart.setDate(weekStart.getDate() + 7 * w);
        weekDates.push(this.formatDate(weekStart));
      }

      // D'abord essayer le cache pour chaque semaine
      const cacheResults = await Promise.allSettled(
        weekDates.map(ws => API.loadScheduleCache(ws))
      );
      for (const r of cacheResults) {
        if (r.status !== "fulfilled") continue;
        const cached = r.value;
        if (cached && cached.data && cached.data.length > 0) {
          findNext(cached.data);
          if (nextClass) break;
        }
      }

      // Si toujours rien, tenter les API en parallele
      if (!nextClass) {
        const futures = weekDates.map((ws, i) => {
          const weekEnd = new Date(this.currentWeekStart);
          weekEnd.setDate(weekEnd.getDate() + 7 * (i + 1) + 4);
          return API.getSchedule(ws, this.formatDate(weekEnd));
        });
        const results = await Promise.allSettled(futures);
        for (const r of results) {
          if (r.status !== "fulfilled") continue;
          const result = r.value;
          if (result.success && result.data && result.data.length > 0) {
            findNext(result.data);
            if (nextClass) break;
          }
        }
      }
    }

    // Afficher le resultat
    if (nextClass) {
      const isToday = nextClass.start.toDateString() === now.toDateString();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const isTomorrow = nextClass.start.toDateString() === tomorrow.toDateString();

      const timeStr = nextClass.start.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      let dayLabel;
      if (isToday) {
        dayLabel = "auj.";
      } else if (isTomorrow) {
        dayLabel = "demain";
      } else {
        dayLabel = nextClass.start.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
      }

      el.textContent = `${nextClass.subject} ${dayLabel} ${timeStr}`;
      el.style.fontSize = "13px";
    } else {
      el.textContent = "Aucun";
      el.style.fontSize = "";
    }
  },
};
