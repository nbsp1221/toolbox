'use strict';

const LOGOUT_LINK_SELECTOR = 'a[href="/logout"], a[href^="/logout?"]';
const MENU_ROW_SELECTOR = 'ytd-compact-link-renderer';

function removeYouTubeLogoutEntries(root = globalThis.document) {
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

module.exports = {
  LOGOUT_LINK_SELECTOR,
  MENU_ROW_SELECTOR,
  removeYouTubeLogoutEntries,
};
