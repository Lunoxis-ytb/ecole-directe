// ══ MODULE EMPLOI DU TEMPS ══
const Schedule = {
  currentWeekStart: null,

  init() {
    // Calculer le lundi de la semaine courante
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Lundi = 1
    this.currentWeekStart = new Date(now);
    this.currentWeekStart.setDate(now.getDate() + diff);
    this.currentWeekStart.setHours(0, 0, 0, 0);

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
      this.render(cached.data);
      currentEvents = cached.data;
    }

    // ── Puis fetch les donnees fraiches ──
    const result = await API.getSchedule(dateDebut, dateFin);
    if (result.success) {
      this.render(result.data);
      currentEvents = result.data;

      // Sauvegarder en cache (fire-and-forget)
      API.saveScheduleCache(dateDebut, result.data);
    } else if (!cached) {
      container.innerHTML = `<p class="loading">Erreur : ${result.message}</p>`;
    }

    // Toujours chercher le prochain cours (meme sans donnees cette semaine)
    await this.updateNextClass(currentEvents);
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
    const totalSlots = endHour - startHour;

    let html = '<div class="schedule-grid">';

    // Header
    html += '<div class="schedule-header"></div>';
    for (const day of days) {
      html += `<div class="schedule-header">${day}</div>`;
    }

    // Lignes horaires
    for (let h = startHour; h < endHour; h++) {
      const label = `${h}h`;
      html += `<div class="schedule-time">${label}</div>`;

      for (let d = 0; d < 5; d++) {
        html += `<div class="schedule-cell" data-day="${d}" data-hour="${h}"></div>`;
      }
    }

    html += "</div>";
    container.innerHTML = html;

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

    // Placer les evenements
    for (const ev of events) {
      if (!ev.start_date && !ev.startDate) continue;

      const startStr = ev.start_date || ev.startDate;
      const endStr = ev.end_date || ev.endDate;

      const start = new Date(startStr.replace(" ", "T"));
      const end = new Date(endStr.replace(" ", "T"));

      const dayIndex = start.getDay() - 1; // 0=Lundi
      if (dayIndex < 0 || dayIndex > 4) continue;

      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const endMinutes = end.getHours() * 60 + end.getMinutes();
      const durationMinutes = endMinutes - startMinutes;

      const hourSlot = start.getHours();
      if (hourSlot < startHour || hourSlot >= endHour) continue;

      // Trouver la cellule correspondante
      const cell = container.querySelector(
        `.schedule-cell[data-day="${dayIndex}"][data-hour="${hourSlot}"]`
      );
      if (!cell) continue;

      const minuteOffset = start.getMinutes();
      const topPx = minuteOffset; // 1px par minute dans une cellule de 60px
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
  },

  async updateNextClass(events) {
    const now = new Date();
    const el = document.getElementById("stat-next-class");
    let nextClass = null;

    // Chercher un cours futur dans les evenements
    function findNext(evList) {
      if (!evList || evList.length === 0) return;
      for (const ev of evList) {
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

    // 2. Si rien, chercher jusqu'a 4 semaines en avance (vacances, etc.)
    if (!nextClass) {
      for (let w = 1; w <= 4; w++) {
        const weekStart = new Date(this.currentWeekStart);
        weekStart.setDate(weekStart.getDate() + 7 * w);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 4);

        console.log(`[SCHEDULE] Recherche prochain cours semaine +${w}:`, this.formatDate(weekStart));
        const result = await API.getSchedule(
          this.formatDate(weekStart),
          this.formatDate(weekEnd)
        );
        if (result.success && result.data && result.data.length > 0) {
          findNext(result.data);
          if (nextClass) break;
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
