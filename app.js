const API_URL = "https://proxy-sc.vercel.app/api/dashboard";

let previousCount = null;
let dashboardData = null;

function full(num) {
  return Number(num).toLocaleString("en-US");
}

function compact(num) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(num);
}

function buildYAxis(maxValue) {
  const yAxis = document.getElementById("yAxis");
  yAxis.innerHTML = "";

  const steps = 5;
  for (let i = steps; i >= 0; i -= 1) {
    const value = Math.round((maxValue / steps) * i);
    const label = document.createElement("span");
    label.textContent = i === 0 ? "0" : compact(value).toUpperCase();
    yAxis.appendChild(label);
  }
}

function renderChart(series, subtitle) {
  const chartArea = document.getElementById("chartArea");
  const chartSubtitle = document.getElementById("chartSubtitle");

  chartArea.innerHTML = "";
  chartSubtitle.textContent = subtitle;
  chartArea.style.gridTemplateColumns = `repeat(${series.length}, 1fr)`;

  const maxSeriesValue = Math.max(...series.map(item => item.plays), 1);
  const visualMax = Math.ceil(maxSeriesValue * 1.15);

  buildYAxis(visualMax);

  series.forEach((item, index) => {
    const group = document.createElement("div");
    group.className = "bar-group";

    const col = document.createElement("div");
    col.className = "bar-col";

    const bar = document.createElement("div");
    bar.className = index >= Math.max(series.length - 4, 0) ? "bar active" : "bar";

    const h = Math.max((item.plays / visualMax) * 100, item.plays > 0 ? 4 : 0);
    bar.style.height = `${h}%`;
    bar.title = `${item.label}: ${full(item.plays)}`;

    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = item.label;

    col.appendChild(bar);
    col.appendChild(label);
    group.appendChild(col);
    chartArea.appendChild(group);
  });
}

function renderSelectedRange(rangeKey) {
  if (!dashboardData?.history?.[rangeKey]) return;

  const subtitleMap = {
    yearly: "All-time yearly view",
    monthly: "This year by month",
    daily: "This month by day"
  };

  renderChart(dashboardData.history[rangeKey], subtitleMap[rangeKey] || "");
}

async function initDashboard() {
  try {
    const res = await fetch(API_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    dashboardData = data;

    const totalPlays = data.playback_count;

    document.getElementById("sinceYear").textContent = data.sinceYear || 2016;
    document.getElementById("trackTitle").textContent = data.trackTitle || "Unknown track";
    document.getElementById("lastUpdate").textContent =
      `Last update: ${new Date(data.updatedAt || Date.now()).toLocaleTimeString()}`;

    document.getElementById("headlinePlays").textContent = full(totalPlays);
    document.getElementById("playsValue").textContent = full(totalPlays);
    document.getElementById("likesValue").textContent = full(data.likes || 0);
    document.getElementById("commentsValue").textContent = full(data.comments || 0);
    document.getElementById("repostsValue").textContent = full(data.reposts || 0);
    document.getElementById("downloadsValue").textContent = full(data.downloads || 0);

    const growthText = document.getElementById("growthText");
    if (previousCount === null) {
      growthText.textContent = "(+0)";
    } else {
      const diff = totalPlays - previousCount;
      growthText.textContent = diff > 0 ? `(+${full(diff)})` : diff < 0 ? `(${full(diff)})` : "(0)";
    }
    previousCount = totalPlays;

    renderSelectedRange(document.getElementById("rangeSelect").value);
  } catch (err) {
    console.error(err);
    document.getElementById("headlinePlays").textContent = "Error";
    document.getElementById("playsValue").textContent = "Error";
    document.getElementById("trackTitle").textContent = err.message;
    document.getElementById("lastUpdate").textContent = "Update failed";
  }
}

document.getElementById("rangeSelect").addEventListener("change", (e) => {
  renderSelectedRange(e.target.value);
});

initDashboard();
setInterval(initDashboard, 30000);