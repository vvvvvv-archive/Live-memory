function songMemoryKey(song, index) {
  const order = song && song.order !== undefined ? song.order : "unknown";
  const title = song && song.title ? song.title : "song";
  const slug = encodeURIComponent(title)
    .replace(/%/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 80);

  return `song-${index}:order-${order}:${slug}`;
}

function generalSongMemoryId(groupId, liveId, setlistId, song, index) {
  return `song:${groupId}:${liveId}:${setlistId}:${songMemoryKey(song, index)}`;
}

function videoSongMemoryId(groupId, liveId, setlistId, song, index) {
  return `video-song:${groupId}:${liveId}:${setlistId}:${songMemoryKey(song, index)}`;
}
