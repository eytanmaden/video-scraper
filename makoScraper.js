const makoScraper = (downloadJSON) => {
  const strip = (s = "") => {
    const d = document.createElement("div");
    d.innerHTML = s;
    return d.textContent || d.innerText || "";
  };
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];

  // --- Meta tags map ---
  const meta = [...document.querySelectorAll("meta")].reduce((acc, m) => {
    const k = m.getAttribute("property") || m.getAttribute("name");
    const v = m.getAttribute("content");
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  const get = (...keys) => keys.map((k) => meta[k]).find(Boolean) || null;

  // --- Duration pickers (UI → meta → video element) ---
  const parseClock = (txt = "") => {
    txt = String(txt).trim();
    // accepts "MM:SS" or "HH:MM:SS"
    const m = txt.match(/^(\d{1,2}:)?\d{1,2}:\d{2}$/);
    if (!m) return null;
    const parts = txt.split(":").map((n) => parseInt(n, 10));
    let sec = 0;
    if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else sec = parts[0] * 60 + parts[1];
    return { raw: txt, seconds: sec, source: "ui" };
  };

  const pickDuration = () => {
    // 1) UI (video.js)
    const uiSel = [
      ".vjs-duration",
      ".vjs-duration-display",
      ".vjs-time-control .vjs-duration",
      ".vjs-remaining-time",
      ".vjs-remaining-time-display"
    ].join(",");
    const uiEl = document.querySelector(uiSel);
    const uiTxt = uiEl?.innerText || uiEl?.textContent || "";
    const cleaned = uiTxt.replace(/[^\d:]/g, "").trim(); // strip labels like "Duration"
    const fromUI = parseClock(cleaned);
    if (fromUI) return fromUI;

    // 2) Meta tags (seconds)
    const metaSeconds = get("video:duration", "og:video:duration");
    if (metaSeconds && /^\d+$/.test(metaSeconds)) {
      return { raw: metaSeconds, seconds: parseInt(metaSeconds, 10), source: "meta" };
    }

    // 3) <video> element (seconds)
    const v = document.querySelector("video");
    if (v && Number.isFinite(v.duration) && v.duration > 0) {
      const secs = Math.round(v.duration);
      const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
      const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
      const ss = String(secs % 60).padStart(2, "0");
      const raw = secs >= 3600 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
      return { raw, seconds: secs, source: "video" };
    }

    return { raw: null, seconds: null, source: null };
  };

  // Title / description / poster / author
  const h1Title = strip(document.querySelector("h1, .title, [data-test='article-title']")?.textContent || "");
  const title = get("og:title") || h1Title || document.title || null;
  const description = get("og:description") || null;
  const posterImage = get("og:image") || null;
  const publicationDate = get("article:published_time", "og:article:published_time") || null;
  const author = get("author", "article:author", "og:article:author") || null;

  // Video ID from common wrappers
  const playerLike = document.querySelector(
    '[id^="player_"][id$="_video"], [id^="player_"].VideoRender_playerWrapper__Z0mj6, .video-js, [data-video-id]'
  );
  let videoId = null;
  if (playerLike) {
    const id = playerLike.getAttribute("id") || "";
    const m1 = id.match(/^player_(.+?)_video$/) || id.match(/^player_(.+?)$/);
    videoId = playerLike.getAttribute("data-video-id") || (m1 ? m1[1] : null);
  }

  // Resolution if video element is ready
  const videoEl = document.querySelector("video");
  const resolution = videoEl?.videoWidth && videoEl?.videoHeight ? `${videoEl.videoWidth}x${videoEl.videoHeight}` : null;

  // Any m3u8s loaded (requires playback started; Preserve log helps)
  const hlsPlaylists = uniq(
    performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((u) => /\.m3u8(\?|$)/i.test(u))
  );

  // Tags from DOM or meta keywords
  const tagEls = [...document.querySelectorAll('.tags a, [rel="tag"], .tag a')];
  const tagsFromDom = tagEls.map((el) => el.textContent.trim()).filter(Boolean);
  const metaKeywords = (get("keywords", "news_keywords") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const tags = tagsFromDom.length ? tagsFromDom : metaKeywords;

  const dur = pickDuration();

  const out = {
    source: location.hostname,
    title,
    publicationDate,
    duration: dur.raw,
    durationSeconds: dur.seconds,
    durationSource: dur.source, // "ui" | "meta" | "video" | null
    description,
    posterImage,
    author,
    videoId,
    canonicalUrl: document.querySelector('link[rel="canonical"]')?.getAttribute("href") || location.href,
    resolution,
    tags,
    hlsPlaylists
  };

  console.table({
    title: out.title,
    publicationDate: out.publicationDate,
    duration: out.duration,
    durationSeconds: out.durationSeconds,
    durationSource: out.durationSource,
    author: out.author,
    resolution: out.resolution
  });
  console.log("Full metadata (Mako):", out);

  if (downloadJSON) {
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mako_video_metadata.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return out;
};
