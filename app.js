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

    const res = await fetch(PROXY_URL);
    const text = await res.text();

    console.log("status:", res.status);
    console.log("raw:", text);

    let track;
    try {
      track = JSON.parse(text);
    } catch {
      throw new Error("Proxy did not return JSON");
    }

    if (!res.ok) {
      throw new Error(track.error || `HTTP ${res.status}`);
    }

    if (typeof track.playback_count !== "number") {
      throw new Error("playback_count not found");
    }

    const currentCount = track.playback_count;
    playsEl.textContent = formatNumber(currentCount);

    if (previousCount !== null) {
      const diff = currentCount - previousCount;
      changeEl.textContent = diff > 0 ? `+${diff.toLocaleString()}` : diff < 0 ? `${diff.toLocaleString()}` : "No change";
    } else {
      changeEl.textContent = "First load";
    }

    previousCount = currentCount;
    statusEl.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error(err);
    playsEl.textContent = "Error";
    changeEl.textContent = err.message;
    statusEl.textContent = "Update failed";
  }
}

setInterval(getTrackData, 30000);
getTrackData();