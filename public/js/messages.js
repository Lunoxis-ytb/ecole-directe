// ══ MODULE MESSAGERIE ══
const Messages = {
  rawData: null,
  currentView: "inbox", // "inbox" ou "sent"
  currentMessage: null,

  async load() {
    const container = document.getElementById("messages-container");
    container.innerHTML = '<p class="loading">Chargement des messages...</p>';

    const type = this.currentView === "sent" ? "sent" : "received";

    // Cache-first : afficher le cache immédiatement
    const cacheKey = `edmm_msg_cache_${API.userId}_${type}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        this.rawData = JSON.parse(cached);
        this.renderList();
      }
    } catch {}

    // Puis fetch les données fraîches
    const result = await API.getMessages(type);

    if (result.success) {
      this.rawData = result.data;
      this.renderList();
      try { localStorage.setItem(cacheKey, JSON.stringify(result.data)); } catch {}
    } else if (!this.rawData) {
      container.innerHTML = `<p class="loading">Erreur : ${result.message}</p>`;
    }
  },

  renderList() {
    const container = document.getElementById("messages-container");
    const data = this.rawData;

    if (!data || !data.messages) {
      container.innerHTML = '<p class="loading">Aucun message</p>';
      return;
    }

    // Les messages peuvent etre dans received ou sent
    const messages = data.messages.received || data.messages.sent || [];

    if (messages.length === 0) {
      container.innerHTML = '<p class="loading">Aucun message</p>';
      return;
    }

    const fragment = document.createDocumentFragment();

    // Tabs inbox/sent (styled as pills)
    const tabs = document.createElement("div");
    tabs.className = "msg-tabs";

    const inboxTab = document.createElement("button");
    inboxTab.className = "msg-tab" + (this.currentView === "inbox" ? " active" : "");
    inboxTab.dataset.view = "inbox";
    inboxTab.textContent = "Reçus";
    tabs.appendChild(inboxTab);

    const sentTab = document.createElement("button");
    sentTab.className = "msg-tab" + (this.currentView === "sent" ? " active" : "");
    sentTab.dataset.view = "sent";
    sentTab.textContent = "Envoyés";
    tabs.appendChild(sentTab);

    fragment.appendChild(tabs);

    // Liste des messages
    const list = document.createElement("div");
    list.className = "msg-list";

    for (const msg of messages) {
      const item = document.createElement("div");
      item.className = "msg-item" + (msg.read ? "" : " msg-unread");

      const from = msg.from
        ? `${msg.from.civilite ? msg.from.civilite + ' ' : ''}${msg.from.prenom || ''} ${msg.from.nom || ''}`.trim() || "Inconnu"
        : "Inconnu";

      const subject = msg.subject || msg.sujet || "Sans objet";
      const date = msg.date ? this._formatDate(msg.date) : "";
      const preview = msg.preview || msg.apercu || "";

      // Create initial circle
      const initial = from.charAt(0).toUpperCase();
      const color = this._getColorForName(from);

      const avatarCircle = document.createElement("div");
      avatarCircle.className = "msg-avatar";
      avatarCircle.style.backgroundColor = color;
      avatarCircle.textContent = initial;

      // Create content wrapper
      const contentWrapper = document.createElement("div");
      contentWrapper.className = "msg-content";

      // Sender name
      const senderEl = document.createElement("div");
      senderEl.className = "msg-sender";
      senderEl.textContent = from;

      // Subject
      const subjectEl = document.createElement("div");
      subjectEl.className = "msg-subject-line";
      subjectEl.textContent = subject;

      // Preview (if exists)
      if (preview) {
        const previewEl = document.createElement("div");
        previewEl.className = "msg-preview";
        previewEl.textContent = preview;
        contentWrapper.appendChild(senderEl);
        contentWrapper.appendChild(subjectEl);
        contentWrapper.appendChild(previewEl);
      } else {
        contentWrapper.appendChild(senderEl);
        contentWrapper.appendChild(subjectEl);
      }

      // Date on the right
      const dateEl = document.createElement("div");
      dateEl.className = "msg-date";
      dateEl.textContent = date;

      // Assemble the item
      item.appendChild(avatarCircle);
      item.appendChild(contentWrapper);
      item.appendChild(dateEl);

      item.addEventListener("click", () => {
        this.openMessage(msg.id, msg);
      });

      list.appendChild(item);
    }

    fragment.appendChild(list);
    container.innerHTML = "";
    container.appendChild(fragment);

    // Event listeners tabs
    container.querySelectorAll(".msg-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        this.currentView = btn.dataset.view;
        this.load();
      });
    });
  },

  async openMessage(msgId, msgMeta) {
    const container = document.getElementById("messages-container");
    container.innerHTML = '<p class="loading">Chargement du message...</p>';

    const mode = this.currentView === "sent" ? "expediteur" : "destinataire";
    const result = await API.readMessage(msgId, mode);

    if (!result.success) {
      container.innerHTML = `<p class="loading">Erreur : ${result.message}</p>`;
      return;
    }

    this.currentMessage = result.data;
    const msg = result.data;

    const from = msgMeta.from
      ? `${msgMeta.from.civilite ? msgMeta.from.civilite + ' ' : ''}${msgMeta.from.prenom || ''} ${msgMeta.from.nom || ''}`.trim() || "Inconnu"
      : "Inconnu";
    const subject = msgMeta.subject || msgMeta.sujet || "Sans objet";
    const date = msgMeta.date ? new Date(msgMeta.date).toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }) : "";

    // Decoder le contenu base64 avec support UTF-8 (accents)
    let content = "";
    if (msg.content || msg.contenu) {
      try {
        const raw = msg.content || msg.contenu;
        const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
        content = new TextDecoder("utf-8").decode(bytes);
      } catch {
        content = msg.content || msg.contenu || "";
      }
    }

    // Nettoyer le HTML basique
    const cleanContent = content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

    const fragment = document.createDocumentFragment();

    // Bouton retour
    const backBtn = document.createElement("button");
    backBtn.className = "msg-back";
    backBtn.textContent = "← Retour";
    backBtn.addEventListener("click", () => this.renderList());
    fragment.appendChild(backBtn);

    // Message complet
    const msgDiv = document.createElement("div");
    msgDiv.className = "msg-detail";

    // Header with avatar
    const detailHeader = document.createElement("div");
    detailHeader.className = "msg-detail-header";

    // Avatar circle for detail view
    const initial = from.charAt(0).toUpperCase();
    const color = this._getColorForName(from);
    const avatarCircle = document.createElement("div");
    avatarCircle.className = "msg-detail-avatar";
    avatarCircle.style.backgroundColor = color;
    avatarCircle.textContent = initial;

    const headerContent = document.createElement("div");
    headerContent.className = "msg-detail-header-content";

    const subjectH3 = document.createElement("h3");
    subjectH3.className = "msg-detail-subject";
    subjectH3.textContent = subject;

    const metaDiv = document.createElement("div");
    metaDiv.className = "msg-detail-meta";

    const fromSpan = document.createElement("span");
    fromSpan.className = "msg-detail-from";
    fromSpan.textContent = from;

    const dateSpan = document.createElement("span");
    dateSpan.className = "msg-detail-date";
    dateSpan.textContent = date;

    metaDiv.appendChild(fromSpan);
    metaDiv.appendChild(dateSpan);

    headerContent.appendChild(subjectH3);
    headerContent.appendChild(metaDiv);

    detailHeader.appendChild(avatarCircle);
    detailHeader.appendChild(headerContent);

    msgDiv.appendChild(detailHeader);

    // Body content (using innerHTML for HTML content from API)
    const bodyDiv = document.createElement("div");
    bodyDiv.className = "msg-detail-body";
    bodyDiv.innerHTML = cleanContent || "<em>Message vide</em>";

    msgDiv.appendChild(bodyDiv);
    fragment.appendChild(msgDiv);

    // Pièces jointes
    const files = msg.files || msg.fichpieces || msg.ppieces || [];
    if (files.length > 0) {
      const attachDiv = document.createElement("div");
      attachDiv.className = "msg-attachments";

      const labelDiv = document.createElement("div");
      labelDiv.className = "msg-attach-label";
      labelDiv.textContent = `Pièces jointes (${files.length})`;
      attachDiv.appendChild(labelDiv);

      for (const f of files) {
        const name = f.libelle || f.nom || "Fichier";
        const link = document.createElement("div");
        link.className = "msg-attach-item";
        link.textContent = name;
        attachDiv.appendChild(link);
      }
      fragment.appendChild(attachDiv);
    }

    container.innerHTML = "";
    container.appendChild(fragment);
  },

  // Hash name to deterministic color
  _getColorForName(name) {
    const colors = [
      "#1abc9c", "#2ecc71", "#3498db", "#9b59b6", "#34495e",
      "#16a085", "#27ae60", "#2980b9", "#8e44ad", "#2c3e50",
      "#f39c12", "#e67e22", "#e74c3c", "#c0392b", "#d35400"
    ];

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash; // Convert to 32bit integer
    }

    const index = Math.abs(hash) % colors.length;
    return colors[index];
  },

  // Format date in Gmail style (short for today/yesterday, otherwise date)
  _formatDate(dateStr) {
    const msgDate = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());

    const diffDays = Math.floor((today - msgDay) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      // Today: show time
      return msgDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays < 7) {
      // This week: show day name
      return msgDate.toLocaleDateString("fr-FR", { weekday: "short" });
    } else {
      // Older: show date
      return msgDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    }
  },

  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};
