(function () {
  let randomMemoryItems = [];
  let lastRandomHref = "";

  function commentText(item) {
    return String(item.memoryText || item.searchFields?.comment?.join(" ") || "").replace(/\s+/g, " ").trim();
  }

  function hasComment(item) {
    if (Number.isFinite(item.commentCount)) {
      return item.commentCount > 0;
    }

    return commentText(item).length > 0;
  }

  function targetHref(href) {
    return href || "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function excerpt(text, maxLength = 72) {
    const source = String(text || "").replace(/\s+/g, " ").trim();
    return source.length > maxLength ? `${source.slice(0, maxLength)}…` : source;
  }

  function splitSubtitle(subtitle) {
    return String(subtitle || "").split(" / ").filter(Boolean);
  }

  function renderRandomItem(item) {
    const host = document.getElementById("random-memory-result");
    if (!host || !item) return;

    const parts = splitSubtitle(item.subtitle);
    const liveName = parts[0] || item.title || "";
    const context = parts.slice(1).join(" / ");

    host.innerHTML = `
      <a class="new-moment-card random-memory-card" href="${escapeHtml(targetHref(item.href))}">
        <span class="new-moment-icon" aria-hidden="true">💬</span>
        <p class="new-moment-quote">「${escapeHtml(excerpt(commentText(item)))}」</p>
        <div class="new-moment-meta">
          ${liveName ? `<p class="new-moment-live">${escapeHtml(liveName)}</p>` : ""}
          <p>
            ${item.pageTypeLabel ? `<span class="new-moment-label">【${escapeHtml(item.pageTypeLabel)}】</span>` : ""}
            ${context ? `<span class="new-moment-context">${escapeHtml(context)}</span>` : ""}
          </p>
        </div>
      </a>
    `;
  }

  function pickRandom(items) {
    if (items.length <= 1) {
      return items[0];
    }

    const candidates = items.filter(item => targetHref(item.href) !== lastRandomHref);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function setStatus(message) {
    const status = document.getElementById("random-memory-status");

    if (!status) {
      return;
    }

    status.textContent = message || "";
    status.hidden = !message;
  }

  async function initRandomMemory() {
    const button = document.getElementById("random-memory-button");

    if (!button) {
      return;
    }

    button.disabled = true;
    setStatus("");

    try {
      const items = window.CommentData
        ? await window.CommentData.loadSupabaseMemoryItems()
        : [];
      randomMemoryItems = items.filter(item => item.href && hasComment(item));

      if (!randomMemoryItems.length) {
        button.disabled = true;
        setStatus("まだ思い出は投稿されていません。");
        return;
      }

      button.disabled = false;
      button.addEventListener("click", () => {
        const item = pickRandom(randomMemoryItems);

        if (!item) {
          return;
        }

        lastRandomHref = targetHref(item.href);
        renderRandomItem(item);
      });
    } catch (error) {
      button.disabled = true;
      setStatus("思い出を読み込めませんでした。時間をおいて再読み込みしてください。");
    }
  }

  window.initRandomMemory = initRandomMemory;
})();
