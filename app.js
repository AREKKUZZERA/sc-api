const PROXY_URL = "https://proxy-sc.vercel.app/api/plays";

let previousCount = null;

function formatNumber(num) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(num);
}

async function getTrackData() {
  const playsEl = document.getElementById("plays");
  const changeEl = document.getElementById("change");
  const statusEl = document.getElementById("status");

  try {
    statusEl.textContent = "Updating...";

    const res = await fetch(PROXY_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const track = await res.json();

    if (typeof track.playback_count !== "number") {
      throw new Error("playback_count not found");
    }

    const currentCount = track.playback_count;
    playsEl.textContent = formatNumber(currentCount);

    if (previousCount !== null) {
      const diff = currentCount - previousCount;

      if (diff > 0) {
        changeEl.textContent = `+${diff.toLocaleString()}`;
        changeEl.className = "change up";
        playsEl.classList.remove("pulse");
        void playsEl.offsetWidth;
        playsEl.classList.add("pulse");
      } else if (diff < 0) {
        changeEl.textContent = `${diff.toLocaleString()}`;
        changeEl.className = "change down";
      } else {
        changeEl.textContent = "No change";
        changeEl.className = "change";
      }
    } else {
      changeEl.textContent = "First load";
      changeEl.className = "change";
    }

    previousCount = currentCount;
    statusEl.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error("Overlay error:", err);
    playsEl.textContent = "Error";
    changeEl.textContent = err.message;
    changeEl.className = "change down";
    statusEl.textContent = "Update failed";
  }
}

getTrackData();
setInterval(getTrackData, 30000);