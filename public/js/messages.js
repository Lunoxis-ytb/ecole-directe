// ══ MODULE MESSAGERIE ══
const Messages = {
  rawData: null,
  currentView: "inbox", // "inbox" ou "sent"
  currentMessage: null,

  async load() {
    const container = document.getElementById("messages-container");
    container.innerHTML = '<p class="loading">Chargement des messages...</p>';

    const type = this.currentView === "sent" ? "sent" : "received";
    const result = await API.getMessages(type);

    if (result.success) {
      this.rawData = result.data;
      this.renderList();
    } else {
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

    // Tabs inbox/sent
    const tabs = document.createElement("div");
    tabs.className = "msg-tabs";
    tabs.innerHTML = `
      <button class="msg-tab${this.currentView === "inbox" ? " active" : ""}" data-view="inbox">Recus</button>
      <button class="msg-tab${this.currentView === "sent" ? " active" : ""}" data-view="sent">Envoyes</button>
    `;
    fragment.appendChild(tabs);

    // Liste des messages
    const list = document.createElement("div");
    list.className = "msg-list";

    for (const msg of messages) {
      const item = document.createElement("div");
      item.className = `msg-item${msg.read ? "" : " msg-unread"}`;

      const from = msg.from && msg.from.name ? msg.from.name
        : msg.de ? msg.de
        : msg.expediteur || "Inconnu";

      const subject = msg.subject || msg.sujet || "Sans objet";
      const date = msg.date ? new Date(msg.date).toLocaleDateString("fr-FR", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      }) : "";

      const preview = msg.preview || msg.apercu || "";

      item.innerHTML = `
        <div class="msg-header-row">
          <span class="msg-from">${this._escapeHtml(from)}</span>
          <span class="msg-date">${date}</span>
        </div>
        <div class="msg-subject">${this._escapeHtml(subject)}</div>
        ${preview ? `<div class="msg-preview">${this._escapeHtml(preview)}</div>` : ""}
      `;

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

    const from = msgMeta.from && msgMeta.from.name ? msgMeta.from.name
      : msgMeta.de ? msgMeta.de
      : msgMeta.expediteur || "Inconnu";
    const subject = msgMeta.subject || msgMeta.sujet || "Sans objet";
    const date = msgMeta.date ? new Date(msgMeta.date).toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }) : "";

    // Decoder le contenu (souvent en base64)
    let content = "";
    if (msg.content || msg.contenu) {
      try {
        content = atob(msg.content || msg.contenu);
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
    backBtn.textContent = "< Retour";
    backBtn.addEventListener("click", () => this.renderList());
    fragment.appendChild(backBtn);

    // Message complet
    const msgDiv = document.createElement("div");
    msgDiv.className = "msg-detail";
    msgDiv.innerHTML = `
      <div class="msg-detail-header">
        <h3 class="msg-detail-subject">${this._escapeHtml(subject)}</h3>
        <div class="msg-detail-meta">
          <span class="msg-detail-from">${this._escapeHtml(from)}</span>
          <span class="msg-detail-date">${date}</span>
        </div>
      </div>
      <div class="msg-detail-body">${cleanContent || "<em>Message vide</em>"}</div>
    `;
    fragment.appendChild(msgDiv);

    // Pièces jointes
    const files = msg.files || msg.fichpieces || msg.ppieces || [];
    if (files.length > 0) {
      const attachDiv = document.createElement("div");
      attachDiv.className = "msg-attachments";
      attachDiv.innerHTML = `<div class="msg-attach-label">Pieces jointes (${files.length})</div>`;
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

  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};
