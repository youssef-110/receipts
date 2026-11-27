importScripts("common.js");

const MENUS = [
  { id: "receipts-link", title: "Check this link with Patina", contexts: ["link"] },
  { id: "receipts-page", title: "Check this page with Patina", contexts: ["page"] },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const m of MENUS) chrome.contextMenus.create(m);
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  const target = info.menuItemId === "receipts-link" ? info.linkUrl : info.pageUrl;
  if (!target || !isCheckable(target)) return;
  chrome.tabs.create({ url: checkUrl(await getAppUrl(), target) });
});
