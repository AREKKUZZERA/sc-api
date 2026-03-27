const API_URL = "https://proxy-sc.vercel.app/api/dashboard";

let dashboardData = null;
let previousCount = null;

function full(num) {
  return Number(num || 0).toLocaleString("en-US");
}

function compact(num) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(Number(num || 0));
}

function buildYAxis(maxValue) {
  const yAxis = document.getElementById("yAxis");
  yAxis.innerHTML = "";

  const steps = 5;
  for (let i = steps; i >= 0; i -= 1) {
    const value = Math.round((maxValue / steps) * i);
    const el = document.createElement("span");
    el.textContent = i === 0 ? "0" : compact(value).toUpperCase();
    yAxis.appendChild(el);
  }
}

function renderChart(series) {
  const chartArea = document.getElementById("chartArea");
  chartArea.innerHTML = "";

  if (!Array.isArray(series) || !series.length) return;

  chartArea.style.gridTemplateColumns = `repeat(${series.length}, 1fr)`;

  const values = series.map(item => Number(item.plays || 0));
  const maxSeriesValue = Math.max(...values, 1);
  const visualMax = Math.ceil(maxSeriesValue * 1.08);

  buildYAxis(visualMax);

  series.forEach((item) => {
    const group = document.createElement("div");
    group.className = "bar-group";

    const col = document.createElement("div");
    col.className = "bar-col";

    const bar = document.createElement("div");
    const label = document.createElement("div");

    bar.className = Number(item.plays || 0) > 0 ? "bar active" : "bar";
    label.className = "bar-label";
    label.textContent = item.label;

    const value = Number(item.plays || 0);
    const height = value > 0 ? Math.max((value / visualMax) * 100, 4) : 0;

    bar.style.height = `${height}%`;
    bar.title = `${item.label}: ${full(value)}`;

    col.appendChild(bar);
    col.appendChild(label);
    group.appendChild(col);
    chartArea.appendChild(group);
  });
}

function renderTracks(tracks) {
  const trackList = document.getElementById("trackList");
  trackList.innerHTML = "";

  if (!Array.isArray(tracks) || !tracks.length) {
    trackList.innerHTML = `<div class="empty-state">No tracks available</div>`;
    return;
  }

  tracks.slice(0, 6).forEach((track, index) => {
    const item = document.createElement("div");
    item.className = "track-item";

    const cover = document.createElement("div");
    cover.className = "track-cover";

    if (track.artwork_url) {
      const img = document.createElement("img");
      img.src = track.artwork_url;
      img.alt = track.title || "Track cover";
      cover.appendChild(img);
    } else {
      cover.textContent = String(index + 1);
    }

    const meta = document.createElement("div");

    const title = document.createElement("div");
    title.className = "track-name";
    title.textContent = track.title || "Untitled";

    const stats = document.createElement("div");
    stats.className = "track-stats";
    stats.innerHTML = `
      <span>▶ ${full(track.playback_count)} plays</span>
      <span>♥ ${full(track.likes_count)}</span>
      <span>💬 ${full(track.comment_count)}</span>
    `;

    meta.appendChild(title);
    meta.appendChild(stats);

    item.appendChild(cover);
    item.appendChild(meta);
    trackList.appendChild(item);
  });
}

function renderSelectedRange(rangeKey) {
  if (!dashboardData?.history?.[rangeKey]) return;
  renderChart(dashboardData.history[rangeKey]);
}

function updateGrowth(totalPlays) {
  const growthText = document.getElementById("growthText");

  if (previousCount === null) {
    growthText.textContent = "(+0)";
    previousCount = totalPlays;
    return;
  }

  const diff = totalPlays - previousCount;

  if (diff > 0) {
    growthText.textContent = `(+${full(diff)})`;
  } else if (diff < 0) {
    growthText.textContent = `(${full(diff)})`;
  } else {
    growthText.textContent = "(+0)";
  }

  previousCount = totalPlays;
}

async function loadDashboard() {
  try {
    const res = await fetch(API_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    dashboardData = data;

    const totalPlays = Number(data.playback_count || 0);
    const likes = Number(data.likes || 0);
    const comments = Number(data.comments || 0);
    const reposts = Number(data.reposts || 0);
    const downloads = Number(data.downloads || 0);
    const trackCount = Number(data.trackCount || 0);

    document.getElementById("headlinePlays").textContent = full(totalPlays);
    document.getElementById("sinceYear").textContent = data.sinceYear || 2016;

    document.getElementById("playsValue").textContent = full(totalPlays);
    document.getElementById("likesValue").textContent = full(likes);
    document.getElementById("commentsValue").textContent = full(comments);
    document.getElementById("repostsValue").textContent = full(reposts);
    document.getElementById("downloadsValue").textContent = full(downloads);
    document.getElementById("trackCountValue").textContent = full(trackCount);

    document.getElementById("playsChipValue").textContent = `${full(totalPlays)} plays`;
    document.getElementById("likesChipValue").textContent = `${full(likes)} likes`;
    document.getElementById("commentsChipValue").textContent = `${full(comments)} comments`;
    document.getElementById("repostsChipValue").textContent = `${full(reposts)} reposts`;
    document.getElementById("downloadsChipValue").textContent = `${full(downloads)} download${downloads === 1 ? "" : "s"}`;

    document.getElementById("artistName").textContent = data.artist || "AREKKUZZERA";
    document.getElementById("trackTitle").textContent = data.trackTitle || "All Tracks";

    const updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
    document.getElementById("lastUpdate").textContent = updatedAt.toLocaleTimeString();

    updateGrowth(totalPlays);
    renderTracks(data.tracks || []);
    renderSelectedRange(document.getElementById("rangeSelect").value);
  } catch (err) {
    console.error("Dashboard error:", err);
    document.getElementById("headlinePlays").textContent = "Error";
    document.getElementById("trackTitle").textContent = err.message;
  }
}

document.getElementById("rangeSelect").addEventListener("change", (e) => {
  renderSelectedRange(e.target.value);
});

loadDashboard();
setInterval(loadDashboard, 30000);