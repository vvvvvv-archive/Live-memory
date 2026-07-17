(function () {
  const SITE_NAME = "ｖｖｖｖｖｖ　LIVE MEMORY";
  const DEFAULT_DESCRIPTION = "V6、20th Century、Coming Century、そして6人それぞれの活動に関する記憶を未来へ残すための非公式ファンアーカイブ";
  const DEFAULT_OGP_IMAGE = "https://vvvvvv-archive.github.io/Live-memory/assets/images/ogp.png";

  function setMeta(selector, attribute, value) {
    const element = document.head.querySelector(selector);
    if (element) {
      element.setAttribute(attribute, value);
    }
  }

  function setPageMeta({ title, description, url } = {}) {
    const pageTitle = title || document.title || SITE_NAME;
    const pageDescription = description || DEFAULT_DESCRIPTION;
    const pageUrl = url || location.href;

    setMeta('meta[name="description"]', "content", pageDescription);
    setMeta('meta[property="og:title"]', "content", pageTitle);
    setMeta('meta[property="og:description"]', "content", pageDescription);
    setMeta('meta[property="og:url"]', "content", pageUrl);
    setMeta('meta[property="og:image"]', "content", DEFAULT_OGP_IMAGE);
    setMeta('meta[name="twitter:title"]', "content", pageTitle);
    setMeta('meta[name="twitter:description"]', "content", pageDescription);
    setMeta('meta[name="twitter:image"]', "content", DEFAULT_OGP_IMAGE);
  }

  function setDocumentTitle(title) {
    document.title = title;
    setPageMeta({ title });
  }

  function enhanceFooter() {
    document.querySelectorAll("footer").forEach(footer => {
      if (footer.dataset.enhanced === "true") return;

      footer.dataset.enhanced = "true";
      footer.innerHTML = `
        <nav class="footer-links" aria-label="サイト情報">
          <a href="about.html">サイトの利用について</a>
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

    setDocumentTitle(`${safeTitle} | ${SITE_NAME}`);
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
    setPageMeta,
    setDocumentTitle,
    showPageError,
    handleError
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceFooter);
  } else {
    enhanceFooter();
  }
  setPageMeta();

  window.addEventListener("unhandledrejection", event => {
    event.preventDefault();
    handleError(event.reason);
  });
})();
