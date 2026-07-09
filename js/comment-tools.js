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
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function createMemberTagTools() {
  const tools = document.createElement("div");
  tools.className = "member-tag-tools";

  const buttons = V6_MEMBER_TAGS.map(member => {
    const tag = `#${member}`;
    return `<button type="button" class="member-tag-button" data-tag="${tag}">${tag}</button>`;
  }).join("");

  tools.innerHTML = `
    <h3>メンバー名タグ</h3>
    <p>必要に応じてタグをコピーし、コメント本文に貼り付けてください。複数入れても大丈夫です。</p>
    <div class="member-tag-list">${buttons}</div>
    <p class="member-tag-status" aria-live="polite"></p>
  `;

  const status = tools.querySelector(".member-tag-status");

  tools.querySelectorAll(".member-tag-button").forEach(button => {
    button.addEventListener("click", async () => {
      const tag = button.dataset.tag;

      try {
        await copyText(tag);
        status.textContent = `${tag} をコピーしました`;
      } catch (error) {
        status.textContent = `${tag} を選択してコピーしてください`;
      }
    });
  });

  return tools;
}
