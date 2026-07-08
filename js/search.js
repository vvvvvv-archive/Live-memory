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
      <div class="archive-grid">
        ${matched.map(result => `
          <a class="archive-card" href="${result.href}">
            <h3>${result.title}</h3>
            <p>${result.subtitle}</p>
          </a>
        `).join("")}
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
