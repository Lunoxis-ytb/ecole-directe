// ══ MODULE VIE SCOLAIRE ══
const VieScolaire = {
  rawData: null,
  currentFilter: "all",
  _lastDataHash: null,

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

  async load() {
    const container = document.getElementById("viescolaire-container");
    container.innerHTML = '<p class="loading">Chargement de la vie scolaire...</p>';

    // ── Cache-first : afficher le cache immediatement ──
    const cached = await API.loadVieScolaireCache();
    if (cached && cached.data) {
      console.log("[VIESCOLAIRE] Cache trouve, affichage immediat");
      this.rawData = cached.data;
      this._lastDataHash = this._hashData(cached.data);
      this.render();
      this.updateStats();
    }

    // ── Puis fetch les donnees fraiches ──
    const result = await API.getVieScolaire();
    if (result.success) {
      const newHash = this._hashData(result.data);
      if (newHash !== this._lastDataHash) {
        this.rawData = result.data;
        this._lastDataHash = newHash;
        this.render();
        this.updateStats();
      }
      API.saveVieScolaireCache(result.data);
    } else if (!cached) {
      container.innerHTML = `<p class="loading">Erreur : ${result.message}</p>`;
    }
  },

  _parseEvents() {
    const data = this.rawData;
    if (!data) return [];

    const absences = data.absencesRetards || [];
    const sanctions = data.sanctionsEncouragements || [];
    const events = [];

    for (const a of absences) {
      const type = (a.typeElement || "").toLowerCase().includes("retard") ? "retard" : "absence";
      events.push({
        date: a.date || a.displayDate || "",
        type,
        justified: !!a.justifie,
        libelle: a.libelle || a.typeElement || "",
        matiere: a.matiere || "",
        from: a.heureDebut || "",
        to: a.heureFin || "",
        motif: a.motif || a.commentaire || "",
      });
    }

    for (const s of sanctions) {
      const type = (s.typeElement || "").toLowerCase().includes("encouragement") ? "encouragement" : "sanction";
      events.push({
        date: s.date || s.displayDate || "",
        type,
        justified: false,
        libelle: s.libelle || s.typeElement || "",
        matiere: s.matiere || "",
        motif: s.motif || s.commentaire || "",
      });
    }

    // Trier par date decroissante
    events.sort((a, b) => new Date(b.date) - new Date(a.date));
    return events;
  },

  _getCounts(events) {
    let absNonJust = 0, absJust = 0, retards = 0, sanctionsCount = 0, encouragements = 0;
    for (const ev of events) {
      if (ev.type === "absence" && !ev.justified) absNonJust++;
      else if (ev.type === "absence" && ev.justified) absJust++;
      else if (ev.type === "retard") retards++;
      else if (ev.type === "sanction") sanctionsCount++;
      else if (ev.type === "encouragement") encouragements++;
    }
    return { absNonJust, absJust, retards, sanctions: sanctionsCount, encouragements, total: events.length };
  },

  render() {
    const container = document.getElementById("viescolaire-container");
    const events = this._parseEvents();

    if (events.length === 0) {
      container.innerHTML = '<p class="loading">Aucun evenement de vie scolaire</p>';
      return;
    }

    const counts = this._getCounts(events);

    // ── Stats resume ──
    const statsHtml = `<div class="vs-stats">
      <div class="vs-stat-card vs-stat-danger" data-filter="absence-nj">
        <span class="vs-stat-number">${counts.absNonJust}</span>
        <span class="vs-stat-label">Abs. non justifiees</span>
      </div>
      <div class="vs-stat-card vs-stat-success" data-filter="absence-j">
        <span class="vs-stat-number">${counts.absJust}</span>
        <span class="vs-stat-label">Abs. justifiees</span>
      </div>
      <div class="vs-stat-card vs-stat-warning" data-filter="retard">
        <span class="vs-stat-number">${counts.retards}</span>
        <span class="vs-stat-label">Retards</span>
      </div>
      <div class="vs-stat-card vs-stat-purple" data-filter="sanction">
        <span class="vs-stat-number">${counts.sanctions}</span>
        <span class="vs-stat-label">Sanctions</span>
      </div>
      <div class="vs-stat-card vs-stat-blue" data-filter="encouragement">
        <span class="vs-stat-number">${counts.encouragements}</span>
        <span class="vs-stat-label">Encouragements</span>
      </div>
    </div>`;

    // ── Filtres ──
    const filtersHtml = `<div class="vs-filters">
      <button class="vs-filter-btn${this.currentFilter === "all" ? " active" : ""}" data-filter="all">Tout (${counts.total})</button>
      <button class="vs-filter-btn vs-f-danger${this.currentFilter === "absence-nj" ? " active" : ""}" data-filter="absence-nj">Non justifiees (${counts.absNonJust})</button>
      <button class="vs-filter-btn vs-f-success${this.currentFilter === "absence-j" ? " active" : ""}" data-filter="absence-j">Justifiees (${counts.absJust})</button>
      <button class="vs-filter-btn vs-f-warning${this.currentFilter === "retard" ? " active" : ""}" data-filter="retard">Retards (${counts.retards})</button>
      <button class="vs-filter-btn vs-f-purple${this.currentFilter === "sanction" ? " active" : ""}" data-filter="sanction">Sanctions (${counts.sanctions})</button>
      <button class="vs-filter-btn vs-f-blue${this.currentFilter === "encouragement" ? " active" : ""}" data-filter="encouragement">Encouragements (${counts.encouragements})</button>
    </div>`;

    // ── Filtrer les events ──
    let filtered = events;
    if (this.currentFilter === "absence-nj") filtered = events.filter(e => e.type === "absence" && !e.justified);
    else if (this.currentFilter === "absence-j") filtered = events.filter(e => e.type === "absence" && e.justified);
    else if (this.currentFilter !== "all") filtered = events.filter(e => e.type === this.currentFilter);

    // ── Grouper par date ──
    const grouped = {};
    for (const ev of filtered) {
      const dateKey = ev.date ? ev.date.split("T")[0] : "inconnue";
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(ev);
    }

    // ── Construire la liste ──
    const fragment = document.createDocumentFragment();

    // Stats
    const statsDiv = document.createElement("div");
    statsDiv.innerHTML = statsHtml;
    fragment.appendChild(statsDiv.firstElementChild);

    // Filtres
    const filtersDiv = document.createElement("div");
    filtersDiv.innerHTML = filtersHtml;
    fragment.appendChild(filtersDiv.firstElementChild);

    // Events groupes par date
    if (filtered.length === 0) {
      const empty = document.createElement("p");
      empty.className = "loading";
      empty.textContent = "Aucun evenement pour ce filtre";
      fragment.appendChild(empty);
    }

    for (const [dateStr, dayEvents] of Object.entries(grouped)) {
      const dayDiv = document.createElement("div");
      dayDiv.className = "vs-day";

      const dateObj = new Date(dateStr);
      const formattedDate = isNaN(dateObj)
        ? dateStr
        : dateObj.toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          });

      const header = document.createElement("div");
      header.className = "vs-day-header";
      header.innerHTML = `<span>${formattedDate}</span><span class="vs-day-count">${dayEvents.length} event.</span>`;
      dayDiv.appendChild(header);

      for (const ev of dayEvents) {
        const item = document.createElement("div");
        item.className = "vs-item";

        // Icone selon le type
        let icon = "";
        if (ev.type === "absence") icon = ev.justified ? "&#10003;" : "&#10007;";
        else if (ev.type === "retard") icon = "&#9201;";
        else if (ev.type === "sanction") icon = "&#9888;";
        else icon = "&#9733;";

        const badge = document.createElement("div");
        badge.className = `vs-badge-icon vs-${ev.type}${ev.type === "absence" && ev.justified ? " vs-justified" : ""}`;
        badge.innerHTML = icon;
        item.appendChild(badge);

        const content = document.createElement("div");
        content.className = "vs-content";

        // Ligne principale
        const mainLine = document.createElement("div");
        mainLine.className = "vs-main-line";

        let badgeText = "";
        if (ev.type === "absence") badgeText = ev.justified ? "Justifiee" : "Non justifiee";
        else if (ev.type === "retard") badgeText = "Retard";
        else if (ev.type === "sanction") badgeText = "Sanction";
        else badgeText = "Encouragement";

        const badgeTag = document.createElement("span");
        badgeTag.className = `vs-tag vs-${ev.type}${ev.type === "absence" && ev.justified ? " vs-justified" : ""}`;
        badgeTag.textContent = badgeText;
        mainLine.appendChild(badgeTag);

        if (ev.matiere) {
          const mat = document.createElement("span");
          mat.className = "vs-matiere";
          mat.textContent = ev.matiere;
          mainLine.appendChild(mat);
        }

        if (ev.from || ev.to) {
          const time = document.createElement("span");
          time.className = "vs-time";
          time.textContent = `${ev.from || "?"}  ${ev.to || "?"}`;
          mainLine.appendChild(time);
        }

        content.appendChild(mainLine);

        if (ev.motif) {
          const motif = document.createElement("div");
          motif.className = "vs-motif";
          motif.textContent = ev.motif;
          content.appendChild(motif);
        }

        item.appendChild(content);
        dayDiv.appendChild(item);
      }

      fragment.appendChild(dayDiv);
    }

    container.innerHTML = "";
    container.appendChild(fragment);

    // ── Event listeners filtres ──
    container.querySelectorAll(".vs-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.currentFilter = btn.dataset.filter;
        this.render();
      });
    });

    // Clic sur stat card = filtre
    container.querySelectorAll(".vs-stat-card").forEach(card => {
      card.addEventListener("click", () => {
        this.currentFilter = card.dataset.filter;
        this.render();
      });
    });
  },

  updateStats() {
    const data = this.rawData;
    const el = document.getElementById("stat-absences");
    if (!el) return;

    if (!data || !data.absencesRetards) {
      el.textContent = "0";
      return;
    }

    const unjustified = data.absencesRetards.filter(
      (a) => !a.justifie && !(a.typeElement || "").toLowerCase().includes("retard")
    ).length;

    el.textContent = unjustified;
  },
};
