// ══ MODULE NOTES ══
const Grades = {
  rawData: null,
  chart: null,
  currentSemester: null,
  currentNotes: null,

  async load() {
    const container = document.getElementById("grades-container");
    container.innerHTML = '<p class="loading">Chargement des notes...</p>';

    const result = await API.getGrades();
    if (!result.success) {
      container.innerHTML = `<p class="loading">Erreur : ${result.message}</p>`;
      return;
    }

    this.rawData = result.data;

    // Detecter le semestre en cours automatiquement
    const now = new Date();
    const month = now.getMonth(); // 0=jan
    const defaultSemester = month >= 0 && month <= 5 ? "A002" : "A001";
    document.getElementById("trimester-select").value = defaultSemester;

    this.render(defaultSemester);
    this.initChartSubjectSelect();
  },

  render(semesterFilter) {
    const container = document.getElementById("grades-container");
    const data = this.rawData;

    if (!data || !data.notes || data.notes.length === 0) {
      container.innerHTML = '<p class="loading">Aucune note disponible</p>';
      return;
    }

    this.currentSemester = semesterFilter;

    let notes = data.notes;
    if (semesterFilter) {
      notes = notes.filter((n) => n.codePeriode === semesterFilter);
    }
    this.currentNotes = notes;

    // Mettre a jour les stats
    this.updateStats(semesterFilter);

    // Grouper par matiere
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

    // Calculer les moyennes par matiere
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

    // Toggle details au clic
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

    // Graphique ligne
    this.renderLineChart();
  },

  // Remplir le selecteur de matieres pour le graphique
  initChartSubjectSelect() {
    const select = document.getElementById("chart-subject-select");
    if (!select || !this.rawData || !this.rawData.notes) return;

    const subjects = new Map();
    for (const n of this.rawData.notes) {
      const key = n.codeMatiere || n.libelleMatiere;
      if (!subjects.has(key)) {
        subjects.set(key, n.libelleMatiere);
      }
    }

    // Garder "Moyenne generale" comme premier choix
    select.innerHTML = '<option value="">Moyenne generale</option>';
    const sorted = [...subjects.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    for (const [code, name] of sorted) {
      select.innerHTML += `<option value="${code}">${name}</option>`;
    }

    select.addEventListener("change", () => {
      this.renderLineChart(select.value || null);
    });
  },

  // Graphique en ligne style trading
  renderLineChart(subjectFilter) {
    const canvas = document.getElementById("grades-chart");
    if (!canvas) return;

    if (this.chart) {
      this.chart.destroy();
    }

    const notes = this.currentNotes || [];

    // Filtrer par matiere si besoin
    let filtered = notes;
    if (subjectFilter) {
      filtered = notes.filter(
        (n) => (n.codeMatiere || n.libelleMatiere) === subjectFilter
      );
    }

    // Ne garder que les notes valides avec une date
    const validNotes = filtered
      .filter(
        (n) =>
          n.date &&
          !isNaN(parseFloat(n.valeur)) &&
          !isNaN(parseFloat(n.noteSur))
      )
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (validNotes.length === 0) {
      this.chart = null;
      return;
    }

    // Calculer la moyenne cumulee (ligne eleve)
    const labels = [];
    const avgData = [];
    let runningSum = 0;

    for (let i = 0; i < validNotes.length; i++) {
      const n = validNotes[i];
      const val = (parseFloat(n.valeur) / parseFloat(n.noteSur)) * 20;
      runningSum += val;
      const runningAvg = runningSum / (i + 1);

      labels.push(new Date(n.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }));
      avgData.push(parseFloat(runningAvg.toFixed(2)));
    }

    // Ligne moyenne de classe (horizontale si on a la donnee)
    const classAvgData = [];
    let classAvg = null;

    if (this.rawData.periodes && this.currentSemester) {
      const periode = this.rawData.periodes.find(
        (p) => p.codePeriode === this.currentSemester
      );
      if (periode) {
        if (subjectFilter && periode.ensembleMatieres && periode.ensembleMatieres.disciplines) {
          // Chercher la moyenne de classe pour cette matiere
          const disc = periode.ensembleMatieres.disciplines.find(
            (d) => d.codeMatiere === subjectFilter
          );
          if (disc && disc.moyenneClasse) {
            classAvg = parseFloat(disc.moyenneClasse.replace(",", "."));
          }
        }
        if (!classAvg && periode.moyenneClasse) {
          classAvg = parseFloat(periode.moyenneClasse.replace(",", "."));
        }
      }
    }

    if (classAvg) {
      for (let i = 0; i < labels.length; i++) {
        classAvgData.push(classAvg);
      }
    }

    const datasets = [
      {
        label: "Ma moyenne",
        data: avgData,
        borderColor: "#4f8cff",
        backgroundColor: "rgba(79, 140, 255, 0.1)",
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: "#4f8cff",
        tension: 0.3,
        fill: true,
      },
    ];

    if (classAvgData.length > 0) {
      datasets.push({
        label: "Moyenne classe",
        data: classAvgData,
        borderColor: "#f87171",
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        tension: 0,
        fill: false,
      });
    }

    this.chart = new Chart(canvas, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index",
        },
        plugins: {
          legend: {
            display: true,
            labels: { color: "#9aa0b0", usePointStyle: true },
          },
          tooltip: {
            backgroundColor: "rgba(26, 29, 39, 0.95)",
            titleColor: "#e8eaed",
            bodyColor: "#e8eaed",
            borderColor: "#333750",
            borderWidth: 1,
          },
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

  updateStats(semesterFilter) {
    const data = this.rawData;
    if (!data || !data.notes) return;

    let notes = data.notes;
    if (semesterFilter) {
      notes = notes.filter((n) => n.codePeriode === semesterFilter);
    }

    const validNotes = notes.filter(
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

    if (data.periodes && data.periodes.length > 0) {
      let periode;
      if (semesterFilter) {
        periode = data.periodes.find((p) => p.codePeriode === semesterFilter);
      }
      if (!periode) {
        periode = data.periodes[data.periodes.length - 1];
      }

      if (periode) {
        if (periode.moyenneClasse) {
          document.getElementById("stat-class-avg").textContent =
            periode.moyenneClasse;
        }
        if (periode.moyenneGenerale) {
          document.getElementById("stat-avg").textContent =
            periode.moyenneGenerale;
        }
      }
    }
  },
};
