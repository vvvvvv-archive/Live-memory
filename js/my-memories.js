(function () {
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeSpaces(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function excerpt(text, maxLength = 120) {
    const source = normalizeSpaces(text);

    if (source.length <= maxLength) {
      return source;
    }

    return `${source.slice(0, maxLength)}…`;
  }

  function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function splitSubtitle(subtitle) {
    return String(subtitle || "").split(" / ").map(part => part.trim()).filter(Boolean);
  }

  function details(item) {
    const parts = splitSubtitle(item.subtitle);
    return {
      liveName: parts[0] || item.title || "思い出",
      context: parts.slice(1).join(" / ")
    };
  }

  function renderTags(tags = []) {
    if (!Array.isArray(tags) || !tags.length) {
      return "";
    }

    return `
      <div class="my-memory-tags">
        ${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}
      </div>
    `;
  }

  function renderCard(item) {
    const { liveName, context } = details(item);
    const text = excerpt(item.memoryText || "");
    const postedAt = formatDate(item.createdAt);
    const label = item.pageTypeLabel || "思い出";

    return `
      <a class="new-moment-card my-memory-card" href="${escapeHtml(item.href)}">
        <span class="new-moment-icon" aria-hidden="true">💬</span>
        <div class="my-memory-card-head">
          <span class="new-moment-label">【${escapeHtml(label)}】</span>
          ${item.isReply ? `<span class="my-memory-reply-label">返信</span>` : ""}
        </div>
        <p class="new-moment-live">${escapeHtml(liveName)}</p>
        ${context ? `<p class="new-moment-context">${escapeHtml(context)}</p>` : ""}
        ${postedAt ? `<time class="my-memory-date" datetime="${escapeHtml(item.createdAt)}">${escapeHtml(postedAt)}</time>` : ""}
        <p class="new-moment-quote">「${escapeHtml(text)}」</p>
        ${renderTags(item.tags)}
      </a>
    `;
  }

  function renderEmpty(container, countElement) {
    countElement.textContent = "0件の思い出";
    container.innerHTML = `
      <div class="new-moments-empty my-memories-empty">
        <p>まだ思い出はありません。</p>
        <p>思い出を投稿すると、ここに一覧表示されます。</p>
        <a class="button" href="index.html#archive">Archiveを見る</a>
      </div>
    `;
  }

  function renderError(container, countElement) {
    countElement.textContent = "取得できませんでした";
    container.innerHTML = `
      <div class="new-moments-empty my-memories-empty">
        <p>自分の思い出を読み込めませんでした。</p>
        <p>時間をおいて再読み込みしてください。</p>
      </div>
    `;
  }

  async function initMyMemories() {
    const container = document.getElementById("my-memories-list");
    const countElement = document.getElementById("my-memories-count");

    if (!container || !countElement) {
      return;
    }

    try {
      const result = window.CommentData
        ? await window.CommentData.loadOwnSupabaseMemoryItems()
        : { items: [], hasAuthorToken: false };
      const items = result.items || [];

      if (!items.length) {
        renderEmpty(container, countElement);
        return;
      }

      const sorted = [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      countElement.textContent = `${sorted.length}件の思い出`;
      container.innerHTML = sorted.map(renderCard).join("");
    } catch (error) {
      renderError(container, countElement);
    }
  }

  initMyMemories();
})();
