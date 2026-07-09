import fs from "node:fs/promises";
import path from "node:path";

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY || "ibitsu10/V6-Live-memory";
const [owner, repo] = repository.split("/");

if (!token) {
  throw new Error("GITHUB_TOKEN is required.");
}

const liveCache = new Map();

async function graphql(query, variables = {}) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "V6-Live-memory"
    },
    body: JSON.stringify({ query, variables })
  });

  const body = await response.json();

  if (!response.ok || body.errors) {
    throw new Error(JSON.stringify(body.errors || body));
  }

  return body.data;
}

async function loadLive(groupId, liveId) {
  const key = `${groupId}:${liveId}`;

  if (!liveCache.has(key)) {
    const file = path.join("data", "lives", groupId, `${liveId}.json`);
    liveCache.set(key, JSON.parse(await fs.readFile(file, "utf8")));
  }

  return liveCache.get(key);
}

function stripMarkdown(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[>#*_~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function hrefForMemoryId(memoryId) {
  const parts = memoryId.split(":");
  const type = parts[0];

  if (type === "section") {
    const [, groupId, liveId, sectionId] = parts;
    return `section.html?group=${groupId}&live=${liveId}&section=${sectionId}`;
  }

  if (type === "song") {
    const groupId = parts[1];
    const liveId = parts[2];
    const isLegacySongId = parts.length >= 6;
    const setlistId = isLegacySongId ? parts[4] : parts[3];
    const songIndexOrOrder = isLegacySongId ? parts[5] : parts[4];
    const live = await loadLive(groupId, liveId);
    const setlist = live.setlists.find(item => item.id === setlistId);
    const songIndex = isLegacySongId
      ? setlist?.songs.findIndex(song => song.order === Number(songIndexOrOrder))
      : Number(songIndexOrOrder);
    const song = setlist?.songs[songIndex];
    const order = song?.order || "";
    return `song.html?group=${groupId}&live=${liveId}&setlist=${setlistId}&song=${songIndex}&order=${order}`;
  }

  if (["mc", "fanservice", "other"].includes(type)) {
    const [, groupId, liveId, performanceId] = parts;
    return `memory.html?group=${groupId}&live=${liveId}&performance=${performanceId}&type=${type}`;
  }

  if (type === "goods") {
    const [, groupId, liveId, goodsId] = parts;
    return `goods.html?group=${groupId}&live=${liveId}&goods=${goodsId}`;
  }

  return "";
}

async function subtitleForMemoryId(memoryId) {
  const parts = memoryId.split(":");
  const type = parts[0];

  if (type === "section") {
    const [, groupId, liveId, sectionId] = parts;
    const live = await loadLive(groupId, liveId);
    const section = live.sections.find(item => item.id === sectionId);
    return `${live.title} / ${section?.label || sectionId}`;
  }

  if (type === "song") {
    const groupId = parts[1];
    const liveId = parts[2];
    const isLegacySongId = parts.length >= 6;
    const setlistId = isLegacySongId ? parts[4] : parts[3];
    const songIndexOrOrder = isLegacySongId ? parts[5] : parts[4];
    const live = await loadLive(groupId, liveId);
    const setlist = live.setlists.find(item => item.id === setlistId);
    const songIndex = isLegacySongId
      ? setlist?.songs.findIndex(song => song.order === Number(songIndexOrOrder))
      : Number(songIndexOrOrder);
    const song = setlist?.songs[songIndex];
    return `${live.title} / ${song ? `${song.order}. ${song.title}` : "曲"}`;
  }

  if (["mc", "fanservice", "other"].includes(type)) {
    const labels = { mc: "MC", fanservice: "ファンサ", other: "その他" };
    const [, groupId, liveId, performanceId] = parts;
    const live = await loadLive(groupId, liveId);
    const performance = live.performances.find(item => item.id === performanceId);
    return `${live.title} / ${performance?.date || performanceId} ${performance?.time || ""} / ${labels[type]}`;
  }

  if (type === "goods") {
    const [, groupId, liveId, goodsId] = parts;
    const live = await loadLive(groupId, liveId);
    const goods = live.goods.find(item => item.id === goodsId);
    return `${live.title} / ${goods?.name || "グッズ"}`;
  }

  return "思い出";
}

async function toSearchItem(discussion) {
  const memoryId = discussion.title;
  const comments = discussion.comments.nodes.map(comment => stripMarkdown(comment.bodyText));
  const bodyText = stripMarkdown(discussion.bodyText);
  const memoryText = [bodyText, comments.join(" ")].join(" ").replace(/\s+/g, " ").trim();
  const subtitle = await subtitleForMemoryId(memoryId);
  const href = await hrefForMemoryId(memoryId);

  return {
    memoryId,
    title: "記録された思い出",
    subtitle,
    href,
    sourceUrl: discussion.url,
    updatedAt: discussion.updatedAt,
    memoryText,
    searchText: [
      memoryId,
      subtitle,
      memoryText
    ].join(" ")
  };
}

async function fetchDiscussions() {
  const items = [];
  let cursor = null;

  do {
    const data = await graphql(`
      query($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          discussions(first: 50, after: $cursor, orderBy: { field: UPDATED_AT, direction: DESC }) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              title
              bodyText
              url
              updatedAt
              category {
                name
              }
              comments(first: 100) {
                nodes {
                  bodyText
                }
              }
            }
          }
        }
      }
    `, { owner, repo, cursor });

    const discussions = data.repository.discussions;

    for (const discussion of discussions.nodes) {
      if (discussion.category?.name === "Memory") {
        items.push(await toSearchItem(discussion));
      }
    }

    cursor = discussions.pageInfo.hasNextPage ? discussions.pageInfo.endCursor : null;
  } while (cursor);

  return items;
}

const memories = await fetchDiscussions();
await fs.mkdir("data", { recursive: true });
await fs.writeFile("data/memories.json", `${JSON.stringify(memories, null, 2)}\n`);
console.log(`Wrote ${memories.length} memories.`);
