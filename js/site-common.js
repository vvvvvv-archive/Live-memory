(function () {
  const SITE_NAME = "ｖｖｖｖｖｖ　LIVE MEMORY";

  function enhanceFooter() {
    document.querySelectorAll("footer").forEach(footer => {
      if (footer.dataset.enhanced === "true") return;

      footer.dataset.enhanced = "true";
      footer.innerHTML = `
        <nav class="footer-links" aria-label="サイト情報">
          <a href="about.html">このサイトについて</a>
          <a href="contact.html">お問い合わせ</a>
        </nav>
        <a href="index.html" class="footer-logo" aria-label="V6 LIVE MEMORY ホームへ戻る">${SITE_NAME}</a>
      `;
    });
  }

  function showPageError(title, message) {
    const main = document.querySelector("main") || document.body;
    const safeTitle = title || "ページを表示できませんでした";
    const safeMessage = message || "指定されたページ情報が見つからないか、読み込みに失敗しました。";

    document.title = `${safeTitle} | ${SITE_NAME}`;
    main.innerHTML = `
      <section class="lead-card error-card">
        <h1>${safeTitle}</h1>
        <p>${safeMessage}</p>
        <div class="error-actions">
          <a href="index.html">HOMEへ戻る</a>
          <a href="javascript:history.back()">前のページへ戻る</a>
        </div>
      </section>
    `;
  }

  function handleError(error) {
    console.error(error);
    showPageError(
      "ページを表示できませんでした",
      "URLの指定が正しくない、またはデータの読み込みに失敗した可能性があります。"
    );
  }

  window.SiteCommon = {
    enhanceFooter,
    showPageError,
    handleError
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceFooter);
  } else {
    enhanceFooter();
  }

  window.addEventListener("unhandledrejection", event => {
    event.preventDefault();
    handleError(event.reason);
  });
})();
