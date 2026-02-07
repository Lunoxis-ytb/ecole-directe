// ══ MODULE DEVOIRS ══
const Homework = {
  rawData: null,
  doneStatus: {}, // { "hw_done_2025-01-15_Maths": true, ... }

  // Cle pour l'etat fait/pas fait
  getStorageKey(date, subject) {
    return `hw_done_${date}_${subject}`;
  },

  async load() {
    const container = document.getElementById("homework-container");
    container.innerHTML = '<p class="loading">Chargement des devoirs...</p>';

    // ── Cache-first : afficher le cache immediatement ──
    const cached = await API.loadHomeworkCache();
    if (cached) {
      if (cached.data && Object.keys(cached.data).length > 0) {
        console.log("[HOMEWORK] Cache trouve, affichage immediat");
        this.rawData = cached.data;
        this.doneStatus = cached.done_status || {};
        this.render();
        this.updateStats();
      }
    }

    // ── Puis fetch les donnees fraiches ──
    const result = await API.getHomework();
    if (result.success) {
      this.rawData = result.data;
      this.render();
      this.updateStats();

      // Sauvegarder en cache (fire-and-forget)
      API.saveHomeworkCache(result.data);
    } else if (!cached) {
      container.innerHTML = `<p class="loading">Erreur : ${result.message}</p>`;
    }
  },

  render() {
    const container = document.getElementById("homework-container");
    const data = this.rawData;

    console.log("[HOMEWORK] Data type:", typeof data, "Keys:", data ? Object.keys(data).length : 0);
    if (data && typeof data === "object") {
      console.log("[HOMEWORK] Premieres cles:", Object.keys(data).slice(0, 5));
    }

    if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
      container.innerHTML = '<p class="loading">Aucun devoir disponible</p>';
      return;
    }

    // data est un objet { "2025-01-15": [...], "2025-01-16": [...] }
    const dates = Object.keys(data).sort((a, b) => {
      return new Date(a) - new Date(b);
    });

    // Ne garder que les devoirs futurs ou recents (30 jours avant)
    const now = new Date();
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const fragment = document.createDocumentFragment();
    let hasContent = false;

    for (const dateStr of dates) {
      const date = new Date(dateStr);
      if (date < monthAgo) continue;

      const items = data[dateStr];
      if (!items || items.length === 0) continue;

      // Countdown relatif : aujourd'hui, demain, lundi, mardi...
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));

      let countdown = "";
      if (diffDays === 0) countdown = "Aujourd'hui";
      else if (diffDays === 1) countdown = "Demain";
      else if (diffDays === -1) countdown = "Hier";
      else if (diffDays > 1 && diffDays <= 6) countdown = date.toLocaleDateString("fr-FR", { weekday: "long" });
      else if (diffDays < -1 && diffDays >= -6) countdown = date.toLocaleDateString("fr-FR", { weekday: "long" }) + " dernier";

      const formattedDate = date.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });

      const displayDate = countdown
        ? `${countdown} — ${formattedDate}`
        : formattedDate + " " + date.getFullYear();

      const isPast = date < now;

      const dayDiv = document.createElement("div");
      dayDiv.className = "homework-day";

      const header = document.createElement("div");
      header.className = "homework-day-header";
      header.textContent = displayDate;
      dayDiv.appendChild(header);

      for (const item of items) {
        const subject = item.matiere || "Inconnu";
        const storageKey = this.getStorageKey(dateStr, subject);
        const isDone = !!this.doneStatus[storageKey];

        // Decoder le contenu base64
        let content = "";
        if (item.aFaire && item.aFaire.contenu) {
          try {
            content = atob(item.aFaire.contenu);
          } catch {
            content = item.aFaire.contenu;
          }
        } else if (item.contenu) {
          try {
            content = atob(item.contenu);
          } catch {
            content = item.contenu;
          }
        }

        // Nettoyer les tags HTML basiques
        content = content
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim();

        const itemDiv = document.createElement("div");
        itemDiv.className = `homework-item${isDone ? " done" : ""}`;
        itemDiv.dataset.key = storageKey;
        itemDiv.innerHTML = `<input type="checkbox" class="homework-check" ${isDone ? "checked" : ""}>
          <div class="homework-body">
            <div class="homework-subject">${subject}</div>
            <div class="homework-content">${content || "Pas de details"}</div>
          </div>`;

        itemDiv.querySelector(".homework-check").addEventListener("change", (e) => {
          const done = e.target.checked;
          if (done) {
            this.doneStatus[storageKey] = true;
          } else {
            delete this.doneStatus[storageKey];
          }
          itemDiv.classList.toggle("done", done);
          this.updateStats();
          API.saveHomeworkDone(this.doneStatus);
        });

        dayDiv.appendChild(itemDiv);
      }

      fragment.appendChild(dayDiv);
      hasContent = true;
    }

    container.innerHTML = "";
    if (hasContent) {
      container.appendChild(fragment);
    } else {
      container.innerHTML = '<p class="loading">Aucun devoir a afficher</p>';
    }
  },

  updateStats() {
    const data = this.rawData;
    if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
      document.getElementById("stat-homework").textContent = "0";
      return;
    }

    const now = new Date();
    let count = 0;

    for (const [dateStr, items] of Object.entries(data)) {
      const date = new Date(dateStr);
      if (date < now) continue;

      for (const item of items) {
        const subject = item.matiere || "Inconnu";
        const key = this.getStorageKey(dateStr, subject);
        if (!this.doneStatus[key]) {
          count++;
        }
      }
    }

    document.getElementById("stat-homework").textContent = count;
  },
};
