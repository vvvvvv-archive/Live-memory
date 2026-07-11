import fs from "node:fs/promises";
import path from "node:path";

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY || "vvvvvv-archive/Live-memory";
const [owner, repo] = repository.split("/");

if (!token) {
  throw new Error("GITHUB_TOKEN is required.");
}

const liveCache = new Map();
let liveRegistryCache;
let groupsCache;

const MAX_GRAPHQL_ATTEMPTS = 4;
const GRAPHQL_RETRY_DELAYS_MS = [2000, 4000, 8000];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableGraphqlError(error, status) {
  if (status && [401, 403, 404].includes(status)) {
    return false;
  }

  if (status && status >= 500) {
    return true;
  }

  const message = String(error?.message || error || "");
  return /timeout|timed out|couldn't respond|try resubmitting|try again|temporarily|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed/i
    .test(message);
}

async function graphql(query, variables = {}) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_GRAPHQL_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "Live-memory"
        },
        body: JSON.stringify({ query, variables })
      });

      const body = await response.json().catch(() => ({}));
      const error = !response.ok || body.errors
        ? new Error(JSON.stringify(body.errors || body))
        : null;

      if (!error) {
        return body.data;
      }

      error.status = response.status;
      throw error;
    } catch (error) {
      lastError = error;

      if (attempt >= MAX_GRAPHQL_ATTEMPTS || !isRetryableGraphqlError(error, error.status)) {
        throw error;
      }

      const delay = GRAPHQL_RETRY_DELAYS_MS[attempt - 1];
      console.warn(`GitHub GraphQL request failed. Retry ${attempt}/${MAX_GRAPHQL_ATTEMPTS - 1} in ${delay / 1000}s: ${error.message}`);
      await sleep(delay);
    }
  }

  throw lastError;
}

async function loadLive(groupId, liveId) {
  const key = `${groupId}:${liveId}`;

  if (!liveCache.has(key)) {
    const registry = await loadLiveRegistry();
    const entry = registry.find(item => item.groupId === groupId && item.liveId === liveId);
    const file = entry?.path || path.join("data", "lives", groupId, `${liveId}.json`);
    liveCache.set(key, JSON.parse(await fs.readFile(file, "utf8")));
  }

  return liveCache.get(key);
}

async function loadLiveRegistry() {
  if (!liveRegistryCache) {
    liveRegistryCache = JSON.parse(await fs.readFile(path.join("data", "lives", "index.json"), "utf8"));
  }

  return liveRegistryCache;
}

async function loadGroups() {
  if (!groupsCache) {
    groupsCache = JSON.parse(await fs.readFile(path.join("data", "groups.json"), "utf8"));
  }

  return groupsCache;
}

async function groupNameForId(groupId) {
  const groups = await loadGroups();
  return groups.find(group => group.id === groupId)?.name || groupId;
}

function resolveSongFromMemoryParts(live, parts) {
  const type = parts[0];
  const isNewSongId = parts[4]?.startsWith("song-");
  const isLegacyPerformanceSongId = !isNewSongId && parts.length >= 6;
  const setlistId = isLegacyPerformanceSongId ? parts[4] : parts[3];
  const songIndexOrOrder = isLegacyPerformanceSongId ? parts[5] : parts[4];
  const setlist = type === "video-song" && setlistId === "video" && live.video?.setlist?.length
    ? { id: "video", songs: live.video.setlist }
    : live.setlists.find(item => item.id === setlistId);
  let songIndex = -1;

  if (isNewSongId) {
    songIndex = Number(parts[4].replace("song-", ""));
  } else if (isLegacyPerformanceSongId) {
    songIndex = setlist?.songs.findIndex(song => song.order === Number(songIndexOrOrder)) ?? -1;
  } else {
    songIndex = Number(songIndexOrOrder);
  }

  const song = setlist?.songs[songIndex];

  return {
    type,
    setlistId,
    songIndex,
    song
  };
}

