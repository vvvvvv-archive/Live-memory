(function () {
  const STORAGE_PREFIX = "vvvvvv-comment-prototype:";
  const AUTHOR_TOKEN_KEY = `${STORAGE_PREFIX}author-token`;
  const LAST_POST_KEY = `${STORAGE_PREFIX}last-post-at`;
  const REACTIONS = ["❤️", "😂", "😭", "🔥", "💯"];
  const MEMBER_TAGS = ["#坂本昌行", "#長野博", "#井ノ原快彦", "#森田剛", "#三宅健", "#岡田准一"];
  const MAX_BODY_LENGTH = 500;
  const MAX_NICKNAME_LENGTH = 24;
  const POST_COOLDOWN_MS = 15000;
  const URL_LIMIT = 1;
  const NG_WORDS = ["死ね", "殺す", "消えろ"];

  function nowIso() {
    return new Date().toISOString();
  }

  function storageKey(pageKey) {
    return `${STORAGE_PREFIX}${pageKey}`;
  }

  function getAuthorToken() {
    let token = localStorage.getItem(AUTHOR_TOKEN_KEY);

    if (!token) {
      token = window.crypto?.randomUUID ? window.crypto.randomUUID() : `author-${Date.now()}-${Math.random()}`;
      localStorage.setItem(AUTHOR_TOKEN_KEY, token);
    }

    return token;
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
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeBody(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();
  }

  function relativeTime(value) {
    const date = new Date(value);
    const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    const minute = 60;
    const hour = minute * 60;
    const day = hour * 24;

    if (diffSeconds < minute) return "たった今";
    if (diffSeconds < hour) return `${Math.floor(diffSeconds / minute)}分前`;
    if (diffSeconds < day) return `${Math.floor(diffSeconds / hour)}時間前`;
    return `${Math.floor(diffSeconds / day)}日前`;
  }

  function countUrls(text) {
    return (text.match(/https?:\/\/|www\./gi) || []).length;
  }

  function validatePost({ body, skipCooldown = false }) {
    const cleanBody = normalizeBody(body);

    if (!cleanBody) {
      return "コメント本文を入力してください。";
    }

    if (cleanBody.length > MAX_BODY_LENGTH) {
      return `${MAX_BODY_LENGTH}文字以内で入力してください。`;
    }

    if (countUrls(cleanBody) > URL_LIMIT) {
      return "URLは1件までにしてください。";
    }

    if (NG_WORDS.some(word => cleanBody.includes(word))) {
      return "投稿できない言葉が含まれています。";
    }

    if (!skipCooldown) {
      const lastPostAt = Number(localStorage.getItem(LAST_POST_KEY) || 0);
      if (Date.now() - lastPostAt < POST_COOLDOWN_MS) {
        return "短時間での連続投稿はできません。少し待ってから投稿してください。";
      }
    }

    return "";
  }

  function commentById(comments, id) {
    for (const comment of comments) {
      if (comment.id === id) return comment;
      const reply = (comment.replies || []).find(item => item.id === id);
      if (reply) return reply;
    }
    return null;
  }

  function removeComment(comments, id) {
    return comments
      .filter(comment => comment.id !== id)
      .map(comment => ({
        ...comment,
        replies: (comment.replies || []).filter(reply => reply.id !== id)
      }));
  }

  function reactionInfo(comment, emoji, authorToken) {
    const value = comment.reactions?.[emoji];

    if (Array.isArray(value)) {
      return {
        count: value.length,
        active: value.includes(authorToken)
      };
    }

    if (value && typeof value === "object") {
      return {
        count: Number(value.count || 0),
        active: Boolean(value.reacted)
      };
    }

    return { count: 0, active: false };
  }

  function renderReactionButtons(comment, authorToken) {
    return REACTIONS.map(emoji => {
      const reaction = reactionInfo(comment, emoji, authorToken);
      return `
        <button type="button" class="prototype-reaction${reaction.active ? " is-active" : ""}" data-action="react" data-id="${comment.id}" data-emoji="${emoji}">
          <span>${emoji}</span>
          <span>${reaction.count}</span>
        </button>
      `;
    }).join("");
  }

  function renderCommentTags(tags = []) {
    const validTags = tags.filter(Boolean);
    if (!validTags.length) return "";

    return `
      <div class="prototype-comment-tags" aria-label="メンバー名タグ">
        ${validTags.map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}
      </div>
    `;
  }

  function renderInlineMemberTagButtons(tags = []) {
    return MEMBER_TAGS.map(tag => {
      const selected = tags.includes(tag);
      return `
        <button type="button" class="prototype-member-tag${selected ? " is-selected" : ""}" data-inline-member-tag="${escapeHtml(tag)}" aria-pressed="${selected ? "true" : "false"}">
          ${escapeHtml(tag)}
        </button>
      `;
    }).join("");
  }

  function renderInlineForm(comment, mode) {
    const isEdit = mode === "edit";
    const body = isEdit ? comment.body : "";
    const tags = isEdit ? (comment.tags || []) : [];

    return `
      <form class="prototype-inline-form" data-inline-form data-inline-mode="${mode}" data-id="${comment.id}">
        <p class="prototype-inline-title">${isEdit ? "コメントを編集" : "返信を書く"}</p>
        <textarea name="body" maxlength="500" rows="4">${escapeHtml(body)}</textarea>
        <div class="prototype-member-tags prototype-inline-tags" aria-label="メンバー名タグ">
          <p>必要に応じてメンバー名タグを選択できます。</p>
          <div class="prototype-member-tag-list">
            ${renderInlineMemberTagButtons(tags)}
          </div>
        </div>
        <div class="prototype-comment-actions">
          <p class="prototype-comment-note">500文字まで。URLは1件まで。</p>
          <div class="prototype-inline-buttons">
            <button class="button" type="submit">${isEdit ? "保存する" : "返信する"}</button>
            <button type="button" class="prototype-inline-cancel" data-action="cancel-inline">キャンセル</button>
          </div>
        </div>
      </form>
    `;
  }

  function commentDomId(commentId) {
    return `comment-${commentId}`;
  }

  function targetCommentIdFromLocation() {
    const params = new URLSearchParams(location.search);
    const queryComment = params.get("comment");

    if (queryComment) {
      return queryComment;
    }

    const hash = decodeURIComponent(String(location.hash || "").replace(/^#/, ""));
    return hash.startsWith("comment-") ? hash.slice("comment-".length) : "";
  }

  function findCommentElement(root, commentId) {
    if (!commentId) return null;

    return [...root.querySelectorAll("[data-comment-id]")]
      .find(element => element.dataset.commentId === commentId) || null;
  }

  function revealLinkedComment(root, behavior = "auto") {
    const targetId = targetCommentIdFromLocation();
    const target = findCommentElement(root, targetId);

    if (!target) {
      return;
    }

    window.setTimeout(() => {
      target.scrollIntoView({ block: "center", behavior });
      target.classList.add("is-comment-target");
      window.setTimeout(() => {
        target.classList.remove("is-comment-target");
      }, 3000);
    }, 0);
  }

  function renderComment(comment, authorToken, activeComposer, isReply = false) {
    const owned = comment.owned ?? comment.authorToken === authorToken;
    const activeMode = activeComposer?.id === comment.id ? activeComposer.mode : "";
    return `
      <article id="${escapeHtml(commentDomId(comment.id))}" class="prototype-comment${isReply ? " is-reply" : ""}" data-comment-id="${escapeHtml(comment.id)}">
        <div class="prototype-comment-header">
          <strong>${escapeHtml(comment.nickname || "名無しさん")}</strong>
          <time datetime="${escapeHtml(comment.createdAt)}">${escapeHtml(relativeTime(comment.createdAt))}</time>
        </div>
        <p class="prototype-comment-body">${escapeHtml(comment.body)}</p>
        ${renderCommentTags(comment.tags)}
        <div class="prototype-comment-toolbar">
          ${!isReply ? `<button type="button" data-action="reply" data-id="${comment.id}">返信</button>` : ""}
          ${owned ? `<button type="button" data-action="edit" data-id="${comment.id}">編集</button>` : ""}
          ${owned ? `<button type="button" data-action="delete" data-id="${comment.id}">削除</button>` : ""}
        </div>
        ${activeMode ? renderInlineForm(comment, activeMode) : ""}
        <div class="prototype-reactions">${renderReactionButtons(comment, authorToken)}</div>
        ${!isReply ? `<div class="prototype-replies">${(comment.replies || []).map(reply => renderComment(reply, authorToken, activeComposer, true)).join("")}</div>` : ""}
      </article>
    `;
  }

  function renderList(root, comments, authorToken, activeComposer = null) {
    const list = root.querySelector("[data-comment-list]");

    if (!comments.length) {
      list.innerHTML = `<div class="prototype-comment-empty">まだコメントはありません。最初の思い出を残してみませんか？</div>`;
      return;
    }

    list.innerHTML = comments.map(comment => renderComment(comment, authorToken, activeComposer)).join("");
    revealLinkedComment(root);
  }

  function renderMemberTagButtons() {
    return MEMBER_TAGS.map(tag => `
      <button type="button" class="prototype-member-tag" data-prototype-member-tag="${escapeHtml(tag)}" aria-pressed="false">
        ${escapeHtml(tag)}
      </button>
    `).join("");
  }

  function newComment({ nickname, body, authorToken, parentId = null, tags = [] }) {
    return {
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `comment-${Date.now()}-${Math.random()}`,
      parentId,
      nickname: normalizeText(nickname).slice(0, MAX_NICKNAME_LENGTH) || "名無しさん",
      body: normalizeBody(body),
      tags,
      authorToken,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      reactions: {},
      replies: []
    };
  }

  function getBackendConfig() {
    return window.VVVVVV_COMMENT_BACKEND || {};
  }

  function remoteEnabled() {
    const config = getBackendConfig();
    return Boolean(
      config.enabled
      && config.provider === "supabase"
      && config.supabaseUrl
      && config.supabaseAnonKey
    );
  }

  function supabaseBaseUrl() {
    return getBackendConfig().supabaseUrl.replace(/\/$/, "");
  }

  async function supabaseRequest(path, { method = "GET", body = null, authorToken = "" } = {}) {
    const config = getBackendConfig();
    const response = await fetch(`${supabaseBaseUrl()}${path}`, {
      method,
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        "x-author-token": authorToken
      },
      body: body ? JSON.stringify(body) : null
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Supabase request failed: ${response.status}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  async function supabaseRpc(functionName, args = {}, { authorToken = "" } = {}) {
    return supabaseRequest(`/rest/v1/rpc/${functionName}`, {
      method: "POST",
      authorToken,
      body: args
    });
  }

  function loadLocalComments(pageKey) {
    try {
      return JSON.parse(localStorage.getItem(storageKey(pageKey)) || "[]");
    } catch (error) {
      return [];
    }
  }

  function saveLocalComments(pageKey, comments) {
    localStorage.setItem(storageKey(pageKey), JSON.stringify(comments));
  }

  function rowToComment(row) {
    return {
      id: row.id,
      parentId: row.parent_id,
      nickname: row.nickname,
      body: row.body,
      tags: row.tags || [],
      owned: Boolean(row.owned),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      reactions: row.reactions || {},
      replies: []
    };
  }

  function buildCommentTree(rows) {
    const comments = rows.map(rowToComment);
    const byId = new Map(comments.map(comment => [comment.id, comment]));
    const topLevel = [];

    comments.forEach(comment => {
      if (comment.parentId && byId.has(comment.parentId)) {
        byId.get(comment.parentId).replies.push(comment);
      } else if (!comment.parentId) {
        topLevel.push(comment);
      }
    });

    topLevel.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    topLevel.forEach(comment => {
      comment.replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    });
    return topLevel;
  }

  async function loadRemoteComments(pageKey) {
    const rows = await supabaseRpc("get_public_comments", {
      target_page_key: pageKey
    }, { authorToken: getAuthorToken() });
    return buildCommentTree(rows || []);
  }

  async function createRemoteComment(pageKey, comment) {
    return supabaseRpc("create_public_comment", {
      target_page_key: pageKey,
      target_parent_id: comment.parentId,
      input_nickname: comment.nickname,
      input_body: comment.body,
      input_tags: comment.tags
    }, {
      authorToken: comment.authorToken
    });
  }

  async function updateRemoteComment(comment, body, tags, authorToken) {
    return supabaseRpc("update_own_comment", {
      target_comment_id: comment.id,
      input_body: normalizeBody(body),
      input_tags: tags || []
    }, {
      authorToken
    });
  }

  async function deleteRemoteComment(comment, authorToken) {
    return supabaseRpc("delete_own_comment", {
      target_comment_id: comment.id
    }, {
      authorToken
    });
  }

  async function toggleRemoteReaction(comment, emoji, authorToken) {
    return supabaseRpc("toggle_comment_reaction", {
      target_comment_id: comment.id,
      input_emoji: emoji
    }, {
      authorToken
    });
  }

  async function initPrototype(root) {
    const pageKey = root.dataset.pageKey || location.pathname;
    const authorToken = getAuthorToken();
    const form = root.querySelector("[data-comment-form]");
    const status = root.querySelector("[data-comment-status]");
    let comments = [];
    let activeComposer = null;

    function setStatus(message) {
      status.textContent = message || "";
    }

    async function refresh() {
      try {
        comments = remoteEnabled() ? await loadRemoteComments(pageKey) : loadLocalComments(pageKey);
        renderList(root, comments, authorToken, activeComposer);
      } catch (error) {
        console.error(error);
        setStatus("コメントの読み込みに失敗しました。時間をおいて再度お試しください。");
        comments = remoteEnabled() ? [] : loadLocalComments(pageKey);
        renderList(root, comments, authorToken, activeComposer);
      }
    }

    function persistLocal() {
      saveLocalComments(pageKey, comments);
      renderList(root, comments, authorToken, activeComposer);
    }

    async function persistRemoteOrLocal() {
      if (remoteEnabled()) {
        await refresh();
        return;
      }
      persistLocal();
    }

    function selectedTags() {
      return [...root.querySelectorAll("[data-comment-form] .prototype-member-tag.is-selected")]
        .map(button => button.dataset.prototypeMemberTag)
        .filter(Boolean);
    }

    function inlineSelectedTags(inlineForm) {
      return [...inlineForm.querySelectorAll("[data-inline-member-tag].is-selected")]
        .map(button => button.dataset.inlineMemberTag)
        .filter(Boolean);
    }

    function clearSelectedTags() {
      root.querySelectorAll("[data-comment-form] .prototype-member-tag.is-selected").forEach(button => {
        button.classList.remove("is-selected");
        button.setAttribute("aria-pressed", "false");
      });
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const formData = new FormData(form);
      const body = formData.get("body");
      const error = validatePost({ body });

      if (error) {
        setStatus(error);
        return;
      }

      const comment = newComment({
        nickname: formData.get("nickname"),
        body,
        authorToken,
        tags: selectedTags()
      });

      try {
        if (remoteEnabled()) {
          await createRemoteComment(pageKey, comment);
        } else {
          comments.unshift(comment);
        }
        localStorage.setItem(LAST_POST_KEY, String(Date.now()));
        form.reset();
        clearSelectedTags();
        activeComposer = null;
        setStatus("投稿しました。");
        await persistRemoteOrLocal();
      } catch (error) {
        console.error(error);
        setStatus("投稿に失敗しました。少し待ってからもう一度お試しください。");
      }
    });

    root.addEventListener("submit", async event => {
      const inlineForm = event.target.closest("[data-inline-form]");
      if (!inlineForm) return;

      event.preventDefault();
      event.stopPropagation();

      const action = inlineForm.dataset.inlineMode;
      const id = inlineForm.dataset.id;
      const target = commentById(comments, id);

      if (!target) {
        setStatus("対象のコメントが見つかりませんでした。");
        return;
      }

      const formData = new FormData(inlineForm);
      const body = formData.get("body");
      const error = validatePost({ body, skipCooldown: action === "edit" });

      if (error) {
        setStatus(error);
        return;
      }

      try {
        if (action === "reply") {
          const reply = newComment({
            nickname: "名無しさん",
            body,
            authorToken,
            parentId: target.id,
            tags: inlineSelectedTags(inlineForm)
          });

          if (remoteEnabled()) {
            await createRemoteComment(pageKey, reply);
            localStorage.setItem(LAST_POST_KEY, String(Date.now()));
            activeComposer = null;
            setStatus("返信しました。");
            await refresh();
            return;
          }

          target.replies ||= [];
          target.replies.push(reply);
          localStorage.setItem(LAST_POST_KEY, String(Date.now()));
          activeComposer = null;
          setStatus("返信しました。");
          persistLocal();
          return;
        }

        if (action === "edit" && (target.owned || target.authorToken === authorToken)) {
          const tags = inlineSelectedTags(inlineForm);

          if (remoteEnabled()) {
            const updated = await updateRemoteComment(target, body, tags, authorToken);
            activeComposer = updated ? null : activeComposer;
            setStatus(updated ? "編集しました。" : "編集できませんでした。投稿時と同じブラウザか確認してください。");
            await refresh();
            return;
          }

          target.body = normalizeBody(body);
          target.tags = tags;
          target.updatedAt = nowIso();
          activeComposer = null;
          setStatus("編集しました。");
          persistLocal();
          return;
        }

        setStatus("操作できませんでした。投稿時と同じブラウザか確認してください。");
      } catch (error) {
        console.error(error);
        setStatus("処理に失敗しました。少し待ってからもう一度お試しください。");
      }
    });

    root.addEventListener("click", async event => {
      const memberTagButton = event.target.closest("[data-prototype-member-tag]");
      if (memberTagButton) {
        event.preventDefault();
        event.stopPropagation();

        const isSelected = memberTagButton.classList.toggle("is-selected");
        memberTagButton.setAttribute("aria-pressed", String(isSelected));
        setStatus(
          isSelected
            ? `${memberTagButton.dataset.prototypeMemberTag} をタグに追加しました`
            : `${memberTagButton.dataset.prototypeMemberTag} をタグから外しました`
        );
        return;
      }

      const inlineTagButton = event.target.closest("[data-inline-member-tag]");
      if (inlineTagButton) {
        event.preventDefault();
        event.stopPropagation();

        const isSelected = inlineTagButton.classList.toggle("is-selected");
        inlineTagButton.setAttribute("aria-pressed", String(isSelected));
        return;
      }

      const button = event.target.closest("button[data-action]");
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      const action = button.dataset.action;

      if (action === "cancel-inline") {
        activeComposer = null;
        renderList(root, comments, authorToken, activeComposer);
        setStatus("");
        return;
      }

      const id = button.dataset.id;
      const target = commentById(comments, id);

      if (!target) {
        setStatus("対象のコメントが見つかりませんでした。");
        return;
      }

      try {
        if (action === "react") {
          const emoji = button.dataset.emoji;
          if (remoteEnabled()) {
            await toggleRemoteReaction(target, emoji, authorToken);
            await refresh();
            return;
          }

          target.reactions ||= {};
          target.reactions[emoji] ||= [];
          target.reactions[emoji] = target.reactions[emoji].includes(authorToken)
            ? target.reactions[emoji].filter(token => token !== authorToken)
            : [...target.reactions[emoji], authorToken];
          persistLocal();
          return;
        }

        if (action === "reply") {
          activeComposer = { mode: "reply", id: target.id };
          renderList(root, comments, authorToken, activeComposer);
          root.querySelector("[data-inline-form] textarea")?.focus();
          return;
        }

        if (action === "edit" && (target.owned || target.authorToken === authorToken)) {
          activeComposer = { mode: "edit", id: target.id };
          renderList(root, comments, authorToken, activeComposer);
          root.querySelector("[data-inline-form] textarea")?.focus();
          return;
        }

        if (action === "delete" && (target.owned || target.authorToken === authorToken)) {
          if (!window.confirm("このコメントを削除しますか？")) return;
          if (remoteEnabled()) {
            const deleted = await deleteRemoteComment(target, authorToken);
            activeComposer = null;
            setStatus(deleted ? "削除しました。" : "削除できませんでした。投稿時と同じブラウザか確認してください。");
            await refresh();
            return;
          }
          comments = removeComment(comments, id);
          activeComposer = null;
          setStatus("削除しました。");
          persistLocal();
          return;
        }

        setStatus("操作できませんでした。投稿時と同じブラウザか確認してください。");
      } catch (error) {
        console.error(error);
        setStatus("処理に失敗しました。少し待ってからもう一度お試しください。");
      }
    });

    await refresh();
  }

  function prototypeMarkup(pageKey) {
    return `
      <div class="prototype-comment-embed">
        <div class="prototype-comment-shell" data-comment-prototype data-page-key="${escapeHtml(pageKey)}">
          <form class="prototype-comment-form" data-comment-form>
            <label>
              <span>ニックネーム（任意）</span>
              <input type="text" name="nickname" maxlength="24" placeholder="名無しさん">
            </label>

            <label>
              <span>コメント本文</span>
              <textarea name="body" maxlength="500" rows="5" placeholder="思い出を自分の言葉で残してください"></textarea>
            </label>

            <div class="prototype-member-tags" aria-label="メンバー名タグ">
              <p>該当するメンバー名タグを選ぶと、投稿後にコメント下部へ別枠で表示されます。複数選択できます。</p>
              <div class="prototype-member-tag-list">
                ${renderMemberTagButtons()}
              </div>
            </div>

            <div class="prototype-comment-actions">
              <p class="prototype-comment-note">500文字まで。URLは1件まで。短時間の連投はできません。</p>
              <button class="button" type="submit">送信する</button>
            </div>
            <p class="prototype-comment-status" data-comment-status aria-live="polite"></p>
          </form>

          <div class="prototype-comment-after-form" data-comment-after-form></div>
          <div class="prototype-comment-list" data-comment-list></div>
        </div>
      </div>
    `;
  }

  function mountPrototype(container, options = {}) {
    if (!container || container.querySelector(".prototype-comment-embed")) {
      return null;
    }

    const pageKey = options.pageKey || location.pathname;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = prototypeMarkup(pageKey);
    const section = wrapper.firstElementChild;
    container.appendChild(section);
    const afterForm = section.querySelector("[data-comment-after-form]");
    (options.afterForm || []).forEach(element => {
      if (element) afterForm.appendChild(element);
    });
    initPrototype(section.querySelector("[data-comment-prototype]"));
    return section;
  }

  window.PrototypeComments = {
    mount: mountPrototype
  };

  document.querySelectorAll("[data-comment-prototype]").forEach(initPrototype);
})();
