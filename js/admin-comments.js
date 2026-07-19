(function () {
  const SESSION_KEY = "vvvvvv-admin-session";
  const PAGE_SIZE = 50;

  const state = {
    session: null,
    comments: [],
    offset: 0,
    hasMore: true,
    loading: false,
    contextCache: null,
    supportsStatusRpc: true
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

  function displayDateLabel(label, value) {
    return value ? `${label}：${formatDateTime(value)}` : "";
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

  async function adminRpcWithFallback(functionName, argVariants = []) {
    let lastError = null;

    for (const args of argVariants) {
      try {
        return await adminRpc(functionName, args);
      } catch (error) {
        lastError = error;
        const message = String(error?.data?.message || error?.message || "");
        if (!/PGRST202|Could not find the function|schema cache|parameter/i.test(message)) {
          throw error;
        }
      }
    }

    throw lastError || new Error(`Admin RPC failed: ${functionName}`);
  }

  function closeAdminModal(modal, previousOverflow, returnFocusTo, resolve, value) {
    document.body.style.overflow = previousOverflow;
    modal.remove();
    setTimeout(() => {
      if (returnFocusTo?.isConnected && !returnFocusTo.disabled) {
        returnFocusTo.focus({ preventScroll: true });
      }
    }, 0);
    resolve(value);
  }

  function bindModalKeyboard(modal, close) {
    return event => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(modal.querySelectorAll("button:not([disabled]), input:not([disabled]), a[href]"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
  }

  function confirmSoftDelete(comment, returnFocusTo) {
    return new Promise(resolve => {
      const previousOverflow = document.body.style.overflow;
      const modal = document.createElement("div");
      modal.className = "admin-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "admin-soft-delete-title");
      modal.innerHTML = `
        <div class="admin-dialog">
          <h2 id="admin-soft-delete-title">このコメントを非表示にしますか？</h2>
          <p>公開ページや検索結果から表示されなくなります。<br>管理者ページから再表示できます。</p>
          <div class="admin-dialog-summary">
            <strong>${escapeHtml(comment.nickname)}</strong><br>
            ${escapeHtml(comment.body.slice(0, 120))}
          </div>
          <div class="admin-dialog-actions">
            <button class="admin-button is-secondary" type="button" data-admin-cancel>キャンセル</button>
            <button class="admin-button" type="button" data-admin-confirm>非表示にする</button>
          </div>
        </div>
      `;
      let settled = false;
      const close = value => {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", onKeydown);
        closeAdminModal(modal, previousOverflow, returnFocusTo, resolve, value);
      };
      const onKeydown = bindModalKeyboard(modal, close);
      modal.addEventListener("click", event => {
        if (event.target === modal || event.target.closest("[data-admin-cancel]")) close(false);
        if (event.target.closest("[data-admin-confirm]")) close(true);
      });
      document.addEventListener("keydown", onKeydown);
      document.body.style.overflow = "hidden";
      document.body.appendChild(modal);
      modal.querySelector("[data-admin-cancel]")?.focus();
    });
  }

  function confirmHardDelete(comment, returnFocusTo) {
    return new Promise(resolve => {
      const previousOverflow = document.body.style.overflow;
      const modal = document.createElement("div");
      modal.className = "admin-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "admin-hard-delete-title");
      modal.innerHTML = `
        <div class="admin-dialog">
          <h2 id="admin-hard-delete-title">このコメントを完全に削除しますか？</h2>
          <p>データベースから削除され、元に戻せません。<br>関連する返信やリアクションも削除される場合があります。</p>
          <div class="admin-dialog-summary">
            ニックネーム：<strong>${escapeHtml(comment.nickname)}</strong><br>
            投稿日：${escapeHtml(formatDateTime(comment.createdAt))}<br>
            投稿先：${escapeHtml(comment.targetDetail)}<br>
            コメントID：${escapeHtml(comment.id)}<br>
            返信件数：${comment.childCount}件<br>
            リアクション数：${comment.reactionTotal}件<br>
            本文：${escapeHtml(comment.body.slice(0, 120))}
          </div>
          <p>確認のため「完全削除」と入力してください。</p>
          <input class="admin-confirm-input" type="text" autocomplete="off" data-hard-delete-input>
          <div class="admin-dialog-actions">
            <button class="admin-button is-secondary" type="button" data-admin-cancel>キャンセル</button>
            <button class="admin-button is-danger" type="button" data-admin-confirm disabled>完全削除する</button>
          </div>
        </div>
      `;
      let settled = false;
      const close = value => {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", onKeydown);
        closeAdminModal(modal, previousOverflow, returnFocusTo, resolve, value);
      };
      const onKeydown = bindModalKeyboard(modal, close);
      modal.addEventListener("input", event => {
        if (event.target.matches("[data-hard-delete-input]")) {
          const button = modal.querySelector("[data-admin-confirm]");
          button.disabled = event.target.value.trim() !== "完全削除";
        }
      });
      modal.addEventListener("keydown", event => {
        if (event.key === "Enter" && event.target.matches("[data-hard-delete-input]")) {
          event.preventDefault();
        }
      });
      modal.addEventListener("click", event => {
        if (event.target === modal || event.target.closest("[data-admin-cancel]")) close(false);
        const confirmButton = event.target.closest("[data-admin-confirm]");
        if (confirmButton && !confirmButton.disabled) close(true);
      });
      document.addEventListener("keydown", onKeydown);
      document.body.style.overflow = "hidden";
      document.body.appendChild(modal);
      modal.querySelector("[data-admin-cancel]")?.focus();
    });
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

  function siteRootUrl() {
    const path = window.location.pathname;
    const adminIndex = path.indexOf("/admin/");

    if (adminIndex >= 0) {
      return `${window.location.origin}${path.slice(0, adminIndex + 1)}`;
    }

    return new URL("../", window.location.href).href;
  }

  function prefixedSiteHref(href) {
    if (!href) return "";
    if (/^https?:\/\//.test(href)) return href;
    return new URL(href.replace(/^\.\//, ""), siteRootUrl()).href;
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
      childCount: Number(row.child_count || 0),
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
    const statusValue = els.statusFilter.value;

    const comments = state.comments.filter(comment => {
      if (bodyQuery && !normalizeText(comment.body).includes(bodyQuery)) return false;
      if (nicknameQuery && !normalizeText(comment.nickname).includes(nicknameQuery)) return false;
      if (groupValue && comment.groupFilterKey !== groupValue) return false;
      if (replyValue === "comment" && comment.isReply) return false;
      if (replyValue === "reply" && !comment.isReply) return false;
      if (statusValue === "visible" && comment.deletedAt) return false;
      if (statusValue === "hidden" && !comment.deletedAt) return false;
      return true;
    });

    if (statusValue === "hidden") {
      return [...comments].sort((a, b) => {
        const deletedDiff = new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0);
        if (deletedDiff) return deletedDiff;
        const createdDiff = new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        if (createdDiff) return createdDiff;
        return String(b.id).localeCompare(String(a.id));
      });
    }

    return comments;
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
    const statusChip = comment.deletedAt
      ? `<span class="admin-chip is-danger">非表示</span>`
      : `<span class="admin-chip is-visible">公開中</span>`;
    const editedChip = comment.edited ? `<span class="admin-chip">編集済み</span>` : "";
    const replyChip = comment.isReply ? `<span class="admin-chip">返信</span>` : `<span class="admin-chip">通常コメント</span>`;
    const dateLabels = [
      displayDateLabel("投稿日", comment.createdAt),
      comment.deletedAt ? displayDateLabel("非表示", comment.deletedAt) : ""
    ].filter(Boolean).join("<br>");
    const pageLink = comment.href
      ? `<a class="admin-text-link" href="${escapeHtml(comment.href)}">元ページで確認</a>`
      : "";
    const managementButtons = comment.deletedAt
      ? `
        <button class="admin-control-button" type="button" data-admin-action="restore" data-id="${escapeHtml(comment.id)}">再表示する</button>
        <button class="admin-control-button is-danger" type="button" data-admin-action="hard-delete" data-id="${escapeHtml(comment.id)}">完全削除</button>
      `
      : `
        <button class="admin-control-button" type="button" data-admin-action="soft-delete" data-id="${escapeHtml(comment.id)}">非表示にする</button>
        <button class="admin-control-button is-danger" type="button" data-admin-action="hard-delete" data-id="${escapeHtml(comment.id)}">完全削除</button>
      `;
    const body = `
      <div class="admin-comment-meta">
        <time datetime="${escapeHtml(comment.createdAt)}">${escapeHtml(formatDateTime(comment.createdAt))}</time>
        ${replyChip}
        ${editedChip}
        ${statusChip}
      </div>
      <div class="admin-comment-context">
        ${escapeHtml(comment.groupName)} / ${escapeHtml(comment.liveType)} / ${escapeHtml(comment.liveTitle)}<br>
        ${escapeHtml(comment.targetDetail)}
      </div>
      <div class="admin-comment-meta">${dateLabels}</div>
      <p class="admin-comment-body">${escapeHtml(comment.body)}</p>
      ${parentHtml}
      ${tagHtml}
      <div class="admin-comment-meta">
        <span>${escapeHtml(reactionLabel(comment))}</span>
        <span>返信 ${comment.childCount}件</span>
      </div>
      <div class="admin-comment-ids">
        comment_id: ${escapeHtml(comment.id)}<br>
        page_key: ${escapeHtml(comment.pageKey)}
      </div>
      <div class="admin-comment-controls">
        ${pageLink}
        ${managementButtons}
      </div>
    `;

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

  function findComment(commentId) {
    return state.comments.find(comment => comment.id === commentId) || null;
  }

  async function runAdminCommentAction(action, comment, button) {
    if (!comment || button.disabled) return;
    const previousText = button.textContent;
    button.disabled = true;
    button.textContent = "処理中";

    try {
      if (action === "soft-delete") {
        const confirmed = await confirmSoftDelete(comment, button);
        if (!confirmed) return;
        const ok = await adminRpc("admin_soft_delete_comment", { target_comment_id: comment.id });
        if (!ok) throw new Error("admin_soft_delete_comment returned false.");
        comment.deletedAt = new Date().toISOString();
        comment.updatedAt = comment.deletedAt;
        setStatus(els.commentsStatus, "コメントを非表示にしました。");
      }

      if (action === "restore") {
        const ok = await adminRpc("admin_restore_comment", { target_comment_id: comment.id });
        if (!ok) throw new Error("admin_restore_comment returned false.");
        comment.deletedAt = "";
        setStatus(els.commentsStatus, "コメントを再表示しました。");
      }

      if (action === "hard-delete") {
        const confirmed = await confirmHardDelete(comment, button);
        if (!confirmed) return;
        const ok = await adminRpcWithFallback("admin_hard_delete_comment", [
          { target_comment_id: comment.id },
          { comment_id: comment.id },
          { target_id: comment.id },
          { id: comment.id }
        ]);
        if (!ok) throw new Error("admin_hard_delete_comment returned false.");
        state.comments = state.comments.filter(item => item.id !== comment.id && item.parentId !== comment.id);
        setStatus(els.commentsStatus, "コメントを完全に削除しました。");
      }

      renderGroupOptions();
      renderComments();
    } catch (error) {
      if (action === "hard-delete") {
        console.error("Admin hard delete failed", {
          commentId: comment?.id || "",
          error
        });
      } else {
        console.error(error);
      }
      const message = action === "restore"
        ? "コメントを再表示できませんでした。"
        : action === "hard-delete"
          ? "コメントを完全削除できませんでした。"
          : "コメントを非表示にできませんでした。";
      setStatus(els.commentsStatus, message, true);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = previousText;
      }
    }
  }

  async function verifyAdmin() {
    const result = await adminRpc("is_comment_admin", {});
    return result === true;
  }

  async function fetchAdminComments() {
    const args = {
      result_limit: PAGE_SIZE,
      result_offset: state.offset
    };

    if (state.supportsStatusRpc) {
      args.status_filter = els.statusFilter.value || "all";
    }

    try {
      return await adminRpc("get_admin_comments", args);
    } catch (error) {
      const message = String(error?.data?.message || error?.message || "");
      if (state.supportsStatusRpc && /status_filter|get_admin_comments|Could not find|schema cache/i.test(message)) {
        state.supportsStatusRpc = false;
        console.warn("Admin status_filter RPC is not available yet. Falling back to the existing admin RPC.", error);
        return adminRpc("get_admin_comments", {
          result_limit: PAGE_SIZE,
          result_offset: state.offset
        });
      }
      throw error;
    }
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

      const rows = await fetchAdminComments();
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
    els.list.addEventListener("click", event => {
      const button = event.target.closest("[data-admin-action]");
      if (!button) return;
      event.preventDefault();
      const comment = findComment(button.dataset.id);
      runAdminCommentAction(button.dataset.adminAction, comment, button);
    });
    [els.bodyFilter, els.nicknameFilter, els.groupFilter, els.replyFilter].forEach(element => {
      element.addEventListener("input", renderComments);
      element.addEventListener("change", renderComments);
    });
    els.statusFilter.addEventListener("change", () => loadComments({ reset: true }));
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
    els.statusFilter = document.getElementById("admin-filter-status");
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
