(function () {
  let memoryResultsCache = null;

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function matchesQuery(text, query) {
    const normalizedText = normalizeText(text);
    const words = normalizeText(query).split(" ").filter(Boolean);
    return words.every(word => normalizedText.includes(word));
  }

  function queryWords(query) {
    return normalizeText(query).split(" ").filter(Boolean);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function deriveMemoryText(item) {
    let text = item.memoryText || item.bodyText || item.commentText || "";

    if (!text && item.searchText) {
      text = item.searchText;

      [
        item.memoryId,
        item.title,
        item.subtitle,
        item.href,
        item.sourceUrl
      ].filter(Boolean).forEach(part => {
        text = text.split(part).join(" ");
      });
    }

    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function makeSnippet(text, query, maxLength = 82) {
    const source = String(text || "").replace(/\s+/g, " ").trim();

    if (!source) {
      return "";
    }

    const words = queryWords(query);
    const lowerSource = source.toLowerCase();
    const hitIndex = words
      .map(word => lowerSource.indexOf(word.toLowerCase()))
      .filter(index => index >= 0)
      .sort((a, b) => a - b)[0];

    let start = 0;

    if (hitIndex >= 0) {
      start = Math.max(0, hitIndex - 28);
    }

    let snippet = source.slice(start, start + maxLength);

    if (start > 0) {
      snippet = `…${snippet}`;
    }

    if (start + maxLength < source.length) {
      snippet = `${snippet}…`;
    }

    return snippet;
  }

  function highlightQuery(text, query) {
    const words = queryWords(query);
    let html = escapeHtml(text);

    words.forEach(word => {
      if (!word) return;
      const pattern = new RegExp(escapeRegExp(escapeHtml(word)), "gi");
      html = html.replace(pattern, match => `<mark class="search-highlight">${match}</mark>`);
    });

    return html;
  }

  function renderSubtitle(subtitle) {
    const parts = String(subtitle || "").split(" / ").filter(Boolean);

    if (parts.length <= 1) {
      return `<h3>${escapeHtml(subtitle)}</h3>`;
    }

    return `
      <h3>${escapeHtml(parts[0])}</h3>
      <p class="search-result-context">${parts.slice(1).map(escapeHtml).join(" / ")}</p>
    `;
  }

  function bindCardFilter(input, cards, options = {}) {
    const empty = options.emptyElement || null;

    function applyFilter() {
      const query = input.value;
      let visibleCount = 0;

      cards.forEach(card => {
        const isVisible = !query || matchesQuery(card.dataset.search || card.textContent, query);
        card.classList.toggle("is-hidden", !isVisible);
        if (isVisible) visibleCount += 1;
      });

      if (empty) {
        empty.hidden = !query || visibleCount !== 0;
      }
    }

    input.addEventListener("input", applyFilter);
    applyFilter();
  }

  function renderResults(container, results, query) {
    if (!query) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }

    const matched = results.filter(result => matchesQuery(result.searchText, query));
    container.hidden = false;

    if (matched.length === 0) {
      container.innerHTML = `
        <div class="section-heading">
          <h2>検索結果</h2>
          <p>一致する思い出の入口は見つかりませんでした。</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="section-heading">
        <h2>検索結果</h2>
        <p>${matched.length}件</p>
      </div>
      <div class="archive-grid search-result-grid">
        ${matched.map(result => {
          const snippet = makeSnippet(result.memoryText || result.searchText, query);

          return `
          <a class="archive-card search-result-card" href="${result.href}">
            ${renderSubtitle(result.subtitle)}
            ${snippet ? `<p class="search-result-excerpt">「${highlightQuery(snippet, query)}」</p>` : ""}
          </a>
        `;
        }).join("")}
      </div>
    `;
  }

  async function loadMemoryResults(filter = () => true) {
    if (!memoryResultsCache) {
      try {
        const response = await fetch("data/memories.json", { cache: "no-store" });
        memoryResultsCache = await response.json();
      } catch (error) {
        memoryResultsCache = [];
      }
    }

    return memoryResultsCache
      .filter(item => item.href && filter(item))
      .map(item => ({
        title: item.title || "記録された思い出",
        subtitle: item.subtitle || "思い出",
        href: item.href,
        memoryText: deriveMemoryText(item),
        searchText: item.searchText || ""
      }));
  }

  function memoryParts(item) {
    return String(item.memoryId || "").split(":");
  }

  function isMemoryInGroup(item, groupId) {
    return memoryParts(item)[1] === groupId;
  }

  function isMemoryInLive(item, groupId, liveId) {
    const parts = memoryParts(item);
    return parts[1] === groupId && parts[2] === liveId;
  }

  function isMemoryInSection(item, groupId, liveId, sectionId) {
    const parts = memoryParts(item);
    const type = parts[0];

    if (parts[1] !== groupId || parts[2] !== liveId) {
      return false;
    }

    if (sectionId === "general") {
      return type === "song" || (type === "section" && parts[3] === "general");
    }

    if (sectionId === "video") {
      return type === "song";
    }

    if (sectionId === "goods") {
      return type === "goods" || (type === "section" && parts[3] === "goods");
    }

    if (sectionId === "schedule") {
      return ["mc", "fanservice", "other"].includes(type);
    }

    return type === "section" && parts[3] === sectionId;
  }

  function isMemoryInPerformance(item, groupId, liveId, performanceId) {
    const parts = memoryParts(item);
    return ["mc", "fanservice", "other"].includes(parts[0])
      && parts[1] === groupId
      && parts[2] === liveId
      && parts[3] === performanceId;
  }

  window.MemorySearch = {
    bindCardFilter,
    renderResults,
    loadMemoryResults,
    isMemoryInGroup,
    isMemoryInLive,
    isMemoryInSection,
    isMemoryInPerformance
  };
})();
