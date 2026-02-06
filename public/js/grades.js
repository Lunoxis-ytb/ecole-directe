// ══ MODULE NOTES ══
const Grades = {
  rawData: null,
  chart: null,
  currentSemester: null,
  currentNotes: null,

  async load() {
    const container = document.getElementById("grades-container");
    container.innerHTML = '<p class="loading">Chargement des notes...</p>';

    // ── Cache-first : afficher le cache immediatement ──
    const cached = await API.loadGradesCache();
    if (cached && cached.data) {
      console.log("[GRADES] Cache trouve, affichage immediat");
      this.rawData = cached.data;
      const defaultSemester = this._getDefaultSemester();
      document.getElementById("trimester-select").value = defaultSemester;
      this.render(defaultSemester);
      this.initChartSubjectSelect();
    }

    // ── Puis fetch les donnees fraiches ──
    const result = await API.getGrades();
    if (result.success) {
      this.rawData = result.data;

      const defaultSemester = this._getDefaultSemester();
      document.getElementById("trimester-select").value = defaultSemester;
      this.render(defaultSemester);
      this.initChartSubjectSelect();

      // Sauvegarder en cache (fire-and-forget)
      API.saveGradesCache(result.data);
    } else if (!cached) {
      // Pas de cache ET l'API a echoue
      container.innerHTML = `<p class="loading">Erreur : ${result.message}</p>`;
    }
    // Si l'API echoue mais qu'on a le cache, on garde l'affichage du cache
  },

  _getDefaultSemester() {
    const now = new Date();
    const month = now.getMonth(); // 0=jan
    return month >= 0 && month <= 5 ? "A002" : "A001";
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

    // Recuperer les rangs par matiere depuis les periodes
    const ranksMap = {};
    let generalRank = null;
    if (data.periodes && semesterFilter) {
      const periode = data.periodes.find((p) => p.codePeriode === semesterFilter);
      if (periode && periode.ensembleMatieres && periode.ensembleMatieres.disciplines) {
        for (const disc of periode.ensembleMatieres.disciplines) {
          const rank = disc.rang || disc.rangEleve || disc.classement;
          if (rank != null && rank !== "" && rank !== 0) {
            ranksMap[disc.codeMatiere] = rank;
          }
        }
      }
      // Rang general - recherche exhaustive dans tous les champs possibles
      if (periode) {
        const em = periode.ensembleMatieres || {};
        generalRank = periode.rangEleve || periode.rang || periode.classement
          || em.rangEleve || em.rang || em.classement || em.rangGeneral
          || null;

        // Fallback : chercher dans disciplines une entree "ensemble" (codeMatiere vide ou sous-matiere false)
        if (!generalRank && em.disciplines) {
          for (const disc of em.disciplines) {
            if (disc.sousMatiere === false || disc.codeMatiere === "" || disc.id === 0) {
              const r = disc.rang || disc.rangEleve || disc.classement;
              if (r) { generalRank = r; break; }
            }
          }
        }

        console.log("[GRADES] Rank debug:", JSON.stringify({
          "periode.rangEleve": periode.rangEleve,
          "periode.rang": periode.rang,
          "em.rangEleve": em.rangEleve,
          "em.rang": em.rang,
          "found": generalRank,
          "emKeys": Object.keys(em).filter(k => k !== "disciplines"),
        }));
      }
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
      // Chercher le rang par code matiere
      const codeMatiere = s.notes[0] ? s.notes[0].codeMatiere : null;
      s.rank = codeMatiere && ranksMap[codeMatiere] ? ranksMap[codeMatiere] : "--";
      return s;
    });

    subjectList.sort((a, b) => a.name.localeCompare(b.name));

    // Mettre a jour le rang general dans les stats
    const rankEl = document.getElementById("stat-rank");
    if (rankEl) rankEl.textContent = generalRank || "N/A";

    let html = `<table class="grades-table">
      <thead>
        <tr>
          <th>Matiere</th>
          <th>Moyenne</th>
          <th>Rang</th>
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
        <td class="rank-cell">${s.rank}</td>
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
          <td colspan="3">${n.commentaire || ""}</td>
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

    // Graphiques
    this.renderLineChart();
    this.renderClassChart();
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

  // Graphique 1 : Evolution de ma moyenne personnelle
  renderLineChart(subjectFilter) {
    const canvas = document.getElementById("grades-chart");
    if (!canvas) return;

    if (this.chart) this.chart.destroy();

    const ctx = canvas.getContext("2d");
    const notes = this.currentNotes || [];

    let filtered = notes;
    if (subjectFilter) {
      filtered = notes.filter(
        (n) => (n.codeMatiere || n.libelleMatiere) === subjectFilter
      );
    }

    const validNotes = filtered
      .filter((n) => n.date && !isNaN(parseFloat(n.valeur)) && !isNaN(parseFloat(n.noteSur)))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (validNotes.length === 0) {
      this.chart = null;
      return;
    }

    const labels = [];
    const avgData = [];
    const individualData = [];
    const noteDetails = [];
    let runningSum = 0;

    for (let i = 0; i < validNotes.length; i++) {
      const n = validNotes[i];
      const val = (parseFloat(n.valeur) / parseFloat(n.noteSur)) * 20;
      runningSum += val;
      const valRounded = parseFloat(val.toFixed(2));

      labels.push(new Date(n.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }));
      avgData.push(parseFloat((runningSum / (i + 1)).toFixed(2)));
      individualData.push(valRounded);
      noteDetails.push({
        matiere: n.libelleMatiere || "",
        valeur: n.valeur,
        noteSur: n.noteSur,
        devoir: n.devoir || "",
        sur20: valRounded,
      });
    }

    // Gradient bleu sous la courbe
    const h = canvas.parentElement ? canvas.parentElement.clientHeight : 300;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "rgba(79, 140, 255, 0.20)");
    gradient.addColorStop(1, "rgba(79, 140, 255, 0)");

    this.chart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Moyenne",
            data: avgData,
            borderColor: "#4f8cff",
            backgroundColor: gradient,
            borderWidth: 2.5,
            pointRadius: 3,
            pointBackgroundColor: "#4f8cff",
            pointHoverRadius: 6,
            pointHoverBackgroundColor: "#4f8cff",
            pointHoverBorderColor: "#fff",
            pointHoverBorderWidth: 2,
            tension: 0.35,
            fill: true,
          },
          {
            label: "Notes",
            data: individualData,
            showLine: false,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointBackgroundColor: individualData.map(v =>
              v >= 14 ? "#34d399" : v >= 10 ? "#fbbf24" : "#f87171"
            ),
            pointBorderColor: individualData.map(v =>
              v >= 14 ? "rgba(52,211,153,0.3)" : v >= 10 ? "rgba(251,191,36,0.3)" : "rgba(248,113,113,0.3)"
            ),
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800, easing: "easeOutQuart" },
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: {
            display: true,
            labels: { color: "#9aa0b0", usePointStyle: true, padding: 16, font: { size: 11 } },
          },
          tooltip: {
            backgroundColor: "rgba(10, 14, 26, 0.95)",
            titleColor: "#f0f2f5",
            bodyColor: "#f0f2f5",
            borderColor: "rgba(79, 140, 255, 0.2)",
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              title(ctx) {
                const d = noteDetails[ctx[0].dataIndex];
                return d ? `${ctx[0].label} — ${d.matiere}` : ctx[0].label;
              },
              label(ctx) {
                const d = noteDetails[ctx.dataIndex];
                if (ctx.dataset.label === "Notes" && d) {
                  return `Note: ${d.valeur}/${d.noteSur}${parseFloat(d.noteSur) !== 20 ? ` (${d.sur20}/20)` : ""}`;
                }
                if (ctx.dataset.label === "Moyenne") return `Moyenne: ${ctx.parsed.y}/20`;
                return null;
              },
              afterBody(ctx) {
                const d = noteDetails[ctx[0].dataIndex];
                return d && d.devoir ? [d.devoir] : [];
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 20,
            grid: { color: "rgba(255,255,255,0.04)" },
            ticks: { color: "#9aa0b0", font: { size: 11 }, stepSize: 4 },
          },
          x: {
            grid: { display: false },
            ticks: { color: "#9aa0b0", maxRotation: 45, font: { size: 10 } },
          },
        },
      },
    });
  },

  // Graphique 2 : Comparaison Moi vs Classe par matiere (barres horizontales)
  classChart: null,

  renderClassChart() {
    const canvas = document.getElementById("class-chart");
    if (!canvas) return;

    if (this.classChart) this.classChart.destroy();

    const data = this.rawData;
    if (!data || !data.periodes) { this.classChart = null; return; }

    const periode = data.periodes.find((p) => p.codePeriode === this.currentSemester);
    if (!periode || !periode.ensembleMatieres || !periode.ensembleMatieres.disciplines) {
      this.classChart = null;
      return;
    }

    const subjects = [];
    const myAvgs = [];
    const classAvgs = [];

    for (const disc of periode.ensembleMatieres.disciplines) {
      const myAvg = disc.moyenne || disc.moyenneEleve;
      const clAvg = disc.moyenneClasse;
      if (!myAvg || !clAvg) continue;

      const myVal = parseFloat(String(myAvg).replace(",", "."));
      const clVal = parseFloat(String(clAvg).replace(",", "."));
      if (isNaN(myVal) || isNaN(clVal)) continue;

      // Nom court pour les labels
      let name = disc.discipline || disc.libelleMatiere || disc.codeMatiere || "";
      if (name.length > 16) name = name.substring(0, 14) + "..";

      subjects.push(name);
      myAvgs.push(myVal);
      classAvgs.push(clVal);
    }

    if (subjects.length === 0) { this.classChart = null; return; }

    this.classChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: subjects,
        datasets: [
          {
            label: "Moi",
            data: myAvgs,
            backgroundColor: "rgba(79, 140, 255, 0.7)",
            borderColor: "#4f8cff",
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.7,
            categoryPercentage: 0.8,
          },
          {
            label: "Classe",
            data: classAvgs,
            backgroundColor: "rgba(139, 92, 246, 0.5)",
            borderColor: "#8b5cf6",
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.7,
            categoryPercentage: 0.8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        animation: { duration: 800, easing: "easeOutQuart" },
        plugins: {
          legend: {
            display: true,
            labels: { color: "#9aa0b0", usePointStyle: true, padding: 16, font: { size: 11 } },
          },
          tooltip: {
            backgroundColor: "rgba(10, 14, 26, 0.95)",
            titleColor: "#f0f2f5",
            bodyColor: "#f0f2f5",
            borderColor: "rgba(79, 140, 255, 0.2)",
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label(ctx) {
                return `${ctx.dataset.label}: ${ctx.parsed.x}/20`;
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 20,
            grid: { color: "rgba(255,255,255,0.04)" },
            ticks: { color: "#9aa0b0", font: { size: 11 }, stepSize: 4 },
          },
          y: {
            grid: { display: false },
            ticks: { color: "#9aa0b0", font: { size: 11 } },
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

    console.log("[GRADES] Periodes disponibles:", data.periodes ? data.periodes.length : "aucune");

    if (data.periodes && data.periodes.length > 0) {
      let periode;
      if (semesterFilter) {
        periode = data.periodes.find((p) => p.codePeriode === semesterFilter);
      }
      if (!periode) {
        periode = data.periodes[data.periodes.length - 1];
      }

      if (periode) {
        console.log("[GRADES] Periode selectionnee:", periode.codePeriode, JSON.stringify({
          moyenneGenerale: periode.moyenneGenerale,
          moyenneClasse: periode.moyenneClasse,
          ensembleMatieres: periode.ensembleMatieres ? JSON.stringify(periode.ensembleMatieres).substring(0, 300) : "absent",
        }));

        // Moyenne de classe : chercher dans plusieurs endroits possibles
        let classAvg = periode.moyenneClasse
          || (periode.ensembleMatieres && periode.ensembleMatieres.moyenneClasse)
          || null;

        // Fallback : calculer depuis les disciplines si disponibles
        if (!classAvg && periode.ensembleMatieres && periode.ensembleMatieres.disciplines) {
          const discs = periode.ensembleMatieres.disciplines.filter(
            (d) => d.moyenneClasse && !isNaN(parseFloat(String(d.moyenneClasse).replace(",", ".")))
          );
          if (discs.length > 0) {
            const sum = discs.reduce(
              (acc, d) => acc + parseFloat(String(d.moyenneClasse).replace(",", ".")), 0
            );
            classAvg = (sum / discs.length).toFixed(2);
          }
        }

        console.log("[GRADES] Moyenne classe trouvee:", classAvg);

        if (classAvg) {
          const classEl = document.getElementById("stat-class-avg");
          classEl.textContent = classAvg;
          const classNum = parseFloat(String(classAvg).replace(",", "."));
          if (!isNaN(classNum)) {
            classEl.className =
              "stat-value " +
              (classNum >= 14 ? "avg-good" : classNum >= 10 ? "avg-mid" : "avg-bad");
          }
        }

        // Moyenne generale : chercher dans plusieurs endroits possibles
        const genAvg = periode.moyenneGenerale
          || (periode.ensembleMatieres && periode.ensembleMatieres.moyenneGenerale)
          || null;

        if (genAvg) {
          document.getElementById("stat-avg").textContent = genAvg;
          const avgNum = parseFloat(String(genAvg).replace(",", "."));
          const el = document.getElementById("stat-avg");
          el.className =
            "stat-value " +
            (avgNum >= 14 ? "avg-good" : avgNum >= 10 ? "avg-mid" : "avg-bad");
        }
      }
    }
  },
};
