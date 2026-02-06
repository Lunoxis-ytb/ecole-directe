// ══ MODULE NOTES ══
const Grades = {
  rawData: null,
  chart: null,

  async load() {
    const container = document.getElementById("grades-container");
    container.innerHTML = '<p class="loading">Chargement des notes...</p>';

    const result = await API.getGrades();
    if (!result.success) {
      container.innerHTML = `<p class="loading">Erreur : ${result.message}</p>`;
      return;
    }

    this.rawData = result.data;
    this.render();
    this.updateStats();
  },

  render(trimesterFilter) {
    const container = document.getElementById("grades-container");
    const data = this.rawData;

    if (!data || !data.notes || data.notes.length === 0) {
      container.innerHTML = '<p class="loading">Aucune note disponible</p>';
      return;
    }

    let notes = data.notes;
    if (trimesterFilter) {
      notes = notes.filter((n) => n.codePeriode === trimesterFilter);
    }

    // Grouper par matière
    const subjects = {};
    for (const note of notes) {
      const key = note.codeMatiere || note.libelleMatiere;
      if (!subjects[key]) {
        subjects[key] = {
          name: note.libelleMatiere,
          notes: [],
        };
      }
      subjects[key].notes.push(note);
    }

    // Calculer les moyennes par matière
    const subjectList = Object.values(subjects).map((s) => {
      const validNotes = s.notes.filter(
        (n) => !isNaN(parseFloat(n.valeur)) && !isNaN(parseFloat(n.noteSur))
      );
      const sum = validNotes.reduce(
        (acc, n) => acc + (parseFloat(n.valeur) / parseFloat(n.noteSur)) * 20,
        0
      );
      s.avg = validNotes.length > 0 ? (sum / validNotes.length).toFixed(2) : "--";
      return s;
    });

    // Trier par nom de matière
    subjectList.sort((a, b) => a.name.localeCompare(b.name));

    let html = `<table class="grades-table">
      <thead>
        <tr>
          <th>Matiere</th>
          <th>Moyenne</th>
          <th>Nb notes</th>
          <th>Min</th>
          <th>Max</th>
        </tr>
      </thead>
      <tbody>`;

    for (const s of subjectList) {
      const avgNum = parseFloat(s.avg);
      const avgClass =
        isNaN(avgNum) ? "" : avgNum >= 14 ? "avg-good" : avgNum >= 10 ? "avg-mid" : "avg-bad";

      const validNotes = s.notes.filter((n) => !isNaN(parseFloat(n.valeur)));
      const values = validNotes.map(
        (n) => (parseFloat(n.valeur) / parseFloat(n.noteSur)) * 20
      );
      const min = values.length > 0 ? Math.min(...values).toFixed(1) : "--";
      const max = values.length > 0 ? Math.max(...values).toFixed(1) : "--";

      html += `<tr class="subject-row" data-subject="${s.name}">
        <td>${s.name}</td>
        <td class="${avgClass}">${s.avg}</td>
        <td>${s.notes.length}</td>
        <td>${min}</td>
        <td>${max}</td>
      </tr>`;

      // Détails des notes (cachés par défaut)
      for (const n of s.notes) {
        const dateStr = n.date ? new Date(n.date).toLocaleDateString("fr-FR") : "";
        html += `<tr class="grade-detail" data-subject="${s.name}" style="display:none">
          <td>${n.devoir || ""}</td>
          <td>${n.valeur}/${n.noteSur}</td>
          <td>${dateStr}</td>
          <td colspan="2">${n.commentaire || ""}</td>
        </tr>`;
      }
    }

    html += "</tbody></table>";
    container.innerHTML = html;

    // Toggle des détails au clic
    container.querySelectorAll(".subject-row").forEach((row) => {
      row.addEventListener("click", () => {
        const subject = row.dataset.subject;
        const details = container.querySelectorAll(
          `.grade-detail[data-subject="${subject}"]`
        );
        details.forEach((d) => {
          d.style.display = d.style.display === "none" ? "" : "none";
        });
      });
    });

    // Graphique
    this.renderChart(subjectList);
  },

  renderChart(subjectList) {
    const canvas = document.getElementById("grades-chart");
    if (!canvas) return;

    if (this.chart) {
      this.chart.destroy();
    }

    const filtered = subjectList.filter((s) => s.avg !== "--");

    this.chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: filtered.map((s) => s.name),
        datasets: [
          {
            label: "Moyenne",
            data: filtered.map((s) => parseFloat(s.avg)),
            backgroundColor: filtered.map((s) => {
              const v = parseFloat(s.avg);
              return v >= 14
                ? "rgba(52, 211, 153, 0.7)"
                : v >= 10
                ? "rgba(251, 191, 36, 0.7)"
                : "rgba(248, 113, 113, 0.7)";
            }),
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 20,
            grid: { color: "rgba(255,255,255,0.06)" },
            ticks: { color: "#9aa0b0" },
          },
          x: {
            grid: { display: false },
            ticks: { color: "#9aa0b0", maxRotation: 45 },
          },
        },
      },
    });
  },

  updateStats() {
    const data = this.rawData;
    if (!data || !data.notes) return;

    // Moyenne générale
    const validNotes = data.notes.filter(
      (n) => !isNaN(parseFloat(n.valeur)) && !isNaN(parseFloat(n.noteSur))
    );
    if (validNotes.length > 0) {
      const sum = validNotes.reduce(
        (acc, n) => acc + (parseFloat(n.valeur) / parseFloat(n.noteSur)) * 20,
        0
      );
      const avg = (sum / validNotes.length).toFixed(2);
      document.getElementById("stat-avg").textContent = avg;

      const avgNum = parseFloat(avg);
      const el = document.getElementById("stat-avg");
      el.className =
        "stat-value " +
        (avgNum >= 14 ? "avg-good" : avgNum >= 10 ? "avg-mid" : "avg-bad");
    }

    // Moyenne de classe (si disponible dans les périodes)
    if (data.periodes && data.periodes.length > 0) {
      const lastPeriode = data.periodes[data.periodes.length - 1];
      if (lastPeriode.moyenneClasse) {
        document.getElementById("stat-class-avg").textContent =
          lastPeriode.moyenneClasse;
      }
      if (lastPeriode.moyenneGenerale) {
        document.getElementById("stat-avg").textContent =
          lastPeriode.moyenneGenerale;
      }
    }
  },
};
