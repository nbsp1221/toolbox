const test = require('node:test');
const assert = require('node:assert/strict');

const {
  removeYouTubeLogoutEntries,
} = require('../src/remove-logout-core');

function makeDocument(html) {
  const rows = new Map();
  const links = [];

  const rowMatches = html.matchAll(
    /<ytd-compact-link-renderer id="([^"]+)">([\s\S]*?)<\/ytd-compact-link-renderer>/g
  );

  for (const rowMatch of rowMatches) {
    const row = {
      id: rowMatch[1],
      isConnected: true,
      remove() {
        this.isConnected = false;
      },
    };
    rows.set(row.id, row);

    const linkMatches = rowMatch[2].matchAll(/<a href="([^"]+)">/g);
    for (const linkMatch of linkMatches) {
      links.push({
        href: linkMatch[1],
        closest(selector) {
          return selector === 'ytd-compact-link-renderer' ? row : null;
        },
      });
    }
  }

  return {
    querySelectorAll(selector) {
      assert.equal(selector, 'a[href="/logout"], a[href^="/logout?"]');
      return links.filter((link) => link.href === '/logout' || link.href.startsWith('/logout?'));
    },
    querySelector(selector) {
      const id = selector.startsWith('#') ? selector.slice(1) : selector;
      const row = rows.get(id);
      return row && row.isConnected ? row : null;
    },
  };
}

test('removes logout menu renderer by endpoint href without reading visible text', () => {
  const document = makeDocument(`
    <ytd-compact-link-renderer id="keep">
      <a href="/account">Sign out</a>
    </ytd-compact-link-renderer>
    <ytd-compact-link-renderer id="logout">
      <a href="/logout"><span>Any locale text</span></a>
    </ytd-compact-link-renderer>
  `);

  const removed = removeYouTubeLogoutEntries(document);

  assert.equal(removed, 1);
  assert.equal(document.querySelector('#logout'), null);
  assert.notEqual(document.querySelector('#keep'), null);
});

test('removes logout links with query strings and keeps unrelated paths', () => {
  const document = makeDocument(`
    <ytd-compact-link-renderer id="logout-query">
      <a href="/logout?continue=https%3A%2F%2Fwww.youtube.com%2F"></a>
    </ytd-compact-link-renderer>
    <ytd-compact-link-renderer id="not-logout">
      <a href="/logout-help"></a>
    </ytd-compact-link-renderer>
  `);

  const removed = removeYouTubeLogoutEntries(document);

  assert.equal(removed, 1);
  assert.equal(document.querySelector('#logout-query'), null);
  assert.notEqual(document.querySelector('#not-logout'), null);
});
