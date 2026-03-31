const API_URL = "https://proxy-sc.vercel.app/api/dashboard";

let dashboardData = null;
let previousCount = null;
let loadInterval = null;
let isLoading = false;

function full(num) {
  return Number(num || 0).toLocaleString("en-US");
}

function compact(num) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(Number(num || 0));
}

// BUG FIX #1: buildYAxis — при maxValue=0 делил на 0,
// выдавал NaN и ломал всю ось Y.
function buildYAxis(maxValue) {
  const yAxis = document.getElementById("yAxis");
  yAxis.innerHTML = "";

  const steps = 5;
  const safeMax = maxValue > 0 ? maxValue : 1; // защита от деления на 0

  for (let i = steps; i >= 0; i -= 1) {
    const value = Math.round((safeMax / steps) * i);
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

  const isYearly = series.length >= 8;
  const values = series.map(item => Number(item.plays || 0));
  const maxSeriesValue = Math.max(...values, 1);

  // BUG FIX #2: для yearly режима hardcode 1 000 000 мог быть меньше
  // реального значения, в итоге бар вылезал за 100%.
  // Теперь берём максимум из фиксированной и реальной границ.
  const visualMax = isYearly
    ? Math.max(1000000, Math.ceil(maxSeriesValue * 1.12))
    : Math.ceil(maxSeriesValue * 1.12);

  buildYAxis(visualMax);

  const activeYears = new Set(["2023", "2024", "2025", "2026"]);

  series.forEach((item) => {
    const group = document.createElement("div");
    group.className = "bar-group";

    const col = document.createElement("div");
    col.className = "bar-col";

    const stack = document.createElement("div");
    stack.className = "bar-stack";

    const bg = document.createElement("div");
    bg.className = "bar-bg";

    const fill = document.createElement("div");
    fill.className = "bar-fill";

    const value = Number(item.plays || 0);
    const height = value > 0 ? Math.max((value / visualMax) * 100, 2.5) : 0;

    fill.style.height = `${height}%`;
    fill.title = `${item.label}: ${full(value)}`;

    if ((isYearly && !activeYears.has(item.label)) || value === 0) {
      fill.classList.add("zero");
    }

    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = item.label;

    stack.appendChild(bg);
    stack.appendChild(fill);
    col.appendChild(stack);
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
      // BUG FIX #3: XSS через track.title — использовали как alt-текст через
      // innerHTML в stats ниже, а title мог содержать HTML. Теперь везде
      // используем textContent / setAttribute для безопасной вставки.
      img.alt = track.title || "Track cover";
      // BUG FIX #4: нет обработчика ошибки загрузки обложки —
      // при 404 остаётся сломанная иконка. Теперь фоллбэк на номер.
      img.onerror = () => {
        cover.removeChild(img);
        cover.textContent = String(index + 1);
      };
      cover.appendChild(img);
    } else {
      cover.textContent = String(index + 1);
    }

    const meta = document.createElement("div");

    const title = document.createElement("div");
    title.className = "track-name";
    title.textContent = track.title || "Untitled";

    // BUG FIX #3 (продолжение): stats ранее строился через innerHTML
    // с данными из API — потенциальный XSS. Переписано на DOM-методы.
    const stats = document.createElement("div");
    stats.className = "track-stats";

    const spans = [
      `▶ ${full(track.playback_count)} plays`,
      `♥ ${full(track.likes_count)}`,
      `💬 ${full(track.comment_count)}`
    ];
    spans.forEach(text => {
      const s = document.createElement("span");
      s.textContent = text;
      stats.appendChild(s);
    });

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
    growthText.style.color = ""; // сбросить возможный цвет ошибки
  } else if (diff < 0) {
    growthText.textContent = `(${full(diff)})`;
  } else {
    growthText.textContent = "(+0)";
  }

  previousCount = totalPlays;
}

// BUG FIX #5: нет защиты от одновременных запросов —
// если сервер отвечает медленнее 30 секунд, запросы накапливаются.
// Добавлен флаг isLoading.
async function loadDashboard() {
  if (isLoading) return;
  isLoading = true;

  try {
    // BUG FIX #6: отсутствовал timeout — запрос мог висеть вечно.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 сек

    const res = await fetch(API_URL, {
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    // BUG FIX #7: нет валидации структуры ответа — если прокси вернул
    // неожиданный JSON, всё ломается тихо. Добавлена базовая проверка.
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid API response");
    }

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

    // BUG FIX #3 (финал): textContent вместо прямой вставки в DOM,
    // данные из API не должны интерпретироваться как HTML.
    document.getElementById("artistName").textContent = data.artist || "AREKKUZZERA";
    document.getElementById("trackTitle").textContent = data.trackTitle || "All Tracks";

    const updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
    // BUG FIX #8: toLocaleTimeString() без аргументов зависит от локали
    // браузера — на некоторых системах выдаёт неожиданный формат.
    document.getElementById("lastUpdate").textContent = updatedAt.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    updateGrowth(totalPlays);
    renderTracks(data.tracks || []);
    renderSelectedRange(document.getElementById("rangeSelect").value);

  } catch (err) {
    // BUG FIX #9: при ошибке затиралось значение headlinePlays — пользователь
    // терял уже загруженные данные. Теперь ошибка только логируется +
    // показывается в lastUpdate, если данные уже есть.
    console.error("Dashboard error:", err);

    if (dashboardData === null) {
      // Первая загрузка — нечего показывать, покажем ошибку
      document.getElementById("headlinePlays").textContent = "Error";
      document.getElementById("trackTitle").textContent = err.message;
    } else {
      // Данные уже есть — просто отметим время неудачного обновления
      document.getElementById("lastUpdate").textContent = `Failed: ${err.message}`;
    }
  } finally {
    isLoading = false;
  }
}

document.getElementById("rangeSelect").addEventListener("change", (e) => {
  renderSelectedRange(e.target.value);
});

// BUG FIX #10: setInterval не возвращал ID и не мог быть остановлен.
// Сохраняем ID для возможной последующей очистки.
loadDashboard();
loadInterval = setInterval(loadDashboard, 30000);
