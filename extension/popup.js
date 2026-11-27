const $ = (id) => document.getElementById(id);

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab && tab.url;
  const btn = $("check");

  if (url && isCheckable(url)) {
    const u = new URL(url);
    const text = u.host + (u.pathname === "/" ? "" : u.pathname);
    $("page").textContent = text.length > 60 ? text.slice(0, 59) + "…" : text;
    $("page").title = url;
    btn.disabled = false;
  } else {
    $("page").textContent = url ? url.split("/")[0] + "//…" : "No page";
    $("note").textContent = "Only http(s) pages can be checked (not chrome://, edge://, file:// or other schemes).";
  }

  btn.addEventListener("click", async () => {
    chrome.tabs.create({ url: checkUrl(await getAppUrl(), url, $("mode").value) });
    window.close();
  });

  $("settings").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
})();
