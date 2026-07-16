(function () {
  async function loadJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${path}`);
    }
    return response.json();
  }

  async function loadGroups() {
    return loadJson("data/groups.json");
  }

  async function loadMembers() {
    return loadJson("data/members.json");
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

  function formatDisplayDate(date) {
    return String(date || "").replace(/-/g, "/");
  }

  function formatDisplayDateTime(performance) {
    return [formatDisplayDate(performance?.date), performance?.time].filter(Boolean).join(" ");
  }

  function detailHref(groupId, live) {
    return String(live.type || "").toUpperCase() === "STAGE"
      ? `stage.html?group=${groupId}&live=${live.id}`
      : `live.html?group=${groupId}&live=${live.id}`;
  }

  function buildLiveSearchResults(group, live, options = {}) {
    const includeSections = options.includeSections !== false;
    const results = [{
      title: live.title,
      subtitle: `${group.name} / ${live.type} / ${live.year}`,
      href: detailHref(group.id, live),
      pageType: "live",
      searchFields: {
        group: [group.name],
        live: [live.title],
        year: [live.year],
        pageType: [live.type]
      },
      searchText: `${group.name} ${live.type} ${live.year} ${live.title}`
    }];

    if (String(live.type || "").toUpperCase() === "STAGE") {
      (live.performances || []).forEach(performance => {
        const displayDateTime = formatDisplayDateTime(performance);
        results.push({
          title: displayDateTime,
          subtitle: `${live.title} / [${performance.area}] ${performance.venue}`,
          href: `stage.html?group=${group.id}&live=${live.id}#stage-schedule`,
          pageType: "stage",
          searchFields: {
            group: [group.name],
            live: [live.title],
            pageType: ["STAGE", "舞台", "公演日程"],
            date: [performance.date],
            time: [performance.time],
            area: [performance.area],
            venue: [performance.venue]
          },
          searchText: `${group.name} ${live.type} ${live.year} ${live.title} 舞台 公演日程 ${displayDateTime} ${performance.date} ${performance.time} ${performance.area} ${performance.venue}`
        });
      });

      return results;
    }

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
          searchFields: {
            group: [group.name],
            live: [live.title],
            pageType: [section.label, section.description]
          },
          searchText: `${group.name} ${live.type} ${live.year} ${live.title} ${section.label} ${section.description}`
        });
      });
    }

    live.performances.forEach(performance => {
      const displayDateTime = formatDisplayDateTime(performance);
      results.push({
        title: displayDateTime,
        subtitle: `${live.title} / [${performance.area}] ${performance.venue}${performance.performanceType ? " / " + performance.performanceType : ""}`,
        href: `performance.html?group=${group.id}&live=${live.id}&performance=${performance.id}`,
        pageType: "schedule",
        searchFields: {
          group: [group.name],
          live: [live.title],
          pageType: ["公演日程"],
          date: [performance.date],
          time: [performance.time],
          area: [performance.area],
          venue: [performance.venue],
          performanceType: [performance.performanceType]
        },
        searchText: `${group.name} ${live.type} ${live.year} ${live.title} 公演日程 ${displayDateTime} ${performance.date} ${performance.time} ${performance.area} ${performance.venue} ${performance.performanceType || ""}`
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
          searchFields: {
            group: [group.name],
            live: [live.title],
            pageType: ["総合", setlistLabel],
            song: [song.title],
            artist: [song.artist],
            note: [song.note]
          },
          searchText: `${group.name} ${live.type} ${live.year} ${live.title} 総合 ${setlistLabel} ${song.order} ${song.title} ${song.artist} ${song.note || ""}`
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
        searchFields: {
          group: [group.name],
          live: [live.title],
          pageType: ["映像・円盤"],
          song: [song.title],
          artist: [song.artist],
          note: [song.note]
        },
        searchText: `${group.name} ${live.type} ${live.year} ${live.title} 映像 円盤 ${song.order} ${song.title} ${song.artist} ${song.note || ""}`
      });
    });

    live.goods.forEach(goods => {
      const priceText = goods.priceLabel || `${goods.price.toLocaleString()}円`;
      results.push({
        title: goods.name,
        subtitle: `${live.title} / ${priceText}`,
        href: `goods.html?group=${group.id}&live=${live.id}&goods=${goods.id}`,
        pageType: "goods",
        searchFields: {
          group: [group.name],
          live: [live.title],
          pageType: ["グッズ", "goods"],
          goods: [goods.name],
          price: [priceText, `${goods.price}円`]
        },
        searchText: `${group.name} ${live.type} ${live.year} ${live.title} ${goods.name} ${priceText} ${goods.price}円 グッズ goods`
      });
    });

    return results;
  }

  window.LiveRegistry = {
    loadJson,
    loadGroups,
    loadMembers,
    loadEntries,
    loadAllLives,
    loadGroupLives,
    buildLiveSearchResults,
    detailHref,
    formatDisplayDate,
    formatDisplayDateTime,
    preferredGeneralSetlist,
    generalSetlists,
    preferredVideoSetlist
  };
})();
