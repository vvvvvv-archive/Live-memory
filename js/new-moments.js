(function () {
  const MAX_NEW_MOMENTS = 3;

  const PAGE_TYPE_LABELS = {
    general: "総合",
    schedule: "公演日程",
    video: "映像・円盤",
    goods: "グッズ",
    live: "LIVE",
    group: "グループ"
  };

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

  function excerpt(text, maxLength = 56) {
    const source = normalizeSpaces(text);

    if (source.length <= maxLength) {
      return source;
    }

    return `${source.slice(0, maxLength)}…`;
  }

  function splitSubtitle(subtitle) {
    return String(subtitle || "").split(" / ").map(part => part.trim()).filter(Boolean);
  }

  function pageTypeLabel(item) {
    return item.pageTypeLabel || PAGE_TYPE_LABELS[item.pageType] || "思い出";
  }

  function momentDetails(item) {
    const parts = splitSubtitle(item.subtitle);
    const liveName = parts[0] || item.title || "";
    const context = parts.slice(1).join(" / ");

    return { liveName, context };
  }

  function relativeTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    const minute = 60;
    const hour = minute * 60;
    const day = hour * 24;
    const month = day * 30;
    const year = day * 365;

    if (diffSeconds < minute) {
      return "たった今";
    }

    if (diffSeconds < hour) {
      return `${Math.floor(diffSeconds / minute)}分前`;
    }

    if (diffSeconds < day) {
      return `${Math.floor(diffSeconds / hour)}時間前`;
    }

    if (diffSeconds < month) {
      return `${Math.floor(diffSeconds / day)}日前`;
    }

    if (diffSeconds < year) {
      return `${Math.floor(diffSeconds / month)}か月前`;
    }

    return `${Math.floor(diffSeconds / year)}年前`;
  }

  function renderEmpty(container) {
    container.innerHTML = `
      <div class="new-moments-empty">
        <p>まだ思い出は投稿されていません。あなたが最初の思い出を残してみませんか？</p>
      </div>
    `;
  }

  function renderMoment(item) {
    const { liveName, context } = momentDetails(item);
    const quote = excerpt(item.memoryText || item.searchFields?.comment?.[0] || "");
    const postedAt = item.createdAt || item.updatedAt;
    const time = relativeTime(postedAt);

    return `
      <a class="new-moment-card" href="${escapeHtml(item.href)}">
        <span class="new-moment-icon" aria-hidden="true">💬</span>
        <p class="new-moment-quote">「${escapeHtml(quote)}」</p>
        <div class="new-moment-meta">
          <p class="new-moment-live">${escapeHtml(liveName)}</p>
          <p>
            <span class="new-moment-label">【${escapeHtml(pageTypeLabel(item))}】</span>
            ${context ? `<span class="new-moment-context">${escapeHtml(context)}</span>` : ""}
          </p>
          ${time ? `<time datetime="${escapeHtml(postedAt)}">${escapeHtml(time)}</time>` : ""}
        </div>
      </a>
    `;
  }

  async function initNewMoments() {
    const container = document.getElementById("new-moments");

    if (!container) {
      return;
    }

    try {
      const items = window.CommentData
        ? await window.CommentData.loadSupabaseMemoryItems()
        : [];
      const latest = items
        .filter(item => item.href && (item.createdAt || item.updatedAt) && (item.memoryText || item.searchFields?.comment?.length))
        .sort((a, b) => new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt))
        .slice(0, MAX_NEW_MOMENTS);

      if (!latest.length) {
        renderEmpty(container);
        return;
      }

      container.innerHTML = latest.map(renderMoment).join("");
    } catch (error) {
      renderEmpty(container);
    }
  }

  window.initNewMoments = initNewMoments;
})();
