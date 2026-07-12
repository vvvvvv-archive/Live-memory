(function () {
  const STORAGE_PREFIX = "vvvvvv-comment-prototype:";
  const AUTHOR_TOKEN_KEY = `${STORAGE_PREFIX}author-token`;
  const LAST_POST_KEY = `${STORAGE_PREFIX}last-post-at`;
  const REACTIONS = ["😊", "😍", "😭", "👏", "🔥"];
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
    const cleanBody = normalizeText(body);

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

  function reactionCount(comment, emoji) {
    return (comment.reactions?.[emoji] || []).length;
  }

  function renderReactionButtons(comment, authorToken) {
    return REACTIONS.map(emoji => {
      const active = (comment.reactions?.[emoji] || []).includes(authorToken);
      return `
        <button type="button" class="prototype-reaction${active ? " is-active" : ""}" data-action="react" data-id="${comment.id}" data-emoji="${emoji}">
          <span>${emoji}</span>
          <span>${reactionCount(comment, emoji)}</span>
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

  function renderComment(comment, authorToken, isReply = false) {
    const owned = comment.authorToken === authorToken;
    return `
      <article class="prototype-comment${isReply ? " is-reply" : ""}" data-comment-id="${comment.id}">
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
        <div class="prototype-reactions">${renderReactionButtons(comment, authorToken)}</div>
        ${!isReply ? `<div class="prototype-replies">${(comment.replies || []).map(reply => renderComment(reply, authorToken, true)).join("")}</div>` : ""}
      </article>
    `;
  }

  function renderList(root, comments, authorToken) {
    const list = root.querySelector("[data-comment-list]");

    if (!comments.length) {
      list.innerHTML = `<div class="prototype-comment-empty">まだコメントはありません。最初の思い出を残してみませんか？</div>`;
      return;
    }

    list.innerHTML = comments.map(comment => renderComment(comment, authorToken)).join("");
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
      body: normalizeText(body),
      tags,
      authorToken,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      reactions: {},
      replies: []
    };
  }

  function promptForText(title, initialValue) {
    return window.prompt(title, initialValue);
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

  function rowToComment(row, reactionMap) {
    return {
      id: row.id,
      parentId: row.parent_id,
      nickname: row.nickname,
      body: row.body,
      tags: row.tags || [],
      authorToken: row.author_token,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      reactions: reactionMap[row.id] || {},
      replies: []
    };
  }

  function buildReactionMap(rows) {
    return rows.reduce((map, row) => {
      map[row.comment_id] ||= {};
      map[row.comment_id][row.emoji] ||= [];
      map[row.comment_id][row.emoji].push(row.author_token);
      return map;
    }, {});
  }

  function buildCommentTree(rows, reactionRows) {
    const reactionMap = buildReactionMap(reactionRows);
    const comments = rows.map(row => rowToComment(row, reactionMap));
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
    const encodedPageKey = encodeURIComponent(pageKey);
    const rows = await supabaseRequest(
      `/rest/v1/prototype_comments?page_key=eq.${encodedPageKey}&deleted_at=is.null&select=*&order=created_at.desc`
    );
    const ids = rows.map(row => row.id);
    const reactionRows = ids.length
      ? await supabaseRequest(`/rest/v1/prototype_comment_reactions?comment_id=in.(${ids.join(",")})&select=*`)
      : [];
    return buildCommentTree(rows, reactionRows);
  }

  async function createRemoteComment(pageKey, comment) {
    const rows = await supabaseRequest("/rest/v1/prototype_comments", {
      method: "POST",
      authorToken: comment.authorToken,
      body: {
        page_key: pageKey,
        parent_id: comment.parentId,
        nickname: comment.nickname,
        body: comment.body,
        tags: comment.tags,
        author_token: comment.authorToken
      }
    });
    return rows?.[0];
  }

  async function updateRemoteComment(comment, body, authorToken) {
    await supabaseRequest(`/rest/v1/prototype_comments?id=eq.${comment.id}&author_token=eq.${encodeURIComponent(authorToken)}`, {
      method: "PATCH",
      authorToken,
      body: {
        body: normalizeText(body),
        author_token: authorToken,
        updated_at: nowIso()
      }
    });
  }

  async function deleteRemoteComment(comment, authorToken) {
    await supabaseRequest(`/rest/v1/prototype_comments?id=eq.${comment.id}&author_token=eq.${encodeURIComponent(authorToken)}`, {
      method: "PATCH",
      authorToken,
      body: {
        page_key: `deleted:${comment.id}`,
        body: "削除済み",
        tags: [],
        author_token: authorToken,
        updated_at: nowIso()
      }
    });
  }

  async function toggleRemoteReaction(comment, emoji, authorToken) {
    const active = (comment.reactions?.[emoji] || []).includes(authorToken);

    if (active) {
      await supabaseRequest(
        `/rest/v1/prototype_comment_reactions?comment_id=eq.${comment.id}&emoji=eq.${encodeURIComponent(emoji)}&author_token=eq.${encodeURIComponent(authorToken)}`,
        { method: "DELETE", authorToken }
      );
      return;
    }

    await supabaseRequest("/rest/v1/prototype_comment_reactions", {
      method: "POST",
      authorToken,
      body: {
        comment_id: comment.id,
        emoji,
        author_token: authorToken
      }
    });
  }

  function backendLabel() {
    return remoteEnabled() ? "共有コメント試験中" : "端末内だけの試作中";
  }

  async function initPrototype(root) {
    const pageKey = root.dataset.pageKey || location.pathname;
    const authorToken = getAuthorToken();
    const form = root.querySelector("[data-comment-form]");
    const status = root.querySelector("[data-comment-status]");
    const mode = root.querySelector("[data-comment-mode]");
    let comments = [];

    function setStatus(message) {
      status.textContent = message || "";
    }

    function setMode() {
      if (mode) mode.textContent = backendLabel();
    }

    async function refresh() {
      try {
        comments = remoteEnabled() ? await loadRemoteComments(pageKey) : loadLocalComments(pageKey);
        renderList(root, comments, authorToken);
        setMode();
      } catch (error) {
        console.error(error);
        setStatus("共有コメントの読み込みに失敗しました。設定を確認してください。");
        if (mode) mode.textContent = "共有コメント未接続（端末内保存）";
        comments = loadLocalComments(pageKey);
        renderList(root, comments, authorToken);
      }
    }

    function persistLocal() {
      saveLocalComments(pageKey, comments);
      renderList(root, comments, authorToken);
    }

    async function persistRemoteOrLocal() {
      if (remoteEnabled()) {
        await refresh();
        return;
      }
      persistLocal();
    }

    function selectedTags() {
      return [...root.querySelectorAll(".prototype-member-tag.is-selected")]
        .map(button => button.dataset.prototypeMemberTag)
        .filter(Boolean);
    }

    function clearSelectedTags() {
      root.querySelectorAll(".prototype-member-tag.is-selected").forEach(button => {
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
        setStatus("投稿しました。");
        await persistRemoteOrLocal();
      } catch (error) {
        console.error(error);
        setStatus("投稿に失敗しました。少し待ってからもう一度お試しください。");
      }
    });

    root.addEventListener("click", async event => {
      const memberTagButton = event.target.closest("[data-prototype-member-tag]");
      if (memberTagButton) {
        const isSelected = memberTagButton.classList.toggle("is-selected");
        memberTagButton.setAttribute("aria-pressed", String(isSelected));
        setStatus(
          isSelected
            ? `${memberTagButton.dataset.prototypeMemberTag} をタグに追加しました`
            : `${memberTagButton.dataset.prototypeMemberTag} をタグから外しました`
        );
        return;
      }

      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const action = button.dataset.action;
      const id = button.dataset.id;
      const target = commentById(comments, id);

      if (!target) return;

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
        }

        if (action === "reply") {
          const body = promptForText("返信を入力してください", "");
          if (body === null) return;
          const error = validatePost({ body });
          if (error) {
            setStatus(error);
            return;
          }
          const reply = newComment({ nickname: "名無しさん", body, authorToken, parentId: target.id });
          if (remoteEnabled()) {
            await createRemoteComment(pageKey, reply);
            localStorage.setItem(LAST_POST_KEY, String(Date.now()));
            setStatus("返信しました。");
            await refresh();
            return;
          }
          target.replies ||= [];
          target.replies.push(reply);
          localStorage.setItem(LAST_POST_KEY, String(Date.now()));
          setStatus("返信しました。");
          persistLocal();
        }

        if (action === "edit" && target.authorToken === authorToken) {
          const body = promptForText("コメントを編集してください", target.body);
          if (body === null) return;
          const error = validatePost({ body, skipCooldown: true });
          if (error) {
            setStatus(error);
            return;
          }
          if (remoteEnabled()) {
            await updateRemoteComment(target, body, authorToken);
            setStatus("編集しました。");
            await refresh();
            return;
          }
          target.body = normalizeText(body);
          target.updatedAt = nowIso();
          setStatus("編集しました。");
          persistLocal();
        }

        if (action === "delete" && target.authorToken === authorToken) {
          if (!window.confirm("このコメントを削除しますか？")) return;
          if (remoteEnabled()) {
            await deleteRemoteComment(target, authorToken);
            setStatus("削除しました。");
            await refresh();
            return;
          }
          comments = removeComment(comments, id);
          setStatus("削除しました。");
          persistLocal();
        }
      } catch (error) {
        console.error(error);
        setStatus("処理に失敗しました。少し待ってからもう一度お試しください。");
      }
    });

    setMode();
    await refresh();
  }

  function prototypeMarkup(pageKey) {
    return `
      <div class="prototype-comment-embed">
        <div class="prototype-comment-shell" data-comment-prototype data-page-key="${escapeHtml(pageKey)}">
          <div class="prototype-comment-intro">
            <p>ログイン不要で気軽に思い出を残せます。</p>
            <p class="prototype-comment-mode" data-comment-mode></p>
          </div>
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
