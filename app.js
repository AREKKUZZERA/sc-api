const PROXY_URL = "https://proxy-sc.vercel.app/api/plays";

const chartYears = [
  { year: "2016", value: 0, active: false },
  { year: "2017", value: 0, active: false },
  { year: "2018", value: 0, active: false },
  { year: "2019", value: 0, active: false },
  { year: "2020", value: 0, active: false },
  { year: "2021", value: 0, active: false },
  { year: "2022", value: 0, active: false },
  { year: "2023", value: 140000, active: true },
  { year: "2024", value: 560000, active: true },
  { year: "2025", value: 890000, active: true },
  { year: "2026", value: 110000, active: true }
];

let previousCount = null;

function compact(num) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(num);
}

function full(num) {
  return num.toLocaleString("en-US");
}

function renderChart(data) {
  const chartArea = document.getElementById("chartArea");
  chartArea.innerHTML = "";

  const maxValue = 1000000;

  data.forEach((item) => {
    const group = document.createElement("div");
    group.className = "bar-group";

    const col = document.createElement("div");
    col.className = "bar-col";

    const bar = document.createElement("div");
    bar.className = item.active ? "bar active" : "bar";

    const heightPercent = Math.max((item.value / maxValue) * 100, item.value > 0 ? 4 : 0);
    bar.style.height = `${heightPercent}%`;
    bar.title = `${item.year}: ${full(item.value)}`;

    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = item.year;

    col.appendChild(bar);
    col.appendChild(label);
    group.appendChild(col);
    chartArea.appendChild(group);
  });
}

function updateFakeStatsFromPlays(totalPlays) {
  const likes = Math.round(totalPlays * 0.0108);
  const comments = Math.round(totalPlays * 0.00021);
  const reposts = Math.round(totalPlays * 0.00022);
  const downloads = 1;

  document.getElementById("likesValue").textContent = full(likes);
  document.getElementById("commentsValue").textContent = full(comments);
  document.getElementById("repostsValue").textContent = full(reposts);
  document.getElementById("downloadsValue").textContent = full(downloads);
}

async function loadDashboard() {
  const playsValue = document.getElementById("playsValue");
  const headlinePlays = document.getElementById("headlinePlays");
  const trackTitle = document.getElementById("trackTitle");
  const lastUpdate = document.getElementById("lastUpdate");

  try {
    const res = await fetch(PROXY_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    if (typeof data.playback_count !== "number") {
      throw new Error("playback_count not found");
    }

    const totalPlays = data.playback_count;

    playsValue.textContent = full(totalPlays);
    headlinePlays.textContent = full(totalPlays);
    trackTitle.textContent = data.title || "Unknown track";
    lastUpdate.textContent = `Last update: ${new Date().toLocaleTimeString()}`;

    updateFakeStatsFromPlays(totalPlays);

    if (previousCount !== null) {
      const diff = totalPlays - previousCount;
      if (diff > 0) {
        document.querySelector(".growth").textContent = `(+${full(diff)})`;
      } else if (diff < 0) {
        document.querySelector(".growth").textContent = `(${full(diff)})`;
      } else {
        document.querySelector(".growth").textContent = "(0)";
      }
    }

    previousCount = totalPlays;
  } catch (err) {
    console.error("Dashboard error:", err);
    playsValue.textContent = "Error";
    headlinePlays.textContent = "Error";
    trackTitle.textContent = err.message;
    lastUpdate.textContent = "Update failed";
  }
}

document.getElementById("rangeSelect").addEventListener("change", (e) => {
  const value = e.target.value;

  if (value === "all") {
    renderChart(chartYears);
    return;
  }

  if (value === "year") {
    renderChart(
      chartYears.map((item) => ({
        ...item,
        value: item.year === "2026" ? item.value : 0
      }))
    );
    return;
  }

  if (value === "month") {
    renderChart(
      chartYears.map((item) => ({
        ...item,
        value: item.year === "2026" ? Math.round(item.value * 0.2) : 0
      }))
    );
  }
});

renderChart(chartYears);
loadDashboard();
setInterval(loadDashboard, 30000);