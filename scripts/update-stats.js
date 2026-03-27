const fs = require("fs");
const path = require("path");

const STATS_PATH = path.join(__dirname, "..", "stats.json");
const PROXY_URL = "https://proxy-sc.vercel.app/api/dashboard";

function todayParts() {
  const now = new Date();
  return {
    year: String(now.getFullYear()),
    month: now.toLocaleString("en-US", { month: "short" }),
    day: String(now.getDate())
  };
}

async function main() {
  const res = await fetch(PROXY_URL, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Proxy request failed: HTTP ${res.status}`);
  }

  const apiData = await res.json();

  if (typeof apiData.playback_count !== "number") {
    throw new Error("playback_count not found in proxy response");
  }

  const currentTotal = apiData.playback_count;

  const raw = fs.readFileSync(STATS_PATH, "utf8");
  const stats = JSON.parse(raw);

  if (!stats.snapshots) {
    stats.snapshots = [];
  }

  const { year, month, day } = todayParts();

  const lastSnapshot = stats.snapshots[stats.snapshots.length - 1];
  const todayKey = `${year}-${month}-${day}`;

  if (!lastSnapshot || lastSnapshot.key !== todayKey) {
    stats.snapshots.push({
      key: todayKey,
      year,
      month,
      day,
      total: currentTotal
    });
  } else {
    lastSnapshot.total = currentTotal;
  }

  const yearlyMap = new Map();
  const monthlyMap = new Map();
  const dailyMap = new Map();

  for (const snap of stats.snapshots) {
    if (!yearlyMap.has(snap.year)) {
      yearlyMap.set(snap.year, { label: snap.year, min: snap.total, max: snap.total });
    } else {
      const y = yearlyMap.get(snap.year);
      y.min = Math.min(y.min, snap.total);
      y.max = Math.max(y.max, snap.total);
    }
  }

  for (const [label, item] of yearlyMap.entries()) {
    yearlyMap.set(label, {
      label,
      plays: Math.max(item.max - item.min, 0)
    });
  }

  const currentYear = String(new Date().getFullYear());

  for (const snap of stats.snapshots.filter(s => s.year === currentYear)) {
    const key = snap.month;
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { label: key, min: snap.total, max: snap.total });
    } else {
      const m = monthlyMap.get(key);
      m.min = Math.min(m.min, snap.total);
      m.max = Math.max(m.max, snap.total);
    }
  }

  const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const monthly = monthOrder.map((m) => {
    const item = monthlyMap.get(m);
    return {
      label: m,
      plays: item ? Math.max(item.max - item.min, 0) : 0
    };
  });

  for (const snap of stats.snapshots.filter(s => s.year === currentYear && s.month === month)) {
    const key = snap.day;
    if (!dailyMap.has(key)) {
      dailyMap.set(key, { label: key, min: snap.total, max: snap.total });
    } else {
      const d = dailyMap.get(key);
      d.min = Math.min(d.min, snap.total);
      d.max = Math.max(d.max, snap.total);
    }
  }

  const maxDay = new Date().getDate();
  const daily = Array.from({ length: maxDay }, (_, i) => {
    const label = String(i + 1);
    const item = dailyMap.get(label);
    return {
      label,
      plays: item ? Math.max(item.max - item.min, 0) : 0
    };
  });

  const yearly = Array.from(yearlyMap.values()).sort((a, b) => Number(a.label) - Number(b.label));

  stats.sinceYear = stats.sinceYear || 2016;
  stats.history = {
    yearly,
    monthly,
    daily
  };
  stats.lastTotal = currentTotal;
  stats.lastTrackTitle = apiData.title || stats.lastTrackTitle || "";

  fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2) + "\n", "utf8");

  console.log("Updated stats.json");
  console.log("Current total:", currentTotal);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});