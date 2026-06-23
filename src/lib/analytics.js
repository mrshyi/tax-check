const UMAMI_WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID;
const UMAMI_SCRIPT_URL = import.meta.env.VITE_UMAMI_SCRIPT_URL || "https://cloud.umami.is/script.js";

const pendingEvents = [];
let scriptRequested = false;

function flushPendingEvents() {
  if (!window.umami?.track) return;
  while (pendingEvents.length) {
    const [eventName, props] = pendingEvents.shift();
    window.umami.track(eventName, props);
  }
}

export function initAnalytics() {
  if (!UMAMI_WEBSITE_ID || typeof document === "undefined") return;
  if (document.querySelector("script[data-taxcheck-analytics='umami']")) {
    flushPendingEvents();
    return;
  }
  if (scriptRequested) return;

  scriptRequested = true;
  const script = document.createElement("script");
  script.defer = true;
  script.src = UMAMI_SCRIPT_URL;
  script.dataset.websiteId = UMAMI_WEBSITE_ID;
  script.dataset.taxcheckAnalytics = "umami";
  script.addEventListener("load", flushPendingEvents);
  document.head.appendChild(script);
}

export function track(eventName, props = {}) {
  if (!UMAMI_WEBSITE_ID || typeof window === "undefined") return;
  if (window.umami?.track) {
    window.umami.track(eventName, props);
    return;
  }
  pendingEvents.push([eventName, props]);
}

export function trackReportGenerated(action) {
  track("report_generated", { action });
}
