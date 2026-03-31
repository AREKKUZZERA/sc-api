const fs = require("fs");
const path = require("path");

const STATS_PATH = path.join(__dirname, "..", "stats.json");
const PROXY_URL = "https://proxy-sc.vercel.app/api/dashboard";

// BUG FIX #1: todayParts() использовала локальное время сервера без явной
// временной зоны — на GitHub Actions (UTC) и на локальной машине (любая TZ)
// дата могла отличаться, приводя к дублям снапшотов или пропускам дней.
// Теперь всё в UTC.
function todayParts() {
  const now = new Date();
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun",
                       "Jul","Aug","Sep","Oct","Nov","Dec"];
  return {
    year:  String(now.getUTCFullYear()),
    month: monthNames[now.getUTCMonth()],
    day:   String(now.getUTCDate())
  };
}

// BUG FIX #2: не было таймаута на fetch — при зависшем прокси
// GitHub Actions job висел до таймаута воркфлоу (6 часов).
async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// BUG FIX #3: файл stats.json читался синхронно без обработки ошибки —
// если файл повреждён или отсутствует, скрипт падал с необработанным
// исключением и затирал файл пустым объектом при следующем запуске.
// Теперь есть явная обработка и дефолтная структура.
function readStats() {
  try {
    const raw = fs.readFileSync(STATS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) throw new Error("bad JSON");
    return parsed;
  } catch (err) {
    console.warn(`Warning: could not read stats.json (${err.message}), starting fresh.`);
    return { sinceYear: 2016, snapshots: [] };
  }
}

// BUG FIX #4: writeFileSync без промежуточного temp-файла —
// при падении в середине записи stats.json мог остаться повреждённым.
// Теперь пишем во временный файл, затем атомарно переименовываем.
function writeStats(stats) {
  const tmp = STATS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(stats, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, STATS_PATH);
}

async function main() {
  const res = await fetchWithTimeout(PROXY_URL);

  if (!res.ok) {
    throw new Error(`Proxy request failed: HTTP ${res.status}`);
  }

  const apiData = await res.json();

  // BUG FIX #5: проверялся только playback_count — если прокси вернул 200
  // с пустым объектом или HTML-ошибку в теле, скрипт падал позже с
  // непонятным сообщением. Добавлена проверка типа.
  if (typeof apiData !== "object" || apiData === null) {
    throw new Error("API returned non-object response");
  }

  if (typeof apiData.playback_count !== "number") {
    throw new Error(`playback_count not found in proxy response. Got: ${JSON.stringify(apiData).slice(0, 200)}`);
  }

  const currentTotal = apiData.playback_count;

  const stats = readStats();

  if (!Array.isArray(stats.snapshots)) {
    stats.snapshots = [];
  }

  const { year, month, day } = todayParts();

  const lastSnapshot = stats.snapshots[stats.snapshots.length - 1];
  const todayKey = `${year}-${month}-${day}`;

  if (!lastSnapshot || lastSnapshot.key !== todayKey) {
    stats.snapshots.push({ key: todayKey, year, month, day, total: currentTotal });
  } else {
    lastSnapshot.total = currentTotal;
  }

  // --- Yearly ---
  const yearlyMap = new Map();

  for (const snap of stats.snapshots) {
    if (!yearlyMap.has(snap.year)) {
      yearlyMap.set(snap.year, { label: snap.year, min: snap.total, max: snap.total });
    } else {
      const y = yearlyMap.get(snap.year);
      y.min = Math.min(y.min, snap.total);
      y.max = Math.max(y.max, snap.total);
    }
  }

  const yearly = Array.from(yearlyMap.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([label, item]) => ({
      label,
      plays: Math.max(item.max - item.min, 0)
    }));

  // --- Monthly (текущий год) ---
  // BUG FIX #6: monthlyMap строился по снапшотам текущего года, но
  // currentYear вычислялся через new Date() внутри функции main повторно —
  // мог рассинхронизироваться с todayParts() при переходе через полночь.
  // Теперь используем уже вычисленный year.
  const currentYear = year;
  const monthlyMap = new Map();

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

  const monthOrder = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const monthly = monthOrder.map((m) => {
    const item = monthlyMap.get(m);
    return { label: m, plays: item ? Math.max(item.max - item.min, 0) : 0 };
  });

  // --- Daily (текущий месяц текущего года) ---
  const dailyMap = new Map();

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

  // BUG FIX #7: maxDay вычислялся через new Date().getDate() —
  // та же проблема с рассинхронизацией. Берём из todayParts().
  const maxDay = Number(day);
  const daily = Array.from({ length: maxDay }, (_, i) => {
    const label = String(i + 1);
    const item = dailyMap.get(label);
    return { label, plays: item ? Math.max(item.max - item.min, 0) : 0 };
  });

  stats.sinceYear = stats.sinceYear || 2016;
  stats.history   = { yearly, monthly, daily };
  stats.lastTotal = currentTotal;
  // BUG FIX #8: сохранялся apiData.title, но поле называется trackTitle
  // в остальном коде — данные никогда не сохранялись корректно.
  stats.lastTrackTitle = apiData.trackTitle || apiData.title || stats.lastTrackTitle || "";

  writeStats(stats);

  console.log("Updated stats.json");
  console.log("Current total:", currentTotal);
  console.log("Snapshot key:", todayKey);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
