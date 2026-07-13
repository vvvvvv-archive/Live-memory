import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const siteName = "ｖｖｖｖｖｖ　LIVE MEMORY";
const description = "V6、20th Century、Coming Century、そして6人それぞれの活動に関する記憶を未来へ残すための非公式ファンアーカイブ";
const siteUrl = "https://vvvvvv-archive.github.io/Live-memory/";
const imageUrl = "https://vvvvvv-archive.github.io/Live-memory/assets/images/ogp.png";

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function metaBlock(title) {
  const safeTitle = escapeAttr(title || siteName);
  const safeDescription = escapeAttr(description);
  const safeSiteName = escapeAttr(siteName);
  return `  <meta name="description" content="${safeDescription}">
  <meta property="og:site_name" content="${safeSiteName}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${siteUrl}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:alt" content="${safeSiteName}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${imageUrl}">`;
}

for (const file of fs.readdirSync(root).filter(name => name.endsWith(".html"))) {
  const filePath = path.join(root, file);
  let html = fs.readFileSync(filePath, "utf8");
  html = html.replace(/\n\s*<meta name="description"[\s\S]*?<meta name="twitter:image" content="[^"]+">\n?/g, "\n");
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  const title = titleMatch ? titleMatch[1].trim() : siteName;
  const block = metaBlock(title);
  if (titleMatch) {
    html = html.replace(/(<title>[^<]*<\/title>)/, `$1\n${block}`);
  } else {
    html = html.replace("</head>", `${block}\n</head>`);
  }
  fs.writeFileSync(filePath, html, "utf8");
}
