const scrapeCnnVideoMetadata = (downloadJson) => {
  // --- helpers ---
  const decode = (s = "") => {
    const t = document.createElement("textarea");
    t.innerHTML = s;
    return t.value;
  };
  const strip = (s = "") => {
    const d = document.createElement("div");
    d.innerHTML = s;
    return d.textContent || d.innerText || "";
  };
  const uniq = (arr) => [
    ...new Set(
      arr
        .filter(Boolean)
        .map((x) => x.trim())
        .filter(Boolean)
    )
  ];
  const pick = (obj, ...keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k] ?? null]));
  const parseDuration = (s = "") => {
    if (!s) return { raw: "", seconds: null };
    if (/^PT/.test(s)) {
      const h = +(/(\d+)H/.exec(s)?.[1] || 0),
        m = +(/(\d+)M/.exec(s)?.[1] || 0),
        sec = +(/(\d+)S/.exec(s)?.[1] || 0);
      return { raw: s, seconds: h * 3600 + m * 60 + sec };
    }
    const a = s.split(":").map(Number);
    if (a.some(isNaN)) return { raw: s, seconds: null };
    const [h = 0, m = 0, sec = 0] = a.length === 3 ? a : [0, a[0] || 0, a[1] || 0];
    return { raw: s, seconds: h * 3600 + m * 60 + sec };
  };

  // 1) Wrapper
  const wrapper = document.querySelector('.video-resource,[data-component-name="video-player"]');
  const d = wrapper?.dataset || {};
  let poster = null;
  try {
    poster = JSON.parse(decode(d.posterImageOverride || "{}"))?.big?.uri || null;
  } catch {}

  // 2) JSON-LD
  const jsonLdVideo = (() => {
    const nodes = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const n of nodes) {
      try {
        const data = JSON.parse(n.textContent || "null");
        const arr = Array.isArray(data) ? data : [data];
        for (const item of arr) {
          if (item?.["@type"] === "VideoObject") return item;
          if (Array.isArray(item?.["@graph"])) {
            const v = item["@graph"].find((g) => g?.["@type"] === "VideoObject");
            if (v) return v;
          }
        }
      } catch {}
    }
    return null;
  })();

  // 3) Meta
  const meta = [...document.querySelectorAll("meta")].reduce((acc, m) => {
    const k = m.getAttribute("property") || m.getAttribute("name");
    const v = m.getAttribute("content");
    if (k && v) acc[k] = v;
    return acc;
  }, {});

  // 4) Video resolution
  const videoEl = document.querySelector("video.top-player-video-element, video");
  const resolution = videoEl?.videoWidth && videoEl?.videoHeight ? `${videoEl.videoWidth}x${videoEl.videoHeight}` : null;

  // 5) m3u8s
  const m3u8s = uniq(
    performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((u) => /\.m3u8(\?|$)/i.test(u))
  );

  // --- duration
  const duration = parseDuration(d.duration || jsonLdVideo?.duration || "");

  // --- tags/section (THIS is the fix)
  const tagsFromAttr = (d.videoTags || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const tagsFromLd = jsonLdVideo?.keywords
    ? Array.isArray(jsonLdVideo.keywords)
      ? jsonLdVideo.keywords
      : String(jsonLdVideo.keywords).split(",")
    : [];

  // include section as a fallback “category tag”
  const sectionTag = d.videoSection ? [String(d.videoSection)] : [];

  const mergedTags = uniq([...tagsFromAttr, ...tagsFromLd, ...sectionTag]);

  // --- author heuristic
  const author =
    jsonLdVideo?.author?.name ||
    jsonLdVideo?.publisher?.name ||
    (strip(decode(d.description || "")).match(/CNN’s ([^.]+) reports/i)?.[1]
      ? `CNN’s ${strip(decode(d.description)).match(/CNN’s ([^.]+) reports/i)[1]}`
      : null);

  const out = {
    source: location.hostname,
    title: d.headline || jsonLdVideo?.name || meta["og:title"] || document.title || null,
    publicationDateUTC: d.publishDate || jsonLdVideo?.uploadDate || meta["article:published_time"] || null,
    section: d.videoSection || null,
    tags: mergedTags, // <-- now includes `world` (or other section) if tags empty
    duration: duration.raw || null,
    durationSeconds: duration.seconds,
    description: strip(decode(d.description || jsonLdVideo?.description || meta["og:description"] || "")) || null,
    videoId: d.videoId || d.mediaId || null,
    canonicalUrl: d.canonicalUrl || jsonLdVideo?.url || location.href,
    posterImage: poster || jsonLdVideo?.thumbnailUrl || meta["og:image"] || null,
    contentType: d.contentType || null,
    resolution,
    hlsPlaylists: m3u8s,
    extra: pick(d, "videoResourceUri", "videoResourceParentUri", "boltId")
  };

  console.table({
    title: out.title,
    publicationDateUTC: out.publicationDateUTC,
    section: out.section,
    tags: out.tags?.join("|") || "",
    duration: out.duration,
    durationSeconds: out.durationSeconds,
    resolution: out.resolution
  });
  console.log("Full metadata:", out);

  if (downloadJson) {
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cnn_video_metadata.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return out;
};
