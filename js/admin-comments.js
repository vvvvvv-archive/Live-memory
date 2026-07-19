(function () {
  const SESSION_KEY = "vvvvvv-admin-session";
  const PAGE_SIZE = 50;

  const state = {
    session: null,
    comments: [],
    offset: 0,
    hasMore: true,
    loading: false,
    contextCache: null
  };

  const els = {};

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

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function formatDateTime(value) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value));
    } catch (error) {
      return String(value);
    }
  }

  function loadStoredSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      state.session = saved?.access_token ? saved : null;
    } catch (error) {
      state.session = null;
    }
  }

  function saveSession(session) {
    const next = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Date.now() + Math.max(0, (session.expires_in || 3600) - 60) * 1000,
      user: session.user || null
    };
    state.session = next;
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  }

  function clearSession() {
    state.session = null;
    state.comments = [];
    state.offset = 0;
    state.hasMore = true;
    localStorage.removeItem(SESSION_KEY);
  }

  async function authRequest(path, { method = "POST", body = null, accessToken = "" } = {}) {
    const config = backendConfig();
    const headers = {
      apikey: config.supabaseAnonKey,
      "Content-Type": "application/json"
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const error = new Error(`Supabase Auth request failed: ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async function ensureSession() {
    if (!state.session?.access_token) return null;
    if (state.session.expires_at && Date.now() < state.session.expires_at) {
      return state.session;
    }
    if (!state.session.refresh_token) {
      clearSession();
      return null;
    }

    try {
      const refreshed = await authRequest("/auth/v1/token?grant_type=refresh_token", {
        body: { refresh_token: state.session.refresh_token }
      });
      saveSession(refreshed);
      return state.session;
    } catch (error) {
      console.error(error);
      clearSession();
      return null;
    }
  }

  async function signIn(email, password) {
    const session = await authRequest("/auth/v1/token?grant_type=password", {
      body: { email, password }
    });
    saveSession(session);
  }

  async function signOut() {
    const session = await ensureSession();
    try {
      if (session?.access_token) {
        await authRequest("/auth/v1/logout", {
          accessToken: session.access_token
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      clearSession();
      showLoggedOut();
    }
  }

  async function adminRpc(functionName, args = {}) {
    const session = await ensureSession();
    if (!session?.access_token) {
      throw new Error("Admin session is not available.");
    }

    const config = backendConfig();
    const response = await fetch(`${baseUrl()}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(args)
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const error = new Error(`Admin RPC failed: ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async function loadJson(path) {
    const response = await fetch(`../${path}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${path}`);
    }
    return response.json();
  }

  async function loadContextRegistry() {
    if (state.contextCache) return state.contextCache;

    try {
      const [groups, members, entries] = await Promise.all([
        loadJson("data/groups.json"),
        loadJson("data/members.json"),
        loadJson("data/lives/index.json")
      ]);
      const groupById = new Map(groups.map(group => [group.id, group]));
      const memberById = new Map(members.map(member => [member.id, member]));
      const liveByKey = new Map();

      await Promise.all(entries.map(async entry => {
        const livePath = entry.path || `data/lives/${entry.groupId}/${entry.liveId}.json`;
        const live = await loadJson(livePath);
        const groupId = entry.groupId || live.groupId;
        const group = groupById.get(groupId);
        const member = live.memberId ? memberById.get(live.memberId) : null;
        liveByKey.set(`${groupId}:${live.id}`, { group, member, live });
      }));

      state.contextCache = { groupById, memberById, liveByKey, available: true };
    } catch (error) {
      console.warn("Admin context data could not be loaded. Comments will be shown with page_key fallback.", error);
      state.contextCache = {
        groupById: new Map(),
        memberById: new Map(),
        liveByKey: new Map(),
        available: false
      };
    }

    return state.contextCache;
  }

  function pageKeyParts(pageKey) {
    const value = String(pageKey || "");
    if (value.startsWith("v6-groove-2021:")) {
      return value.slice("v6-groove-2021:".length).split(":");
    }
    return value.split(":");
  }

  function prefixedSiteHref(href) {
    if (!href) return "";
    if (/^https?:\/\//.test(href)) return href;
    return `../${href.replace(/^\.\//, "")}`;
  }

  async function enrichComment(row) {
    const parts = pageKeyParts(row.page_key);
    const groupId = parts[1] || "";
    const liveId = parts[2] || "";
    const registry = await loadContextRegistry();
    const context = registry.liveByKey.get(`${groupId}:${liveId}`) || {};
    let memoryItem = null;
    try {
      memoryItem = window.CommentData?.rowToMemoryItem
        ? await window.CommentData.rowToMemoryItem(row)
        : null;
    } catch (error) {
      console.warn("Admin comment target could not be resolved.", error);
    }
    const groupName = context.member?.name || context.group?.name || groupId || "不明";
    const liveTitle = context.live?.title || memoryItem?.title || row.page_key || "投稿先不明";
    const tags = Array.isArray(row.tags) ? row.tags : [];

    return {
      id: row.id,
      pageKey: row.page_key || "",
      parentId: row.parent_id || "",
      nickname: row.nickname || "名無しさん",
      body: row.body || "",
      tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
      deletedAt: row.deleted_at || "",
      isReply: Boolean(row.is_reply || row.parent_id),
      parentNickname: row.parent_nickname || "",
      parentBody: row.parent_body || "",
      reactions: row.reactions || {},
      reactionTotal: Number(row.reaction_total || 0),
      groupName,
      groupFilterKey: context.member ? `member:${context.member.id}` : `group:${groupId}`,
      liveTitle,
      liveType: context.live?.type || "",
      targetLabel: memoryItem?.pageTypeLabel || "",
      targetDetail: memoryItem?.subtitle || row.page_key || liveTitle,
      href: row.deleted_at ? "" : prefixedSiteHref(memoryItem?.href || ""),
      edited: Boolean(row.updated_at && row.updated_at !== row.created_at)
    };
  }

  function showPanel(panel) {
    [els.loginPanel, els.deniedPanel, els.dashboard].forEach(item => {
      if (item) item.hidden = item !== panel;
    });
  }

  function setStatus(element, message, isError = false) {
    if (!element) return;
    element.textContent = message || "";
    element.hidden = !message;
    element.classList.toggle("is-error", Boolean(isError));
  }

  function showLoggedOut() {
    showPanel(els.loginPanel);
    els.list.innerHTML = "";
    setStatus(els.loginStatus, "");
  }

  function showDenied() {
    showPanel(els.deniedPanel);
    els.list.innerHTML = "";
  }

  function showDashboard() {
    showPanel(els.dashboard);
    const email = state.session?.user?.email || "";
    els.sessionLabel.textContent = email ? `${email} でログイン中です。` : "ログイン中です。";
  }

  function renderGroupOptions() {
    const current = els.groupFilter.value;
    const options = new Map();
    state.comments.forEach(comment => {
      if (comment.groupFilterKey && comment.groupName) {
        options.set(comment.groupFilterKey, comment.groupName);
      }
    });

    els.groupFilter.innerHTML = `<option value="">すべて</option>${[...options.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "ja"))
      .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
      .join("")}`;
    if (options.has(current)) {
      els.groupFilter.value = current;
    }
  }

  function filteredComments() {
    const bodyQuery = normalizeText(els.bodyFilter.value);
    const nicknameQuery = normalizeText(els.nicknameFilter.value);
    const groupValue = els.groupFilter.value;
    const replyValue = els.replyFilter.value;

    return state.comments.filter(comment => {
      if (bodyQuery && !normalizeText(comment.body).includes(bodyQuery)) return false;
      if (nicknameQuery && !normalizeText(comment.nickname).includes(nicknameQuery)) return false;
      if (groupValue && comment.groupFilterKey !== groupValue) return false;
      if (replyValue === "comment" && comment.isReply) return false;
      if (replyValue === "reply" && !comment.isReply) return false;
      return true;
    });
  }

  function reactionLabel(comment) {
    const entries = Object.entries(comment.reactions || {})
      .map(([emoji, value]) => `${emoji} ${Number(value?.count || 0)}`)
      .filter(text => !text.endsWith(" 0"));
    return entries.length ? entries.join(" / ") : "リアクションなし";
  }

  function renderCommentCard(comment) {
    const tagHtml = comment.tags.length
      ? `<div class="admin-tag-list">${comment.tags.map(tag => `<span class="admin-chip">${escapeHtml(tag)}</span>`).join("")}</div>`
      : "";
    const parentHtml = comment.isReply
      ? `<div class="admin-comment-parent">返信先：${escapeHtml(comment.parentNickname || "親コメント")}<br>${escapeHtml(comment.parentBody || "親コメント本文は取得できません。")}</div>`
      : "";
    const deletedChip = comment.deletedAt ? `<span class="admin-chip is-danger">削除済み</span>` : "";
    const editedChip = comment.edited ? `<span class="admin-chip">編集済み</span>` : "";
    const replyChip = comment.isReply ? `<span class="admin-chip">返信</span>` : `<span class="admin-chip">通常コメント</span>`;
    const body = `
      <div class="admin-comment-meta">
        <time datetime="${escapeHtml(comment.createdAt)}">${escapeHtml(formatDateTime(comment.createdAt))}</time>
        ${replyChip}
        ${editedChip}
        ${deletedChip}
      </div>
      <div class="admin-comment-context">
        ${escapeHtml(comment.groupName)} / ${escapeHtml(comment.liveType)} / ${escapeHtml(comment.liveTitle)}<br>
        ${escapeHtml(comment.targetDetail)}
      </div>
      <p class="admin-comment-body">${escapeHtml(comment.body)}</p>
      ${parentHtml}
      ${tagHtml}
      <div class="admin-comment-meta">
        <span>${escapeHtml(reactionLabel(comment))}</span>
        <span>元ページで確認</span>
      </div>
      <div class="admin-comment-ids">
        comment_id: ${escapeHtml(comment.id)}<br>
        page_key: ${escapeHtml(comment.pageKey)}
      </div>
    `;

    if (comment.href) {
      return `<a class="admin-comment-card${comment.deletedAt ? " is-deleted" : ""}" href="${escapeHtml(comment.href)}">${body}</a>`;
    }

    return `<article class="admin-comment-card${comment.deletedAt ? " is-deleted" : ""}">${body}</article>`;
  }

  function renderComments() {
    const comments = filteredComments();
    els.loadedCount.textContent = `${state.comments.length}件読み込み済み`;
    els.visibleCount.textContent = `${comments.length}件表示中`;
    els.loadMore.hidden = !state.hasMore;
    els.loadMore.disabled = state.loading;

    if (!comments.length) {
      els.list.innerHTML = `<div class="admin-empty">表示できるコメントはありません。</div>`;
      return;
    }

    els.list.innerHTML = comments.map(renderCommentCard).join("");
  }

  async function verifyAdmin() {
    const result = await adminRpc("is_comment_admin", {});
    return result === true;
  }

  async function loadComments({ reset = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    setStatus(els.commentsStatus, reset ? "コメントを読み込んでいます。" : "追加で読み込んでいます。");
    els.loadMore.disabled = true;

    try {
      if (reset) {
        state.comments = [];
        state.offset = 0;
        state.hasMore = true;
      }

      const rows = await adminRpc("get_admin_comments", {
        result_limit: PAGE_SIZE,
        result_offset: state.offset
      });
      const enriched = await Promise.all((rows || []).map(enrichComment));
      state.comments.push(...enriched);
      state.offset += enriched.length;
      state.hasMore = enriched.length === PAGE_SIZE;
      renderGroupOptions();
      renderComments();
      setStatus(els.commentsStatus, "");
    } catch (error) {
      console.error(error);
      els.list.innerHTML = "";
      setStatus(els.commentsStatus, "コメントを取得できませんでした。", true);
    } finally {
      state.loading = false;
      renderComments();
    }
  }

  async function enterDashboard() {
    const session = await ensureSession();
    if (!session) {
      showLoggedOut();
      return;
    }

    try {
      const isAdmin = await verifyAdmin();
      if (!isAdmin) {
        showDenied();
        return;
      }
      showDashboard();
      await loadComments({ reset: true });
    } catch (error) {
      console.error(error);
      if (error.status === 401 || error.status === 403) {
        showDenied();
        return;
      }
      showDashboard();
      setStatus(els.commentsStatus, "コメントを取得できませんでした。", true);
    }
  }

  function bindEvents() {
    els.loginForm.addEventListener("submit", async event => {
      event.preventDefault();
      const form = new FormData(els.loginForm);
      const email = String(form.get("email") || "");
      const password = String(form.get("password") || "");
      const button = els.loginForm.querySelector("button");
      button.disabled = true;
      setStatus(els.loginStatus, "ログインしています。");

      try {
        await signIn(email, password);
        els.loginForm.reset();
        setStatus(els.loginStatus, "");
        await enterDashboard();
      } catch (error) {
        console.error(error);
        clearSession();
        setStatus(els.loginStatus, "ログインできませんでした。", true);
      } finally {
        button.disabled = false;
      }
    });

    els.logout.addEventListener("click", signOut);
    els.deniedLogout.addEventListener("click", signOut);
    els.loadMore.addEventListener("click", () => loadComments());
    [els.bodyFilter, els.nicknameFilter, els.groupFilter, els.replyFilter].forEach(element => {
      element.addEventListener("input", renderComments);
      element.addEventListener("change", renderComments);
    });
  }

  function collectElements() {
    els.loginPanel = document.getElementById("admin-login-panel");
    els.deniedPanel = document.getElementById("admin-denied-panel");
    els.dashboard = document.getElementById("admin-dashboard");
    els.loginForm = document.getElementById("admin-login-form");
    els.loginStatus = document.getElementById("admin-login-status");
    els.deniedLogout = document.getElementById("admin-denied-logout");
    els.logout = document.getElementById("admin-logout");
    els.sessionLabel = document.getElementById("admin-session-label");
    els.bodyFilter = document.getElementById("admin-filter-body");
    els.nicknameFilter = document.getElementById("admin-filter-nickname");
    els.groupFilter = document.getElementById("admin-filter-group");
    els.replyFilter = document.getElementById("admin-filter-reply");
    els.loadedCount = document.getElementById("admin-loaded-count");
    els.visibleCount = document.getElementById("admin-visible-count");
    els.commentsStatus = document.getElementById("admin-comments-status");
    els.list = document.getElementById("admin-comment-list");
    els.loadMore = document.getElementById("admin-load-more");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    collectElements();
    bindEvents();

    if (!enabled()) {
      showLoggedOut();
      setStatus(els.loginStatus, "コメント基盤が有効ではありません。", true);
      return;
    }

    loadStoredSession();
    await enterDashboard();
  });
})();
