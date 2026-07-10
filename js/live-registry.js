(function () {
  async function loadJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}`);
    }
    return response.json();
  }

  async function loadGroups() {
    return loadJson("data/groups.json");
  }

  async function loadEntries() {
    return loadJson("data/lives/index.json");
  }

  async function loadLive(entry) {
    const path = entry.path || `data/lives/${entry.groupId}/${entry.liveId}.json`;
    return loadJson(path);
  }

  async function loadAllLives() {
    const [groups, entries] = await Promise.all([loadGroups(), loadEntries()]);
    const groupById = new Map(groups.map(group => [group.id, group]));
    const items = await Promise.all(entries.map(async entry => {
      const live = await loadLive(entry);
      return {
        entry,
        group: groupById.get(entry.groupId || live.groupId),
        live
      };
    }));

    return items.filter(item => item.group && item.live);
  }

  async function loadGroupLives(groupId) {
    const [groups, entries] = await Promise.all([loadGroups(), loadEntries()]);
    const group = groups.find(item => item.id === groupId);
    const groupEntries = entries.filter(entry => entry.groupId === groupId);
    const lives = await Promise.all(groupEntries.map(entry => loadLive(entry)));
    return { group, lives };
  }

  function preferredGeneralSetlist(live) {
    return live.setlists.find(setlist => setlist.id === "v2")
      || live.setlists[live.setlists.length - 1];
  }

  function generalSetlists(live) {
    if (Array.isArray(live.generalSetlistIds) && live.generalSetlistIds.length) {
      return live.generalSetlistIds
        .map(id => live.setlists.find(setlist => setlist.id === id))
        .filter(Boolean);
    }

    return [preferredGeneralSetlist(live)];
  }

  function preferredVideoSetlist(live) {
    const generalSetlist = preferredGeneralSetlist(live);
    return live.video?.setlist?.length
      ? { id: "video", songs: live.video.setlist }
      : generalSetlist;
  }

  function buildLiveSearchResults(group, live, options = {}) {
    const includeSections = options.includeSections !== false;
    const results = [{
      title: live.title,
      subtitle: `${group.name} / ${live.type} / ${live.year}`,
      href: `live.html?group=${group.id}&live=${live.id}`,
      pageType: "live",
      searchText: `${group.name} ${live.type} ${live.year} ${live.title}`
    }];

    if (includeSections) {
      live.sections.forEach(section => {
        const href = section.id === "video"
          ? `video.html?group=${group.id}&live=${live.id}`
          : `section.html?group=${group.id}&live=${live.id}&section=${section.id}`;
        results.push({
          title: `${live.title} / ${section.label}`,
          subtitle: `${group.name} / ${section.description}`,
          href,
          pageType: section.id,
          searchText: `${group.name} ${live.title} ${section.label} ${section.description}`
        });
      });
    }

    live.performances.forEach(performance => {
      results.push({
        title: `${performance.date} ${performance.time}`,
        subtitle: `${live.title} / [${performance.area}] ${performance.venue}${performance.performanceType ? " / " + performance.performanceType : ""}`,
        href: `performance.html?group=${group.id}&live=${live.id}&performance=${performance.id}`,
        pageType: "schedule",
        searchText: `${group.name} ${live.title} ${performance.date} ${performance.time} ${performance.area} ${performance.venue} ${performance.performanceType || ""}`
      });
    });

    generalSetlists(live).forEach(setlist => {
      setlist.songs.forEach((song, index) => {
        const setlistLabel = setlist.label || setlist.name || "";
        results.push({
          title: `${song.order}. ${song.title}`,
          subtitle: `${live.title} / ${setlistLabel ? setlistLabel + " / " : ""}${song.artist}${song.note ? " / " + song.note : ""}`,
          href: `song.html?group=${group.id}&live=${live.id}&setlist=${setlist.id}&song=${index}&order=${song.order}`,
          pageType: "general",
          searchText: `${group.name} ${live.title} ${setlistLabel} ${song.order} ${song.title} ${song.artist} ${song.note || ""}`
        });
      });
    });

    const videoSetlist = preferredVideoSetlist(live);
    videoSetlist.songs.forEach((song, index) => {
      results.push({
        title: `${song.order}. ${song.title}`,
        subtitle: `${live.title} / 映像・円盤`,
        href: `video-song.html?group=${group.id}&live=${live.id}&setlist=${videoSetlist.id}&song=${index}&order=${song.order}`,
        pageType: "video",
        searchText: `${group.name} ${live.title} 映像 円盤 ${song.order} ${song.title} ${song.artist} ${song.note || ""}`
      });
    });

    live.goods.forEach(goods => {
      results.push({
        title: goods.name,
        subtitle: `${live.title} / ${goods.price.toLocaleString()}円`,
        href: `goods.html?group=${group.id}&live=${live.id}&goods=${goods.id}`,
        pageType: "goods",
        searchText: `${group.name} ${live.title} ${goods.name} ${goods.price}円 グッズ goods`
      });
    });

    return results;
  }

  window.LiveRegistry = {
    loadJson,
    loadGroups,
    loadEntries,
    loadAllLives,
    loadGroupLives,
    buildLiveSearchResults,
    preferredGeneralSetlist,
    generalSetlists,
    preferredVideoSetlist
  };
})();
