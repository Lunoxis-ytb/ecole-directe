// ══ MODULE NOTES ══
const Grades = {
  rawData: null,
  chart: null,
  currentSemester: null,
  currentNotes: null,
  _chartLoaded: false,

  async ensureChartJs() {
    if (this._chartLoaded || typeof Chart !== "undefined") {
      this._chartLoaded = true;
      return;
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js";
      script.onload = () => { this._chartLoaded = true; resolve(); };
      script.onerror = () => reject(new Error("Chart.js failed to load"));
      document.head.appendChild(script);
    });
  },

  _lastDataHash: null,

  _hashData(data) {
    // Hash rapide pour detecter les changements
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
    const container = document.getElementById("grades-container");
    container.innerHTML = '<p class="loading">Chargement des notes...</p>';

    // ── Cache-first : afficher le cache immediatement ──
    const cached = await API.loadGradesCache();
    if (cached && cached.data) {
      console.log("[GRADES] Cache trouve, affichage immediat");
      this.rawData = cached.data;
      this._lastDataHash = this._hashData(cached.data);
      const defaultSemester = this._getDefaultSemester();
      document.getElementById("trimester-select").value = defaultSemester;
      this.render(defaultSemester);
      this.initChartSubjectSelect();
    }

    // ── Puis fetch les donnees fraiches ──
    const result = await API.getGrades();
    if (result.success) {
      const newHash = this._hashData(result.data);
      // Eviter le re-render si les donnees sont identiques au cache
      if (newHash !== this._lastDataHash) {
        this.rawData = result.data;
        this._lastDataHash = newHash;
        const defaultSemester = this._getDefaultSemester();
        document.getElementById("trimester-select").value = defaultSemester;
        this.render(defaultSemester);
        this.initChartSubjectSelect();
      }
      // Sauvegarder en cache (fire-and-forget)
      API.saveGradesCache(result.data);
    } else if (!cached) {
      container.innerHTML = `<p class="loading">Erreur : ${result.message}</p>`;
    }
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

    // Recuperer les rangs + min/max classe par matiere depuis les periodes
    const ranksMap = {};
    const classMinMax = {}; // { codeMatiere: { min, max } }
    let generalRank = null;
    if (data.periodes && semesterFilter) {
      const periode = data.periodes.find((p) => p.codePeriode === semesterFilter);
      if (periode && periode.ensembleMatieres && periode.ensembleMatieres.disciplines) {
        for (const disc of periode.ensembleMatieres.disciplines) {
          const rank = disc.rang || disc.rangEleve || disc.classement;
          if (rank != null && rank !== "" && rank !== 0) {
            ranksMap[disc.codeMatiere] = rank;
          }
          // Min/Max classe (meilleure et pire moyenne de la classe)
          const cMin = disc.moyenneMin || disc.moyenneBasse;
          const cMax = disc.moyenneMax || disc.moyenneHaute;
          if (cMin || cMax) {
            classMinMax[disc.codeMatiere] = {
              min: cMin ? parseFloat(String(cMin).replace(",", ".")) : null,
              max: cMax ? parseFloat(String(cMax).replace(",", ".")) : null,
            };
          }
        }
      }
      // Rang general
      if (periode) {
        const em = periode.ensembleMatieres || {};
        generalRank = periode.rangEleve || periode.rang || periode.classement
          || em.rangEleve || em.rang || em.classement || em.rangGeneral
          || null;

        if (!generalRank && em.disciplines) {
          for (const disc of em.disciplines) {
            if (disc.sousMatiere === false || disc.codeMatiere === "" || disc.id === 0) {
              const r = disc.rang || disc.rangEleve || disc.classement;
              if (r) { generalRank = r; break; }
            }
          }
        }
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
      const codeMatiere = s.notes[0] ? s.notes[0].codeMatiere : null;
      s.rank = codeMatiere && ranksMap[codeMatiere] ? ranksMap[codeMatiere] : "--";

      // Min/Max classe pour la matiere (fallback sur mes propres notes)
      const myValues = validNotes.map((n) => (parseFloat(n.valeur) / parseFloat(n.noteSur)) * 20);
      const classData = codeMatiere && classMinMax[codeMatiere];
      if (classData && (classData.min !== null || classData.max !== null)) {
        s.min = classData.min !== null ? classData.min.toFixed(1) : (myValues.length > 0 ? Math.min(...myValues).toFixed(1) : "--");
        s.max = classData.max !== null ? classData.max.toFixed(1) : (myValues.length > 0 ? Math.max(...myValues).toFixed(1) : "--");
        s.minMaxIsClass = true;
      } else {
        s.min = myValues.length > 0 ? Math.min(...myValues).toFixed(1) : "--";
        s.max = myValues.length > 0 ? Math.max(...myValues).toFixed(1) : "--";
        s.minMaxIsClass = false;
      }
      return s;
    });

    subjectList.sort((a, b) => a.name.localeCompare(b.name));

    // Mettre a jour le rang general dans les stats (couleur podium)
    const rankEl = document.getElementById("stat-rank");
    if (rankEl) {
      const r = parseInt(generalRank);
      rankEl.textContent = generalRank || "N/A";
      rankEl.className = "stat-value";
      if (r === 1) rankEl.classList.add("rank-gold");
      else if (r === 2) rankEl.classList.add("rank-silver");
      else if (r === 3) rankEl.classList.add("rank-bronze");
    }

    // Build table with DocumentFragment for performance
    const table = document.createElement("table");
    table.className = "grades-table";
    // Determine si on a des donnees classe pour l'en-tete
    const hasClassMinMax = subjectList.some((s) => s.minMaxIsClass);
    const minLabel = hasClassMinMax ? "Min classe" : "Min";
    const maxLabel = hasClassMinMax ? "Max classe" : "Max";
    table.innerHTML = `<thead><tr>
      <th>Matiere</th><th>Moyenne</th><th>Rang</th><th>Nb notes</th><th>${minLabel}</th><th>${maxLabel}</th>
    </tr></thead>`;

    const tbody = document.createElement("tbody");
    const fragment = document.createDocumentFragment();

    for (const s of subjectList) {
      const avgNum = parseFloat(s.avg);
      const avgClass =
        isNaN(avgNum) ? "" : avgNum >= 14 ? "avg-good" : avgNum >= 10 ? "avg-mid" : "avg-bad";
      const minNum = parseFloat(s.min);
      const maxNum = parseFloat(s.max);
      const minClass = isNaN(minNum) ? "" : minNum >= 14 ? "avg-good" : minNum >= 10 ? "avg-mid" : "avg-bad";
      const maxClass = isNaN(maxNum) ? "" : maxNum >= 14 ? "avg-good" : maxNum >= 10 ? "avg-mid" : "avg-bad";

      const row = document.createElement("tr");
      row.className = "subject-row";
      row.dataset.subject = s.name;
      row.innerHTML = `<td>${s.name}</td><td class="${avgClass}">${s.avg}</td><td class="rank-cell">${s.rank}</td><td>${s.notes.length}</td><td class="${minClass}">${s.min}</td><td class="${maxClass}">${s.max}</td>`;

      row.addEventListener("click", () => {
        const details = tbody.querySelectorAll(`.grade-detail[data-subject="${s.name}"]`);
        details.forEach((d) => { d.style.display = d.style.display === "none" ? "" : "none"; });
      });

      fragment.appendChild(row);

      for (const n of s.notes) {
        const dateStr = n.date ? new Date(n.date).toLocaleDateString("fr-FR") : "";
        // Min/Max de l'eval (note la plus basse et haute de la classe sur cette eval)
        const evalMin = n.minClasse || n.noteMin;
        const evalMax = n.maxClasse || n.noteMax;
        const evalMinStr = evalMin ? String(evalMin).replace(",", ".") : "--";
        const evalMaxStr = evalMax ? String(evalMax).replace(",", ".") : "--";
        const detail = document.createElement("tr");
        detail.className = "grade-detail";
        detail.dataset.subject = s.name;
        detail.style.display = "none";
        detail.innerHTML = `<td>${n.devoir || ""}</td><td>${n.valeur}/${n.noteSur}</td><td>${dateStr}</td><td></td><td>${evalMinStr}</td><td>${evalMaxStr}</td>`;
        fragment.appendChild(detail);
      }
    }

    tbody.appendChild(fragment);
    table.appendChild(tbody);
    container.innerHTML = "";
    container.appendChild(table);

    // Graphiques (lazy load Chart.js)
    this.ensureChartJs().then(() => {
      this.renderLineChart();
    }).catch((err) => console.warn("[GRADES] Chart.js non disponible:", err.message));
  },

  // Remplir le selecteur de matieres pour le graphique
  _chartSelectBound: false,

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

    select.innerHTML = '<option value="">Toutes matieres</option>';
    const sorted = [...subjects.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    for (const [code, name] of sorted) {
      select.innerHTML += `<option value="${code}">${name}</option>`;
    }

    if (!this._chartSelectBound) {
      this._chartSelectBound = true;
      select.addEventListener("change", () => {
        this.renderLineChart(select.value || null);
      });
    }
  },

  // Calculer la moyenne de classe pour un filtre matiere donne
  _getClassAvgForSubject(subjectFilter) {
    const data = this.rawData;
    if (!data || !data.periodes) return null;

    const periode = data.periodes.find((p) => p.codePeriode === this.currentSemester);
    if (!periode || !periode.ensembleMatieres || !periode.ensembleMatieres.disciplines) return null;

    if (subjectFilter) {
      // Moyenne classe d'une matiere specifique
      for (const disc of periode.ensembleMatieres.disciplines) {
        if (disc.codeMatiere === subjectFilter) {
          const val = disc.moyenneClasse;
          if (val) return parseFloat(String(val).replace(",", "."));
        }
      }
      return null;
    }

    // Moyenne classe generale
    let classAvg = periode.moyenneClasse
      || (periode.ensembleMatieres && periode.ensembleMatieres.moyenneClasse)
      || null;

    if (!classAvg) {
      const discs = periode.ensembleMatieres.disciplines.filter(
        (d) => d.moyenneClasse && !isNaN(parseFloat(String(d.moyenneClasse).replace(",", ".")))
      );
      if (discs.length > 0) {
        const sum = discs.reduce((acc, d) => acc + parseFloat(String(d.moyenneClasse).replace(",", ".")), 0);
        classAvg = (sum / discs.length).toFixed(2);
      }
    }

    return classAvg ? parseFloat(String(classAvg).replace(",", ".")) : null;
  },

  // Graphique : Evolution de ma moyenne + notes + moyenne classe (glissante)
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

    // Moyenne classe glissante
    const classRunningData = [];
    let classRunningSum = 0;
    let classRunningCount = 0;

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

      if (n.moyenneClasse) {
        const classVal = parseFloat(String(n.moyenneClasse).replace(",", "."));
        if (!isNaN(classVal)) {
          classRunningSum += classVal;
          classRunningCount++;
        }
      }
      classRunningData.push(classRunningCount > 0 ? parseFloat((classRunningSum / classRunningCount).toFixed(2)) : null);
    }

    // Fallback : moyenne classe fixe si pas de donnees glissantes
    const fixedClassAvg = this._getClassAvgForSubject(subjectFilter);

    // Gradient
    const h = canvas.parentElement ? canvas.parentElement.clientHeight : 300;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "rgba(79, 140, 255, 0.20)");
    gradient.addColorStop(1, "rgba(79, 140, 255, 0)");

    // Datasets : toujours 3 (Ma moyenne, Notes, Classe)
    const datasets = [
      {
        label: "Ma moyenne",
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
        borderColor: "#e2e8f0",
        backgroundColor: "#e2e8f0",
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
    ];

    // Toujours ajouter la courbe classe (glissante, fallback fixe)
    const hasClassData = classRunningData.some(v => v !== null);
    if (hasClassData) {
      datasets.push({
        label: "Classe",
        data: classRunningData,
        borderColor: "#a78bfa",
        borderWidth: 2,
        borderDash: [6, 3],
        pointRadius: 0,
        pointHoverRadius: 4,
        pointBackgroundColor: "#a78bfa",
        tension: 0.35,
        fill: false,
      });
    } else if (fixedClassAvg) {
      datasets.push({
        label: "Classe",
        data: labels.map(() => fixedClassAvg),
        borderColor: "#a78bfa",
        borderWidth: 2,
        borderDash: [6, 3],
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0,
        fill: false,
      });
    }

    // Couleurs pour les pills de legende
    const legendColors = {
      "Ma moyenne": "#4f8cff",
      "Notes": "#9aa0b0",
      "Classe": "#a78bfa",
    };

    this.chart = new Chart(canvas, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800, easing: "easeOutQuart" },
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: {
            display: true,
            labels: {
              color: "#9aa0b0",
              usePointStyle: true,
              pointStyle: "circle",
              padding: 20,
              font: { size: 12, weight: "500" },
            },
            onHover(e) { e.native.target.style.cursor = "pointer"; },
            onLeave(e) { e.native.target.style.cursor = "default"; },
          },
          // Plugin custom pour dessiner des pills autour de chaque item de legende
          legendPillPlugin: true,
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
                if (ctx.dataset.label === "Ma moyenne") return `Ma moyenne: ${ctx.parsed.y}/20`;
                if (ctx.dataset.label === "Classe") return `Classe: ${ctx.parsed.y}/20`;
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
      plugins: [{
        id: "legendPills",
        afterDraw(chart) {
          const legend = chart.legend;
          if (!legend || !legend.legendItems) return;
          const ctx = chart.ctx;
          // Couleurs fixes par label pour eviter les problemes de couleur
          const pillColors = { "Ma moyenne": "#4f8cff", "Notes": "#e2e8f0", "Classe": "#a78bfa" };

          for (let i = 0; i < legend.legendItems.length; i++) {
            const item = legend.legendItems[i];
            const hitBox = legend.legendHitBoxes[i];
            if (!hitBox) continue;

            const x = hitBox.left - 6;
            const y = hitBox.top - 4;
            const w = hitBox.width + 12;
            const h = hitBox.height + 8;
            const r = h / 2;
            const color = pillColors[item.text] || "#9aa0b0";
            const hidden = item.hidden;

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
            if (hidden) {
              // Desactive : fond sombre, bordure discrète
              ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
              ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
            } else {
              // Active : fond colore semi-transparent, bordure visible
              const r2 = parseInt(color.slice(1, 3), 16);
              const g2 = parseInt(color.slice(3, 5), 16);
              const b2 = parseInt(color.slice(5, 7), 16);
              ctx.fillStyle = `rgba(${r2}, ${g2}, ${b2}, 0.15)`;
              ctx.strokeStyle = `rgba(${r2}, ${g2}, ${b2}, 0.7)`;
            }
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        },
      }],
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
