import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const registryPath = path.join(root, "data/lives/index.json");
const groupsPath = path.join(root, "data/groups.json");
const membersPath = path.join(root, "data/members.json");

const registry = readJson(registryPath);
const groups = readJson(groupsPath);
const members = readJson(membersPath);
const groupIds = new Set(groups.map(group => group.id));
const memberIds = new Set(members.map(member => member.id));
const errors = [];
const warnings = [];
const liveKeys = new Set();
const generatedUrls = new Map();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function requireField(object, field, label) {
  if (object[field] === undefined || object[field] === null || object[field] === "") {
    addError(`${label}: ${field} is required`);
  }
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) {
      addError(`${label}: duplicate id "${value}"`);
    }
    seen.add(value);
  }
}

function songMemoryKey(song, index) {
  const rawTitle = song.title || `song-${index}`;
  const safeTitle = rawTitle
    .replace(/[\\/:*?"<>|#%&{}$!`'@+=]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const order = song.order ?? index + 1;
  return `song-${index}:order-${order}:${safeTitle}`;
}

function addUrl(url, label) {
  if (generatedUrls.has(url)) {
    addError(`duplicate generated URL: ${url} (${generatedUrls.get(url)} / ${label})`);
  }
  generatedUrls.set(url, label);
}

function validateLive(entry) {
  requireField(entry, "groupId", "registry entry");
  requireField(entry, "liveId", "registry entry");

  const livePath = path.join(root, entry.path || `data/lives/${entry.groupId}/${entry.liveId}.json`);
  if (!fs.existsSync(livePath)) {
    addError(`registry entry ${entry.groupId}/${entry.liveId}: file not found (${entry.path})`);
    return;
  }

  const live = readJson(livePath);
  const label = `${entry.groupId}/${entry.liveId}`;

  for (const field of ["id", "groupId", "type", "year", "title", "sections", "performances", "setlists", "video", "goods"]) {
    requireField(live, field, label);
  }

  if (entry.liveId !== live.id) addError(`${label}: registry liveId does not match live.id (${live.id})`);
  if (entry.groupId !== live.groupId) addError(`${label}: registry groupId does not match live.groupId (${live.groupId})`);
  if (!groupIds.has(live.groupId)) addError(`${label}: unknown groupId "${live.groupId}"`);
  if (live.groupId === "individual") {
    const memberId = live.memberId || entry.memberId;
    if (!memberId) {
      addError(`${label}: individual live requires memberId`);
    } else if (!memberIds.has(memberId)) {
      addError(`${label}: unknown memberId "${memberId}"`);
    }
  }

  const liveKey = `${live.groupId}:${live.id}`;
  if (liveKeys.has(liveKey)) addError(`${label}: duplicate live id`);
  liveKeys.add(liveKey);

  addUrl(`live.html?group=${live.groupId}&live=${live.id}`, `${label} live`);

  const sectionIds = (live.sections || []).map(section => section.id);
  assertUnique(sectionIds, `${label} sections`);
  for (const sectionId of ["general", "schedule", "video", "goods"]) {
    if (!sectionIds.includes(sectionId)) addWarning(`${label}: section "${sectionId}" is missing`);
  }

  const performanceIds = (live.performances || []).map(performance => performance.id);
  assertUnique(performanceIds, `${label} performances`);
  for (const performance of live.performances || []) {
    for (const field of ["id", "date", "time", "area", "venue"]) {
      requireField(performance, field, `${label} performance`);
    }
    if (performance.id) {
      addUrl(`performance.html?group=${live.groupId}&live=${live.id}&performance=${performance.id}`, `${label} performance ${performance.id}`);
    }
  }

  const setlistIds = (live.setlists || []).map(setlist => setlist.id);
  assertUnique(setlistIds, `${label} setlists`);
  for (const setlist of live.setlists || []) {
    requireField(setlist, "id", `${label} setlist`);
    if (!Array.isArray(setlist.songs) || setlist.songs.length === 0) {
      addError(`${label} setlist ${setlist.id}: songs are required`);
      continue;
    }
    const songKeys = setlist.songs.map((song, index) => songMemoryKey(song, index));
    assertUnique(songKeys, `${label} setlist ${setlist.id} generated song keys`);
    setlist.songs.forEach((song, index) => {
      for (const field of ["order", "title", "artist"]) {
        requireField(song, field, `${label} setlist ${setlist.id} song ${index}`);
      }
      addUrl(
        `song.html?group=${live.groupId}&live=${live.id}&setlist=${setlist.id}&song=${index}&order=${song.order}`,
        `${label} song ${setlist.id}/${index}`
      );
    });
  }

  const videoSongs = live.video?.setlist?.length
    ? live.video.setlist
    : (live.setlists?.find(setlist => setlist.id === "v2") || live.setlists?.[live.setlists.length - 1])?.songs || [];
  const videoSetlistId = live.video?.setlist?.length ? "video" : (live.setlists?.find(setlist => setlist.id === "v2") || live.setlists?.[live.setlists.length - 1])?.id;
  const videoSongKeys = videoSongs.map((song, index) => songMemoryKey(song, index));
  assertUnique(videoSongKeys, `${label} video generated song keys`);
  videoSongs.forEach((song, index) => {
    addUrl(
      `video-song.html?group=${live.groupId}&live=${live.id}&setlist=${videoSetlistId}&song=${index}&order=${song.order}`,
      `${label} video song ${index}`
    );
  });

  const goodsIds = (live.goods || []).map(goods => goods.id);
  assertUnique(goodsIds, `${label} goods`);
  for (const goods of live.goods || []) {
    for (const field of ["id", "name", "price"]) {
      requireField(goods, field, `${label} goods`);
    }
    if (goods.id) {
      addUrl(`goods.html?group=${live.groupId}&live=${live.id}&goods=${goods.id}`, `${label} goods ${goods.id}`);
    }
  }
}

for (const entry of registry) {
  validateLive(entry);
}

if (warnings.length) {
  console.log("Warnings:");
  warnings.forEach(warning => console.log(`- ${warning}`));
}

if (errors.length) {
  console.error("Errors:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`OK: ${registry.length} lives validated, ${generatedUrls.size} URLs checked.`);
