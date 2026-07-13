const V6_MEMBER_TAGS = [
  "坂本昌行",
  "長野博",
  "井ノ原快彦",
  "森田剛",
  "三宅健",
  "岡田准一"
];

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Copy command failed");
  }
}

function createMemberTagTools() {
  const tools = document.createElement("div");
  tools.className = "member-tag-tools";

  const buttons = V6_MEMBER_TAGS.map(member => {
    const tag = `#${member}`;
    return `
      <button type="button" class="member-tag-button" data-tag="${tag}" aria-label="${tag}をコピー">
        <span class="member-tag-label">${tag}</span>
        <span class="member-tag-feedback" aria-hidden="true">コピーしました</span>
      </button>
    `;
  }).join("");

  tools.innerHTML = `
    <h3>メンバー名タグ</h3>
    <p>検索性向上のため、該当するメンバー名タグをコピーし、コメント本文に貼り付けてください。複数入れても大丈夫です。</p>
    <div class="member-tag-list">${buttons}</div>
    <p class="member-tag-status" aria-live="polite"></p>
  `;

  const status = tools.querySelector(".member-tag-status");
  let clearTimer = null;

  function clearFeedback() {
    tools.querySelectorAll(".member-tag-button").forEach(button => {
      button.classList.remove("is-copied", "is-copy-error");
      const feedback = button.querySelector(".member-tag-feedback");
      if (feedback) {
        feedback.textContent = "コピーしました";
      }
    });
    status.textContent = "";
  }

  tools.querySelectorAll(".member-tag-button").forEach(button => {
    button.addEventListener("click", async () => {
      const tag = button.dataset.tag;

      window.clearTimeout(clearTimer);
      clearFeedback();

      try {
        await copyText(tag);
        button.classList.add("is-copied");
        status.textContent = `${tag}をコピーしました`;
      } catch (error) {
        const feedback = button.querySelector(".member-tag-feedback");
        if (feedback) {
          feedback.textContent = "選択してコピー";
        }
        button.classList.add("is-copy-error");
        status.textContent = `${tag}を選択してコピーしてください`;
      }

      clearTimer = window.setTimeout(clearFeedback, 1800);
    });
  });

  return tools;
}

function createPostManagementLink() {
  const wrapper = document.createElement("div");
  wrapper.className = "post-management-link";
  wrapper.innerHTML = `
    <p>投稿の編集・削除は、投稿時と同じブラウザでのみ行えます。別の端末・別のブラウザでは編集・削除できません。ブラウザデータを削除した場合や、シークレット／プライベートブラウズで投稿した場合は、編集・削除できなくなることがあります。</p>
    <p><a href="contact.html">投稿の編集・削除について</a></p>
  `;
  return wrapper;
}

function appendPrototypeCommentsIfEnabled(container, groupId, liveId, memoryId, options = {}) {
  if (!window.PrototypeComments) {
    return;
  }

  const pageKey = groupId === "v6" && liveId === "v6-groove-2021"
    ? `v6-groove-2021:${memoryId}`
    : memoryId;

  window.PrototypeComments.mount(container, {
    pageKey,
    afterForm: options.afterForm || []
  });
}

function createArchivedGiscusElement(memoryId) {
  const giscus = document.createElement("script");

  giscus.src = "https://giscus.app/client.js";
  giscus.setAttribute("data-repo", "vvvvvv-archive/Live-memory");
  giscus.setAttribute("data-repo-id", "R_kgDOTPl_LQ");
  giscus.setAttribute("data-category", "Memory");
  giscus.setAttribute("data-category-id", "DIC_kwDOTPl_Lc4DAsjk");
  giscus.setAttribute("data-mapping", "specific");
  giscus.setAttribute("data-term", memoryId);
  giscus.setAttribute("data-strict", "0");
  giscus.setAttribute("data-reactions-enabled", "1");
  giscus.setAttribute("data-emit-metadata", "1");
  giscus.setAttribute("data-input-position", "bottom");
  giscus.setAttribute("data-theme", "light");
  giscus.setAttribute("data-lang", "ja");
  giscus.setAttribute("crossorigin", "anonymous");
  giscus.async = true;

  return giscus;
}
