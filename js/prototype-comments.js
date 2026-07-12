(function () {
  const STORAGE_PREFIX = "vvvvvv-comment-prototype:";
  const AUTHOR_TOKEN_KEY = `${STORAGE_PREFIX}author-token`;
  const LAST_POST_KEY = `${STORAGE_PREFIX}last-post-at`;
  const REACTIONS = ["😊", "😍", "😭", "👏", "🔥"];
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

  function loadComments(pageKey) {
    try {
      return JSON.parse(localStorage.getItem(storageKey(pageKey)) || "[]");
    } catch (error) {
      return [];
    }
  }

  function saveComments(pageKey, comments) {
    localStorage.setItem(storageKey(pageKey), JSON.stringify(comments));
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

  function renderComment(comment, authorToken, isReply = false) {
    const owned = comment.authorToken === authorToken;
    return `
      <article class="prototype-comment${isReply ? " is-reply" : ""}" data-comment-id="${comment.id}">
        <div class="prototype-comment-header">
          <strong>${escapeHtml(comment.nickname || "名無しさん")}</strong>
          <time datetime="${escapeHtml(comment.createdAt)}">${escapeHtml(relativeTime(comment.createdAt))}</time>
        </div>
        <p class="prototype-comment-body">${escapeHtml(comment.body)}</p>
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

  function newComment({ nickname, body, authorToken, parentId = null }) {
    return {
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `comment-${Date.now()}-${Math.random()}`,
      parentId,
      nickname: normalizeText(nickname).slice(0, MAX_NICKNAME_LENGTH) || "名無しさん",
      body: normalizeText(body),
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

  function initPrototype(root) {
    const pageKey = root.dataset.pageKey || location.pathname;
    const authorToken = getAuthorToken();
    const form = root.querySelector("[data-comment-form]");
    const status = root.querySelector("[data-comment-status]");
    let comments = loadComments(pageKey);

    function setStatus(message) {
      status.textContent = message || "";
    }

    function persist() {
      saveComments(pageKey, comments);
      renderList(root, comments, authorToken);
    }

    form.addEventListener("submit", event => {
      event.preventDefault();
      const formData = new FormData(form);
      const body = formData.get("body");
      const error = validatePost({ body });

      if (error) {
        setStatus(error);
        return;
      }

      comments.unshift(newComment({
        nickname: formData.get("nickname"),
        body,
        authorToken
      }));
      localStorage.setItem(LAST_POST_KEY, String(Date.now()));
      form.reset();
      setStatus("投稿しました。");
      persist();
    });

    root.addEventListener("click", event => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const action = button.dataset.action;
      const id = button.dataset.id;
      const target = commentById(comments, id);

      if (!target) return;

      if (action === "react") {
        const emoji = button.dataset.emoji;
        target.reactions ||= {};
        target.reactions[emoji] ||= [];
        target.reactions[emoji] = target.reactions[emoji].includes(authorToken)
          ? target.reactions[emoji].filter(token => token !== authorToken)
          : [...target.reactions[emoji], authorToken];
        persist();
      }

      if (action === "reply") {
        const body = promptForText("返信を入力してください", "");
        if (body === null) return;
        const error = validatePost({ body });
        if (error) {
          setStatus(error);
          return;
        }
        target.replies ||= [];
        target.replies.push(newComment({ nickname: "名無しさん", body, authorToken, parentId: target.id }));
        localStorage.setItem(LAST_POST_KEY, String(Date.now()));
        setStatus("返信しました。");
        persist();
      }

      if (action === "edit" && target.authorToken === authorToken) {
        const body = promptForText("コメントを編集してください", target.body);
        if (body === null) return;
        const error = validatePost({ body, skipCooldown: true });
        if (error) {
          setStatus(error);
          return;
        }
        target.body = normalizeText(body);
        target.updatedAt = nowIso();
        setStatus("編集しました。");
        persist();
      }

      if (action === "delete" && target.authorToken === authorToken) {
        if (!window.confirm("このコメントを削除しますか？")) return;
        comments = removeComment(comments, id);
        setStatus("削除しました。");
        persist();
      }
    });

    renderList(root, comments, authorToken);
  }

  function prototypeMarkup(pageKey) {
    return `
      <section class="section-block prototype-comment-embed">
        <div class="section-heading">
          <h2>Prototype Comment</h2>
          <p>V6 2021ページ限定で試している、ログイン不要のコメント欄です。</p>
        </div>
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

            <div class="prototype-comment-actions">
              <p class="prototype-comment-note">500文字まで。URLは1件まで。短時間の連投はできません。</p>
              <button class="button" type="submit">送信する</button>
            </div>
            <p class="prototype-comment-status" data-comment-status aria-live="polite"></p>
          </form>

          <div class="prototype-comment-list" data-comment-list></div>
        </div>
      </section>
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
    initPrototype(section.querySelector("[data-comment-prototype]"));
    return section;
  }

  window.PrototypeComments = {
    mount: mountPrototype
  };

  document.querySelectorAll("[data-comment-prototype]").forEach(initPrototype);
})();