function songMemoryKey(song, index) {
  const order = song && song.order !== undefined ? song.order : "unknown";
  const title = song && song.title ? song.title : "song";
  const slug = encodeURIComponent(title)
    .replace(/%/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 80);

  return `song-${index}:order-${order}:${slug}`;
}

function currentSongMemoryId(type, groupId, liveId, setlistId, song, index) {
  return `${type}:${groupId}:${liveId}:${setlistId}:${songMemoryKey(song, index)}`;
}

async function isCurrentMemoryId(memoryId) {
  const parts = memoryId.split(":");
  const type = parts[0];
  const groupId = parts[1];
  const liveId = parts[2];

  if (!groupId || !liveId) {
    return false;
  }

  const live = await loadLive(groupId, liveId).catch(() => null);

  if (!live) {
    return false;
  }

  if (type === "section") {
    const sectionId = parts[3];
    return ["general", "goods"].includes(sectionId);
  }

  if (type === "song" || type === "video-song") {
    const { setlistId, songIndex, song } = resolveSongFromMemoryParts(live, parts);

    if (!song || songIndex < 0) {
      return false;
    }

    return memoryId === currentSongMemoryId(type, groupId, liveId, setlistId, song, songIndex);
  }

  if (["mc", "fanservice", "other"].includes(type)) {
    const performanceId = parts[3];
    return live.performances.some(item => item.id === performanceId)
      && memoryId === `${type}:${groupId}:${liveId}:${performanceId}`;
  }

  if (type === "goods") {
    const goodsId = parts[3];
    return live.goods.some(item => item.id === goodsId)
      && memoryId === `goods:${groupId}:${liveId}:${goodsId}`;
  }

  return false;
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

function stripInternalText(value, memoryId = "") {
  return String(value || "")
    .replaceAll(memoryId, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b(?:section|song|video-song|mc|fanservice|other|goods):[A-Za-z0-9:_\-.%]+/g, " ")
    .replace(/\b(?:identifier|discussionTerm|pathname)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pageTypeForMemoryId(memoryId) {
  const type = memoryId.split(":")[0];

  if (type === "song" || type === "section") return { pageType: "general", pageTypeLabel: "総合" };
  if (type === "video-song") return { pageType: "video", pageTypeLabel: "映像・円盤" };
  if (["mc", "fanservice", "other"].includes(type)) return { pageType: "schedule", pageTypeLabel: "公演日程" };
  if (type === "goods") return { pageType: "goods", pageTypeLabel: "グッズ" };

  return { pageType: "", pageTypeLabel: "思い出" };
}

async function hrefForMemoryId(memoryId) {
  const parts = memoryId.split(":");
  const type = parts[0];

  if (type === "section") {
    const [, groupId, liveId, sectionId] = parts;
    if (sectionId === "video") {
      return `video.html?group=${groupId}&live=${liveId}`;
    }
    return `section.html?group=${groupId}&live=${liveId}&section=${sectionId}`;
  }

  if (type === "song" || type === "video-song") {
    const groupId = parts[1];
    const liveId = parts[2];
    const live = await loadLive(groupId, liveId);
    const { setlistId, songIndex, song } = resolveSongFromMemoryParts(live, parts);
    const order = song?.order || "";
    const page = type === "video-song" ? "video-song.html" : "song.html";
    return `${page}?group=${groupId}&live=${liveId}&setlist=${setlistId}&song=${songIndex}&order=${order}`;
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

  if (type === "song" || type === "video-song") {
    const groupId = parts[1];
    const liveId = parts[2];
    const live = await loadLive(groupId, liveId);
    const { song } = resolveSongFromMemoryParts(live, parts);
    if (type === "video-song") {
      return `${live.title} / 映像・円盤 / ${song ? `${song.order}. ${song.title}` : "曲"}`;
    }
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

async function searchFieldsForMemoryId(memoryId, groupName, memoryText, pageTypeLabel) {
  const parts = memoryId.split(":");
  const type = parts[0];
  const groupId = parts[1];
  const liveId = parts[2];
  const live = await loadLive(groupId, liveId);
  const base = {
    comment: [memoryText],
    group: [groupName],
    live: [live.title],
    year: [live.year],
    pageType: [pageTypeLabel, live.type]
  };

  if (type === "song" || type === "video-song") {
    const { song } = resolveSongFromMemoryParts(live, parts);
    return {
      ...base,
      song: [song?.title, song?.order],
      artist: [song?.artist],
      note: [song?.note]
    };
  }

  if (["mc", "fanservice", "other"].includes(type)) {
    const performance = live.performances.find(item => item.id === parts[3]);
    return {
      ...base,
      date: [performance?.date],
      time: [performance?.time],
      area: [performance?.area],
      venue: [performance?.venue],
      performanceType: [performance?.performanceType]
    };
  }

  if (type === "goods") {
    const goods = live.goods.find(item => item.id === parts[3]);
    return {
      ...base,
      goods: [goods?.name],
      price: [goods?.priceLabel, goods?.price ? `${goods.price}円` : ""]
    };
  }

  return base;
}

async function toSearchItem(discussion) {
  const memoryId = discussion.title;

  if (!await isCurrentMemoryId(memoryId)) {
    return null;
  }

  const [, groupId, liveId] = memoryId.split(":");
  const live = await loadLive(groupId, liveId);
  const groupName = await groupNameForId(groupId);
  const comments = discussion.comments.nodes.map(comment => stripMarkdown(comment.bodyText));
  const bodyText = stripInternalText(stripMarkdown(discussion.bodyText), memoryId);
  const commentText = stripInternalText(comments.join(" "), memoryId);
  const memoryText = (commentText || bodyText).replace(/\s+/g, " ").trim();
  const subtitle = await subtitleForMemoryId(memoryId);
  const href = await hrefForMemoryId(memoryId);
  const { pageType, pageTypeLabel } = pageTypeForMemoryId(memoryId);
  const searchFields = await searchFieldsForMemoryId(memoryId, groupName, memoryText, pageTypeLabel);

  return {
    memoryId,
    title: "記録された思い出",
    subtitle,
    href,
    pageType,
    pageTypeLabel,
    searchFields,
    sourceUrl: discussion.url,
    updatedAt: discussion.updatedAt,
    memoryText,
    searchText: [
      groupName,
      live.type,
      live.year,
      live.title,
      pageTypeLabel,
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
        const item = await toSearchItem(discussion);

        if (item) {
          items.push(item);
        }
      }
    }

    cursor = discussions.pageInfo.hasNextPage ? discussions.pageInfo.endCursor : null;
  } while (cursor);

  return items;
}

function dedupeSearchItems(items) {
  const byHref = new Map();

  items.forEach(item => {
    const existing = byHref.get(item.href);

    if (!existing) {
      byHref.set(item.href, item);
      return;
    }

    if (item.memoryText && !existing.memoryText.includes(item.memoryText)) {
      existing.memoryText = [existing.memoryText, item.memoryText].filter(Boolean).join(" ");
    }

    existing.searchFields = {
      ...(existing.searchFields || {}),
      comment: [existing.memoryText]
    };

    existing.searchText = [
      existing.pageTypeLabel,
      existing.subtitle,
      existing.memoryText
    ].filter(Boolean).join(" ");

    if (new Date(item.updatedAt) > new Date(existing.updatedAt)) {
      existing.updatedAt = item.updatedAt;
      existing.sourceUrl = item.sourceUrl;
    }
  });

  return Array.from(byHref.values());
}

const memories = dedupeSearchItems(await fetchDiscussions());
await fs.mkdir("data", { recursive: true });
await fs.writeFile("data/memories.json", `${JSON.stringify(memories, null, 2)}\n`);
console.log(`Wrote ${memories.length} memories.`);
