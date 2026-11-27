// Shared by popup, options and (via importScripts) the service worker.
const DEFAULT_APP_URL = "https://receipts-hex8.vercel.app";

async function getAppUrl() {
  try {
    const { appUrl } = await chrome.storage.sync.get("appUrl");
    return (appUrl || DEFAULT_APP_URL).replace(/\/+$/, "");
  } catch {
    return DEFAULT_APP_URL;
  }
}

function checkUrl(appUrl, target, mode = "auto") {
  return `${appUrl}/?url=${encodeURIComponent(target)}&mode=${encodeURIComponent(mode)}`;
}

function isCheckable(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
