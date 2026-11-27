const input = document.getElementById("appUrl");
const msg = document.getElementById("msg");

getAppUrl().then((v) => (input.value = v));

document.getElementById("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  let u;
  try { u = new URL(input.value.trim()); } catch { u = null; }
  if (!u || u.protocol !== "https:") {
    msg.className = "err";
    msg.textContent = "Enter a valid https:// URL.";
    return;
  }
  const clean = u.origin + u.pathname.replace(/\/+$/, "");
  await chrome.storage.sync.set({ appUrl: clean });
  input.value = clean;
  msg.className = "";
  msg.textContent = "Saved.";
});
