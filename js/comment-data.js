(function () {
  const AUTHOR_TOKEN_KEY = "vvvvvv-comment-prototype:author-token";

  let supabaseItemsCache = null;
  let ownSupabaseItemsCache = null;
  let liveCache = new Map();

  const PAGE_TYPE_LABELS = {
    general: "総合",
    schedule: "公演日程",
    video: "映像・円盤",
    goods: "グッズ"
  };

  function backendConfig() {
    return window.VVVVVV_COMMENT_BACKEND || {};
  }

  function enabled() {
    const config = backendConfig();
    return Boolean(config.enabled && config.supabaseUrl && config.supabaseAnonKey);
  }

  function baseUrl() {
    return backendConfig().supabaseUrl.replace(/\/$/, "");
  }

  function storedAuthorToken() {
    try {
      return localStorage.getItem(AUTHOR_TOKEN_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  async function supabaseRequest(path, { method = "GET", body = null, authorToken = "" } = {}) {
    const config = backendConfig();
    const headers = {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": "application/json"
    };

    if (authorToken) {
      headers["x-author-token"] = authorToken;
    }

    const response = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    if (!response.ok) {
      throw new Error(`Failed to load Supabase comments: ${response.status}`);
    }

    return response.json();
  }

  async function supabaseRpc(functionName, args = {}, options = {}) {
    return supabaseRequest(`/rest/v1/rpc/${functionName}`, {
      method: "POST",
      body: args,
      authorToken: options.authorToken || ""
    });
  }

  async function loadJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    return response.json();
  }

  async function loadLive(groupId, liveId) {
    const key = `${groupId}:${liveId}`;

    if (!liveCache.has(key)) {
      liveCache.set(key, loadJson(`data/lives/${groupId}/${liveId}.json`).catch(() => null));
    }

    return liveCache.get(key);
  }

  function normalizeMemoryId(pageKey) {
    const value = String(pageKey || "");

    if (value.startsWith("deleted:")) {
      return "";
    }

    if (value.startsWith("v6-groove-2021:")) {
      return value.slice("v6-groove-2021:".length);
    }

    return value;
  }

  function pageTypeFromMemoryId(memoryId) {
    const type = String(memoryId || "").split(":")[0];

    if (type === "section" || type === "song") return "general";
    if (type === "video-song") return "video";
    if (type === "goods") return "goods";
    if (["mc", "fanservice", "other"].includes(type)) return "schedule";
    return "general";
  }

  function hrefFromMemoryId(memoryId) {
    const parts = String(memoryId || "").split(":");
    const type = parts[0];
    const groupId = parts[1];
    const liveId = parts[2];

    if (!groupId || !liveId) return "";

    if (type === "section") {
      return `section.html?group=${groupId}&live=${liveId}&section=${parts[3] || "general"}#giscus-container`;
    }

    if (type === "song" || type === "video-song") {
      const setlistId = parts[3] || "main";
      const index = Number(String(parts[4] || "").replace("song-", ""));
      const order = Number(String(parts[5] || "").replace("order-", ""));
      const file = type === "video-song" ? "video-song.html" : "song.html";
      const songParam = Number.isFinite(index) ? `&song=${index}` : "";
      const orderParam = Number.isFinite(order) ? `&order=${order}` : "";
      return `${file}?group=${groupId}&live=${liveId}&setlist=${setlistId}${songParam}${orderParam}#giscus-container`;
    }

    if (["mc", "fanservice", "other"].includes(type)) {
      return `memory.html?group=${groupId}&live=${liveId}&performance=${parts[3]}&type=${type}#giscus-container`;
    }

    if (type === "goods") {
      return `goods.html?group=${groupId}&live=${liveId}&goods=${parts[3]}#giscus-container`;
    }

    return "";
  }

  function allSetlists(live) {
    const setlists = Array.isArray(live?.setlists) ? [...live.setlists] : [];

    if (live?.video?.setlist?.length) {
      setlists.push({ id: "video", songs: live.video.setlist });
    }

    return setlists;
  }

  function songContext(live, type, setlistId, songPart) {
    const index = Number(String(songPart || "").replace("song-", ""));
    const setlist = allSetlists(live).find(item => item.id === setlistId);
    const song = setlist?.songs?.[index];
    return song?.title || "";
  }

  function contextFromMemoryId(memoryId, live) {
    const parts = String(memoryId || "").split(":");
    const type = parts[0];

    if (type === "section") {
      return live?.sections?.find(section => section.id === parts[3])?.label || PAGE_TYPE_LABELS[pageTypeFromMemoryId(memoryId)];
    }

    if (type === "song" || type === "video-song") {
      return songContext(live, type, parts[3], parts[4]);
    }

    if (["mc", "fanservice", "other"].includes(type)) {
      const performance = live?.performances?.find(item => item.id === parts[3]);
      const typeLabel = type === "mc" ? "MC" : type === "fanservice" ? "ファンサ" : "その他";
      return [performance?.date, performance?.time, performance?.venue, typeLabel].filter(Boolean).join(" ");
    }

    if (type === "goods") {
      return live?.goods?.find(item => item.id === parts[3])?.name || "グッズ";
    }

    return "";
  }

  function memoryParts(memoryId) {
    return String(memoryId || "").split(":");
  }

  async function rowToMemoryItem(row) {
    const memoryId = normalizeMemoryId(row.page_key);

    if (!memoryId) return null;

    const parts = memoryParts(memoryId);
    const groupId = parts[1];
    const liveId = parts[2];
    const live = groupId && liveId ? await loadLive(groupId, liveId) : null;
    const pageType = pageTypeFromMemoryId(memoryId);
    const context = contextFromMemoryId(memoryId, live);
    const tags = Array.isArray(row.tags) ? row.tags : [];
    const memoryText = String(row.body || "").trim();
    const href = hrefFromMemoryId(memoryId);

    return {
      title: live?.title || "思い出",
      subtitle: [live?.title, context].filter(Boolean).join(" / "),
      href,
      memoryId,
      validTarget: Boolean(live && href),
      pageType,
      pageTypeLabel: PAGE_TYPE_LABELS[pageType],
      memoryText,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
      nickname: row.nickname || "",
      tags,
      isReply: Boolean(row.is_reply || row.parent_id),
      reactions: row.reactions || {},
      commentCount: 1,
      isMemoryResult: true,
      source: "supabase",
      searchFields: {
        comment: [memoryText],
        member: tags,
        live: [live?.title].filter(Boolean),
        song: pageType === "general" || pageType === "video" ? [context] : [],
        goods: pageType === "goods" ? [context] : [],
        venue: pageType === "schedule" ? [context] : []
      },
      searchText: [
        live?.title,
        context,
        PAGE_TYPE_LABELS[pageType],
        memoryText,
        ...tags
      ].filter(Boolean).join(" ")
    };
  }

  async function loadSupabaseMemoryItems() {
    if (!enabled()) return [];

    if (!supabaseItemsCache) {
      supabaseItemsCache = (async () => {
        try {
          const rows = await supabaseRpc("get_public_comments", {
            target_page_key: null
          });
          const items = await Promise.all(rows.map(rowToMemoryItem));
          return items.filter(item => item?.href && item.memoryText);
        } catch (error) {
          console.error(error);
          return [];
        }
      })();
    }

    return supabaseItemsCache;
  }

  async function loadOwnSupabaseMemoryItems() {
    if (!enabled()) return { items: [], hasAuthorToken: false };

    const authorToken = storedAuthorToken();

    if (!authorToken) {
      return { items: [], hasAuthorToken: false };
    }

    if (!ownSupabaseItemsCache) {
      ownSupabaseItemsCache = (async () => {
        const rows = await supabaseRpc("get_own_comments", {}, { authorToken });
        const items = await Promise.all(rows.map(rowToMemoryItem));
        return items.filter(item => item?.href && item.validTarget && item.memoryText);
      })();
    }

    return {
      items: await ownSupabaseItemsCache,
      hasAuthorToken: true
    };
  }

  function clearCache() {
    supabaseItemsCache = null;
    ownSupabaseItemsCache = null;
  }

  window.CommentData = {
    loadSupabaseMemoryItems,
    loadOwnSupabaseMemoryItems,
    hasStoredAuthorToken: () => Boolean(storedAuthorToken()),
    clearCache
  };
})();
