// ══ MODULE BULLETIN ══
const Bulletin = {
  currentPeriode: null,

  _decodeB64(str) {
    if (!str) return "";
    try {
      // Decoder base64 puis convertir les octets UTF-8 correctement (accents)
      const bytes = Uint8Array.from(atob(str), c => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      try { return atob(str); } catch { return str; }
    }
  },

  _cleanHtml(str) {
    return str
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
  },

  _getAppreciation(disc) {
    let raw = "";
    if (disc.appreciations && disc.appreciations.length > 0) {
      raw = disc.appreciations.map(a => a.appreciation || a).join(" ");
    } else if (disc.appreciation) {
      raw = disc.appreciation;
    } else if (disc.commentaire) {
      raw = disc.commentaire;
    }
    if (!raw) return "";
    // Decoder base64 puis nettoyer le HTML
    return this._cleanHtml(this._decodeB64(raw));
  },

  render(periodeCode) {
    const container = document.getElementById("bulletin-container");
    const data = Grades.rawData;

    if (!data || !data.periodes || data.periodes.length === 0) {
      container.innerHTML = '<p class="loading">Aucune donnee de bulletin disponible. Chargez d\'abord les notes.</p>';
      return;
    }

    // Selectionner la periode
    const periode = periodeCode
      ? data.periodes.find((p) => p.codePeriode === periodeCode)
      : data.periodes[0];

    if (!periode) {
      container.innerHTML = '<p class="loading">Periode introuvable</p>';
      return;
    }

    this.currentPeriode = periode;

    const disciplines = periode.ensembleMatieres && periode.ensembleMatieres.disciplines
      ? periode.ensembleMatieres.disciplines
      : [];

    // Remplir le select des periodes
    const select = document.getElementById("bulletin-period-select");
    if (select && select.options.length <= 1) {
      select.innerHTML = "";
      for (const p of data.periodes) {
        if (!p.idPeriode && !p.codePeriode) continue;
        const opt = document.createElement("option");
        opt.value = p.codePeriode;
        opt.textContent = p.periode || p.libelle || p.codePeriode;
        select.appendChild(opt);
      }
    }
    if (select) select.value = periode.codePeriode;

    // Moyennes generales
    const genAvg = periode.moyenneGenerale
      || (periode.ensembleMatieres && periode.ensembleMatieres.moyenneGenerale)
      || "--";
    const classAvg = periode.moyenneClasse
      || (periode.ensembleMatieres && periode.ensembleMatieres.moyenneClasse)
      || "--";

    // Construire le bulletin
    const fragment = document.createDocumentFragment();

    // Header info
    const header = document.createElement("div");
    header.className = "bul-header";
    const studentName = document.getElementById("student-name")
      ? document.getElementById("student-name").textContent
      : "";
    header.innerHTML = `
      <div class="bul-info">
        <span class="bul-student">${studentName}</span>
        <span class="bul-period">${periode.periode || periode.libelle || ""}</span>
      </div>
      <div class="bul-avg-cards">
        <div class="bul-avg-card">
          <span class="bul-avg-label">Moyenne generale</span>
          <span class="bul-avg-value ${this._avgClass(genAvg)}">${genAvg}</span>
        </div>
        <div class="bul-avg-card">
          <span class="bul-avg-label">Moyenne classe</span>
          <span class="bul-avg-value ${this._avgClass(classAvg)}">${classAvg}</span>
        </div>
      </div>
    `;
    fragment.appendChild(header);

    // Table du bulletin
    const table = document.createElement("table");
    table.className = "bul-table";
    table.innerHTML = `<thead><tr>
      <th>Matiere</th>
      <th>Moyenne</th>
      <th>Classe</th>
      <th>Min</th>
      <th>Max</th>
      <th>Appreciations</th>
    </tr></thead>`;

    const tbody = document.createElement("tbody");

    // Trier : "Enseignement général" et lignes sans codeMatiere en dernier
    const sorted = [...disciplines].sort((a, b) => {
      const nameA = (a.discipline || "").toLowerCase();
      const nameB = (b.discipline || "").toLowerCase();
      const isGenA = !a.codeMatiere || nameA.includes("enseignement") || nameA.includes("g\u00e9n\u00e9ral");
      const isGenB = !b.codeMatiere || nameB.includes("enseignement") || nameB.includes("g\u00e9n\u00e9ral");
      if (isGenA && !isGenB) return 1;
      if (!isGenA && isGenB) return -1;
      return 0;
    });

    for (const disc of sorted) {
      if (!disc.codeMatiere && !disc.discipline) continue;
      if (disc.sousMatiere === true) continue;

      const row = document.createElement("tr");

      const name = disc.discipline || disc.codeMatiere || "";
      const avg = disc.moyenne || "--";
      const cAvg = disc.moyenneClasse || "--";
      const min = disc.moyenneMin || disc.moyenneBasse || "--";
      const max = disc.moyenneMax || disc.moyenneHaute || "--";

      const appreciation = this._getAppreciation(disc);

      row.innerHTML = `
        <td class="bul-matiere">${name}</td>
        <td class="${this._avgClass(avg)}">${avg}</td>
        <td>${cAvg}</td>
        <td>${min}</td>
        <td>${max}</td>
        <td class="bul-appreciation">${appreciation}</td>
      `;

      tbody.appendChild(row);
    }

    table.appendChild(tbody);
    fragment.appendChild(table);

    // Bouton export PDF
    const exportBtn = document.createElement("button");
    exportBtn.className = "bul-export-btn";
    exportBtn.textContent = "Exporter en PDF";
    exportBtn.addEventListener("click", () => this.exportPDF());
    fragment.appendChild(exportBtn);

    container.innerHTML = "";
    container.appendChild(fragment);
  },

  _avgClass(val) {
    const num = parseFloat(String(val).replace(",", "."));
    if (isNaN(num)) return "";
    return num >= 14 ? "avg-good" : num >= 10 ? "avg-mid" : "avg-bad";
  },

  exportPDF() {
    const periode = this.currentPeriode;
    if (!periode) return;

    const disciplines = periode.ensembleMatieres && periode.ensembleMatieres.disciplines
      ? periode.ensembleMatieres.disciplines
      : [];

    const studentName = document.getElementById("student-name")
      ? document.getElementById("student-name").textContent
      : "";

    const genAvg = periode.moyenneGenerale
      || (periode.ensembleMatieres && periode.ensembleMatieres.moyenneGenerale)
      || "--";
    const classAvg = periode.moyenneClasse
      || (periode.ensembleMatieres && periode.ensembleMatieres.moyenneClasse)
      || "--";

    // Construire le HTML du bulletin pour impression
    const sortedPdf = [...disciplines].sort((a, b) => {
      const nameA = (a.discipline || "").toLowerCase();
      const nameB = (b.discipline || "").toLowerCase();
      const isGenA = !a.codeMatiere || nameA.includes("enseignement") || nameA.includes("g\u00e9n\u00e9ral");
      const isGenB = !b.codeMatiere || nameB.includes("enseignement") || nameB.includes("g\u00e9n\u00e9ral");
      if (isGenA && !isGenB) return 1;
      if (!isGenA && isGenB) return -1;
      return 0;
    });

    let rows = "";
    for (const disc of sortedPdf) {
      if (!disc.codeMatiere && !disc.discipline) continue;
      if (disc.sousMatiere === true) continue;

      const name = disc.discipline || disc.codeMatiere || "";
      const avg = disc.moyenne || "--";
      const cAvg = disc.moyenneClasse || "--";
      const min = disc.moyenneMin || disc.moyenneBasse || "--";
      const max = disc.moyenneMax || disc.moyenneHaute || "--";

      const appreciation = this._getAppreciation(disc);

      const avgNum = parseFloat(String(avg).replace(",", "."));
      const color = isNaN(avgNum) ? "#333" : avgNum >= 14 ? "#059669" : avgNum >= 10 ? "#d97706" : "#dc2626";

      rows += `<tr>
        <td style="font-weight:500">${name}</td>
        <td style="color:${color};font-weight:600;text-align:center">${avg}</td>
        <td style="text-align:center">${cAvg}</td>
        <td style="text-align:center">${min}</td>
        <td style="text-align:center">${max}</td>
        <td style="font-size:11px;color:#555">${appreciation}</td>
      </tr>`;
    }

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>Bulletin - ${studentName} - ${periode.periode || ""}</title>
<style>
  @page { margin: 15mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1d27; font-size: 13px; }
  .header { text-align:center; margin-bottom:20px; padding-bottom:15px; border-bottom:2px solid #4f6cff; }
  .header h1 { font-size:20px; color:#4f6cff; margin-bottom:4px; }
  .header p { font-size:14px; color:#555; }
  .avg-row { display:flex; justify-content:center; gap:30px; margin:15px 0; }
  .avg-box { text-align:center; padding:10px 20px; border:1px solid #e5e7eb; border-radius:8px; }
  .avg-box .label { font-size:11px; color:#888; text-transform:uppercase; letter-spacing:0.5px; }
  .avg-box .value { font-size:22px; font-weight:700; margin-top:2px; }
  table { width:100%; border-collapse:collapse; margin-top:15px; }
  th { background:#f3f4f6; padding:10px 8px; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#555; border-bottom:2px solid #e5e7eb; border-right:1px solid #e5e7eb; text-align:left; }
  th:last-child { border-right:none; }
  td { padding:9px 8px; border-bottom:1px solid #f0f0f0; border-right:1px solid #f0f0f0; }
  td:last-child { border-right:none; }
  tr:hover { background:#f9fafb; }
  .footer { margin-top:20px; text-align:center; font-size:11px; color:#aaa; }
</style></head><body>
<div class="header">
  <h1>Bulletin Scolaire</h1>
  <p>${studentName} &mdash; ${periode.periode || periode.libelle || ""}</p>
</div>
<div class="avg-row">
  <div class="avg-box"><div class="label">Moyenne generale</div><div class="value">${genAvg}</div></div>
  <div class="avg-box"><div class="label">Moyenne classe</div><div class="value">${classAvg}</div></div>
</div>
<table>
  <thead><tr><th>Matiere</th><th style="text-align:center">Moyenne</th><th style="text-align:center">Classe</th><th style="text-align:center">Min</th><th style="text-align:center">Max</th><th>Appreciations</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">Genere depuis EDMM &mdash; ${new Date().toLocaleDateString("fr-FR")}</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  },
};
