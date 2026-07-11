(function () {
  let randomMemoryItems = [];
  let lastRandomHref = "";

  function commentText(item) {
    return String(item.memoryText || item.searchFields?.comment?.join(" ") || "").replace(/\s+/g, " ").trim();
  }

  function hasComment(item) {
    if (Number.isFinite(item.commentCount)) {
      return item.commentCount > 0;
    }

    return commentText(item).length > 0;
  }

  function targetHref(href) {
    if (!href || href.includes("#")) {
      return href;
    }

    return `${href}#giscus-container`;
  }

  function pickRandom(items) {
    if (items.length <= 1) {
      return items[0];
    }

    const candidates = items.filter(item => targetHref(item.href) !== lastRandomHref);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function setStatus(message) {
    const status = document.getElementById("random-memory-status");

    if (!status) {
      return;
    }

    status.textContent = message || "";
    status.hidden = !message;
  }

  async function initRandomMemory() {
    const button = document.getElementById("random-memory-button");

    if (!button) {
      return;
    }

    button.disabled = true;
    setStatus("");

    try {
      const response = await fetch("data/memories.json", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Failed to load memories");
      }

      const items = await response.json();
      randomMemoryItems = items.filter(item => item.href && hasComment(item));

      if (!randomMemoryItems.length) {
        button.disabled = true;
        setStatus("まだ思い出は投稿されていません。");
        return;
      }

      button.disabled = false;
      button.addEventListener("click", () => {
        const item = pickRandom(randomMemoryItems);

        if (!item) {
          return;
        }

        lastRandomHref = targetHref(item.href);
        window.location.href = lastRandomHref;
      });
    } catch (error) {
      button.disabled = true;
      setStatus("思い出を読み込めませんでした。時間をおいて再読み込みしてください。");
    }
  }

  window.initRandomMemory = initRandomMemory;
})();
