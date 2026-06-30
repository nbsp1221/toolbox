// ==UserScript==
// @name         YouTube Remove Logout Menu Entry
// @namespace    local.youtube-remove-logout
// @version      1.0.0
// @description  Remove YouTube account-menu logout entries by endpoint href, without relying on UI text.
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const LOGOUT_LINK_SELECTOR = 'a[href="/logout"], a[href^="/logout?"]';
  const MENU_ROW_SELECTOR = 'ytd-compact-link-renderer';

  function removeYouTubeLogoutEntries(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return 0;
    }

    const links = Array.from(root.querySelectorAll(LOGOUT_LINK_SELECTOR));
    let removed = 0;

    for (const link of links) {
      const row = link.closest(MENU_ROW_SELECTOR) || link;
      if (row.isConnected) {
        row.remove();
        removed += 1;
      }
    }

    return removed;
  }

  let pending = false;

  function scheduleCleanup() {
    if (pending) {
      return;
    }

    pending = true;
    queueMicrotask(() => {
      pending = false;
      removeYouTubeLogoutEntries();
    });
  }

  function start() {
    removeYouTubeLogoutEntries();

    const observer = new MutationObserver(scheduleCleanup);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    document.addEventListener('yt-navigate-finish', scheduleCleanup, true);
    document.addEventListener('yt-page-data-updated', scheduleCleanup, true);
  }

  if (document.documentElement) {
    start();
  }
  else {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
