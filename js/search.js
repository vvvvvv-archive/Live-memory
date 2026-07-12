(function () {
  let memoryResultsCache = null;

  const PAGE_TYPES = {
    general: "総合",
    schedule: "公演日程",
    video: "映像・円盤",
    goods: "グッズ",
    live: "ライブ",
    group: "グループ"
  };

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

  function stripInternalText(value, item = {}) {
    let text = String(value || "");
    const removals = [
      item.memoryId,
      item.href,
      item.sourceUrl
    ].filter(Boolean);

    removals.forEach(part => {
      text = text.split(part).join(" ");
    });

    return text
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\b(?:section|song|video-song|mc|fanservice|other|goods):[A-Za-z0-9:_\-.%]+/g, " ")
      .replace(/\b(?:identifier|discussionTerm|pathname)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function deriveMemoryText(item) {
    const text = item.memoryText || item.bodyText || item.commentText || "";
    return stripInternalText(text, item);
  }

  function searchableText(result) {
    return [
      result.title,
      result.subtitle,
      result.pageTypeLabel,
      PAGE_TYPES[result.pageType],
      result.memoryText,
      result.searchText
    ].filter(Boolean).join(" ");
  }

  function fieldValues(result, key) {
    const fields = result.searchFields || {};
    const value = fields[key];

    if (Array.isArray(value)) {
      return value.filter(Boolean);
    }

    return value ? [value] : [];
  }

  function textIncludes(values, word) {
    return values.some(value => normalizeText(value).includes(word));
  }

  function memberTagValues(result) {
    const source = [result.memoryText, result.searchText].filter(Boolean).join(" ");
    const memberNames = ["坂本昌行", "長野博", "井ノ原快彦", "森田剛", "三宅健", "岡田准一"];

    return memberNames
      .filter(name => source.includes(`#${name}`) || source.includes(`＃${name}`))
      .map(name => `#${name}`);
  }

  function matchBuckets(result) {
    const parts = splitSubtitle(result.subtitle);
    const isSongPage = String(result.href || "").includes("song.html")
      || String(result.href || "").includes("video-song.html")
      || String(result.memoryId || "").startsWith("song:")
      || String(result.memoryId || "").startsWith("video-song:");
    const isGoodsPage = result.pageType === "goods";
    const isLivePage = result.pageType === "live";
    const isSchedulePage = result.pageType === "schedule";

    return [
      {
        label: "コメント一致",
        score: 500,
        values: [result.memoryText, ...fieldValues(result, "comment")]
      },
      {
        label: "曲名一致",
        score: 360,
        values: [
          ...(isSongPage ? [result.title] : []),
          ...fieldValues(result, "song"),
          ...fieldValues(result, "artist")
        ]
      },
      {
        label: "グッズ名一致",
        score: 340,
        values: [
          ...(isGoodsPage ? [result.title] : []),
          ...fieldValues(result, "goods")
        ]
      },
      {
        label: "映像作品名一致",
        score: 330,
        values: [
          ...fieldValues(result, "media"),
          ...(result.pageType === "video" && !isSongPage ? [result.title, result.subtitle] : [])
        ]
      },
      {
        label: "ライブ名一致",
        score: 320,
        values: [
          ...(isLivePage ? [result.title] : []),
          ...(result.isMemoryResult && parts.length ? [parts[0]] : []),
          ...fieldValues(result, "live")
        ]
      },
      {
        label: "メンバー名タグ一致",
        score: 240,
        values: [
          ...memberTagValues(result),
          ...fieldValues(result, "member")
        ]
      },
      {
        label: "公演日一致",
        score: 80,
        values: [
          ...(isSchedulePage ? [result.title] : []),
          ...fieldValues(result, "date"),
          ...fieldValues(result, "time")
        ]
      },
      {
        label: "会場一致",
        score: 40,
        values: [
          ...(isSchedulePage ? [result.subtitle] : []),
          ...fieldValues(result, "venue"),
          ...fieldValues(result, "area")
        ]
      },
      {
        label: "その他一致",
        score: 5,
        values: [result.searchText]
      }
    ];
  }

  function scoreSearchResult(result, query) {
    const words = queryWords(query);

    if (!words.length || !matchesQuery(searchableText(result), query)) {
      return { matched: false, score: 0, label: "" };
    }

    const buckets = matchBuckets(result);
    let total = 0;
    let bestLabel = "";
    let bestScore = 0;

    words.forEach(word => {
      const bucket = buckets.find(item => textIncludes(item.values, word));

      if (!bucket) {
        return;
      }

      const venuePenalty = word.length === 1 && (bucket.label === "会場一致" || bucket.label === "公演日一致");
      const score = venuePenalty ? Math.floor(bucket.score * 0.25) : bucket.score;
      total += score;

      if (score > bestScore) {
        bestScore = score;
        bestLabel = bucket.label;
      }
    });

    return {
      matched: true,
      score: total,
      label: bestLabel || "その他一致"
    };
  }

  function rankedResults(results, query) {
    return uniqueResults(results)
      .map(result => ({
        ...result,
        matchInfo: scoreSearchResult(result, query)
      }))
      .filter(result => result.matchInfo.matched)
      .sort((a, b) => {
        if (b.matchInfo.score !== a.matchInfo.score) {
          return b.matchInfo.score - a.matchInfo.score;
        }

        return String(a.href || "").localeCompare(String(b.href || ""));
      });
  }

  function makeSnippet(text, query, maxLength = 96) {
    const source = String(text || "").replace(/\s+/g, " ").trim();

    if (!source) {
      return "";
    }

    const words = queryWords(query);
    const normalizedSource = normalizeText(source);
    const hitIndexes = words
      .map(word => ({
        word,
        index: normalizedSource.indexOf(word)
      }))
      .filter(hit => hit.index >= 0)
      .sort((a, b) => a.index - b.index);

    let start = 0;
    let end = maxLength;

    if (hitIndexes.length) {
      const firstHit = hitIndexes[0];
      const lastHit = hitIndexes[hitIndexes.length - 1];
      const desiredStart = Math.max(0, firstHit.index - 24);
      const desiredEnd = Math.min(source.length, lastHit.index + lastHit.word.length + 36);

      if (desiredEnd - desiredStart <= maxLength) {
        start = desiredStart;
        end = desiredEnd;
      } else {
        start = Math.max(0, firstHit.index - 28);
        end = start + maxLength;
      }
    }

    let snippet = source.slice(start, end);

    if (start > 0) {
      snippet = `…${snippet}`;
    }

    if (end < source.length) {
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

  function memoryParts(item) {
    return String(item.memoryId || "").split(":");
  }

  function pageTypeFromMemoryId(memoryId) {
    const type = String(memoryId || "").split(":")[0];

    if (type === "song" || type === "section") return "general";
    if (type === "video-song") return "video";
    if (["mc", "fanservice", "other"].includes(type)) return "schedule";
    if (type === "goods") return "goods";

    return "";
  }

  function pageTypeFromHref(href) {
    const value = String(href || "");

    if (value.includes("video-song.html") || value.includes("video.html")) return "video";
    if (value.includes("goods.html") || value.includes("section=goods")) return "goods";
    if (value.includes("memory.html") || value.includes("performance.html") || value.includes("section=schedule")) return "schedule";
    if (value.includes("song.html") || value.includes("section=general")) return "general";
    if (value.includes("live.html")) return "live";
    if (value.includes("group.html")) return "group";

    return "";
  }

  function pageTypeLabel(result) {
    const type = result.pageType || pageTypeFromMemoryId(result.memoryId) || pageTypeFromHref(result.href);
    return PAGE_TYPES[type] || result.pageTypeLabel || "思い出";
  }

  function splitSubtitle(subtitle) {
    return String(subtitle || "").split(" / ").filter(Boolean);
  }

  function renderResultText(result, query) {
    const parts = splitSubtitle(result.subtitle);
    const title = result.title || "";

    if (result.isMemoryResult && parts.length) {
      return `
        <h3>${highlightQuery(parts[0], query)}</h3>
        ${parts.slice(1).map(part => `<p class="search-result-context">${highlightQuery(part, query)}</p>`).join("")}
      `;
    }

    return `
      <h3>${highlightQuery(title || parts[0] || "", query)}</h3>
      ${parts.length ? `<p class="search-result-context">${highlightQuery(parts.join(" / "), query)}</p>` : ""}
    `;
  }

  function uniqueResults(results) {
    const byHref = new Map();

    results.forEach(result => {
      const key = result.href || `${result.title}:${result.subtitle}`;
      const existing = byHref.get(key);

      if (!existing) {
        byHref.set(key, result);
        return;
      }

      const existingText = existing.memoryText || "";
      const nextText = result.memoryText || "";
      const preferNext = (!existingText && nextText) || (result.isMemoryResult && !existing.isMemoryResult);

      if (preferNext) {
        byHref.set(key, {
          ...result,
          memoryText: [nextText, existingText].filter(Boolean).join(" ")
        });
      } else if (nextText && !existingText.includes(nextText)) {
        existing.memoryText = [existingText, nextText].filter(Boolean).join(" ");
        existing.searchText = [existing.searchText, result.searchText].filter(Boolean).join(" ");
      }
    });

    return Array.from(byHref.values());
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

    const matched = rankedResults(results, query);
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
          const snippet = makeSnippet(result.memoryText, query);

          return `
          <a class="archive-card search-result-card" href="${escapeHtml(result.href)}">
            <span class="search-result-type">【${escapeHtml(pageTypeLabel(result))}】</span>
            <span class="search-result-match">${escapeHtml(result.matchInfo.label)}</span>
            ${renderResultText(result, query)}
            ${snippet ? `<p class="search-result-excerpt">「${highlightQuery(snippet, query)}」</p>` : ""}
          </a>
        `;
        }).join("")}
      </div>
    `;
  }

  async function loadMemoryResults(filter = () => true) {
    if (!memoryResultsCache) {
      memoryResultsCache = window.CommentData
        ? await window.CommentData.loadSupabaseMemoryItems()
        : [];
    }

    return uniqueResults(memoryResultsCache
      .filter(item => item.href && filter(item))
      .map(item => {
        const memoryText = deriveMemoryText(item);
        const cleanSearchText = stripInternalText(item.searchText || "", item);
        const pageType = item.pageType || pageTypeFromMemoryId(item.memoryId);

        return {
          title: item.title || "記録された思い出",
          subtitle: item.subtitle || "思い出",
          href: item.href,
          memoryId: item.memoryId,
          pageType,
          pageTypeLabel: item.pageTypeLabel,
          memoryText,
          isMemoryResult: true,
          searchFields: item.searchFields,
          searchText: [
            item.title,
            item.subtitle,
            item.pageTypeLabel || PAGE_TYPES[pageType],
            cleanSearchText,
            memoryText
          ].filter(Boolean).join(" ")
        };
      }));
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
      return type === "video-song" || (type === "section" && parts[3] === "video");
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
