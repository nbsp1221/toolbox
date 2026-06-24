// ==UserScript==
// @name         Crack JSONL Exporter
// @namespace    local.crack-jsonl-exporter
// @version      0.2.1
// @description  Export the current crack.wrtn.ai chat as one JSONL file.
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      crack-api.wrtn.ai
// ==/UserScript==

(function () {
  'use strict';

  const API_BASE = 'https://crack-api.wrtn.ai';
  const CHAT_BASE = `${API_BASE}/crack-gen`;
  const AUTH_REFRESH_URL = `${API_BASE}/auth/v2/token/refresh`;
  const SCHEMA_VERSION = 2;
  const DEFAULT_LIMIT = 100;
  const REQUEST_DELAY_MS = 750;
  const CHAT_DELAY_MS = 1200;
  const ROOT_ID = 'crack-jsonl-exporter';

  const state = {
    running: false,
    cancelled: false,
    contextKey: '',
  };

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getCookie(name) {
    const prefix = `${name}=`;
    return document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) || '';
  }

  function setCookie(name, value, expires) {
    document.cookie = `${name}=${value}; domain=.wrtn.ai; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
  }

  function getCurrentChatContext(pathname = location.pathname) {
    const storyMatch = pathname.match(/^\/stories\/([^/]+)\/episodes\/([^/?#]+)/);
    if (storyMatch) {
      return {
        kind: 'story',
        contentId: storyMatch[1],
        chatId: storyMatch[2],
        detailPath: `/v3/chats/${encodeURIComponent(storyMatch[2])}`,
        messagesPath: `/v3/chats/${encodeURIComponent(storyMatch[2])}/messages?sortOrder=asc`,
      };
    }

    const characterMatch = pathname.match(/^\/characters\/([^/]+)\/chats\/([^/?#]+)/);
    if (characterMatch) {
      return {
        kind: 'character',
        contentId: characterMatch[1],
        chatId: characterMatch[2],
        detailPath: `/character-chats/${encodeURIComponent(characterMatch[2])}`,
        messagesPath: `/character-chats/${encodeURIComponent(characterMatch[2])}/messages?sortOrder=asc`,
      };
    }

    return null;
  }

  function appendQuery(path, params) {
    const [base, query = ''] = path.split('?');
    const search = new URLSearchParams(query);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        search.set(key, String(value));
      }
    }
    const suffix = search.toString();
    return suffix ? `${base}?${suffix}` : base;
  }

  function getNextCursor(raw) {
    const candidates = [raw, raw?.data, raw?.result, raw?.payload].filter(
      (item) => item && typeof item === 'object'
    );
    for (const item of candidates) {
      if (item.nextCursor) return item.nextCursor;
      if (item.cursor) return item.cursor;
    }
    return null;
  }

  function extractItems(raw, keys) {
    if (!raw || typeof raw !== 'object') return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.data)) return raw.data;

    const containers = [raw, raw.data, raw.result, raw.payload].filter(
      (item) => item && typeof item === 'object'
    );

    for (const container of containers) {
      for (const key of keys) {
        if (Array.isArray(container[key])) return container[key];
      }
    }

    return [];
  }

  function firstValue(object, keys) {
    if (!object || typeof object !== 'object') return undefined;
    for (const key of keys) {
      if (object[key] !== undefined && object[key] !== null) return object[key];
    }
    return undefined;
  }

  function getMessageId(message) {
    return firstValue(message, ['id', '_id', 'messageId', 'chatMessageId']);
  }

  function getMessageText(message) {
    return firstValue(message, [
      'text',
      'message',
      'content',
      'contents',
      'displayText',
      'value',
      'body',
    ]);
  }

  function normalizeMessage(context, message, index) {
    return {
      type: 'message',
      chat_kind: context.kind,
      content_id: context.contentId,
      chat_id: context.chatId,
      message_id: getMessageId(message) || null,
      index,
      role: firstValue(message, ['role', 'senderType', 'speaker', 'type', 'authorType']) || null,
      created_at: firstValue(message, ['createdAt', 'created_at', 'timestamp']) || null,
      text: getMessageText(message) || null,
      raw: message,
    };
  }

  function jsonl(records) {
    return records.map((record) => JSON.stringify(record)).join('\n') + '\n';
  }

  function sanitizeFilePart(value) {
    const cleaned = String(value || '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+|\.+$/g, '')
      .trim()
      .slice(0, 80);
    return cleaned || 'untitled';
  }

  function getVisibleTitle(context) {
    const title = document.title.replace(/\s*\|\s*크랙\s*$/, '').trim();
    if (title && title !== '크랙') return title;

    const activeLink = document.querySelector(`a[href="${CSS.escape(location.pathname)}"]`);
    const label = activeLink?.querySelector('div,span,p')?.textContent?.trim();
    return label || `${context.kind}-${context.chatId}`;
  }

  async function refreshAccessToken(refreshToken) {
    if (!refreshToken) return null;

    const response = await fetch(AUTH_REFRESH_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Platform: 'web',
        Refresh: refreshToken,
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return null;
    const raw = await response.json();
    const token = raw?.access_token?.replace(/^Bearer\s+/i, '');
    if (!token) return null;

    setCookie('access_token', token, new Date(Date.now() + 60 * 60 * 1000));
    return token;
  }

  function parseResponseText(text) {
    try {
      return text ? JSON.parse(text) : null;
    }
    catch {
      return { parseError: true, text };
    }
  }

  function gmRequestJson(url, headers) {
    if (typeof GM_xmlhttpRequest !== 'function') {
      return Promise.reject(new Error('GM_xmlhttpRequest is unavailable'));
    }

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers,
        anonymous: false,
        onload: (response) => {
          const raw = parseResponseText(response.responseText || '');
          if (response.status < 200 || response.status >= 300) {
            const message = raw?.message || raw?.error || response.responseText || response.statusText;
            reject(new Error(`${response.status} ${response.statusText}: ${message}`));
            return;
          }
          resolve(raw);
        },
        onerror: () => reject(new Error(`Network error while requesting ${url}`)),
        ontimeout: () => reject(new Error(`Timeout while requesting ${url}`)),
      });
    });
  }

  async function requestJson(path, retry = true) {
    const accessToken = getCookie('access_token');
    const refreshToken = getCookie('refresh_token');
    const headers = {
      'Content-Type': 'application/json',
      Platform: 'web',
      'wrtn-locale': 'ko-KR',
    };

    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (refreshToken) headers.Refresh = refreshToken;

    const url = `${CHAT_BASE}${path}`;
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers,
      });
    }
    catch (error) {
      return gmRequestJson(url, headers);
    }

    if ((response.status === 401 || response.status === 403) && retry && refreshToken) {
      const nextToken = await refreshAccessToken(refreshToken);
      if (nextToken) return requestJson(path, false);
    }

    const text = await response.text();
    const raw = parseResponseText(text);

    if (!response.ok) {
      const message = raw?.message || raw?.error || text || response.statusText;
      throw new Error(`${response.status} ${response.statusText}: ${message}`);
    }

    return raw;
  }

  async function collectCursorPages(initialPath, limit, onProgress) {
    const pages = [];
    let cursor = null;

    for (let pageIndex = 0; pageIndex < 10000; pageIndex += 1) {
      if (state.cancelled) throw new Error('Export cancelled');
      const path = appendQuery(initialPath, { limit, cursor });
      onProgress({ phase: 'messages', pageIndex: pageIndex + 1, path });
      const raw = await requestJson(path);
      pages.push({ pageIndex, path, raw });
      await sleep(REQUEST_DELAY_MS);

      const nextCursor = getNextCursor(raw);
      if (!nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }

    return pages;
  }

  async function exportCurrentChat(context, title, onProgress) {
    const records = [
      {
        type: 'export_meta',
        schema_version: SCHEMA_VERSION,
        source: 'crack.wrtn.ai',
        exported_at: new Date().toISOString(),
        page_url: location.href,
        api_base: CHAT_BASE,
        chat_kind: context.kind,
        content_id: context.contentId,
        chat_id: context.chatId,
        title,
      },
    ];

    onProgress({ phase: 'detail' });
    const detailRaw = await requestJson(context.detailPath);
    records.push({
      type: 'api_page',
      api_kind: `${context.kind}.detail`,
      chat_kind: context.kind,
      content_id: context.contentId,
      chat_id: context.chatId,
      path: context.detailPath,
      page_index: 0,
      raw: detailRaw,
    });

    await sleep(CHAT_DELAY_MS);
    const messagePages = await collectCursorPages(context.messagesPath, DEFAULT_LIMIT, onProgress);
    let messageIndex = 0;

    for (const page of messagePages) {
      records.push({
        type: 'api_page',
        api_kind: `${context.kind}.messages`,
        chat_kind: context.kind,
        content_id: context.contentId,
        chat_id: context.chatId,
        path: page.path,
        page_index: page.pageIndex,
        raw: page.raw,
      });

      for (const message of extractItems(page.raw, ['messages', 'chatMessages', 'items'])) {
        records.push(normalizeMessage(context, message, messageIndex));
        messageIndex += 1;
      }
    }

    records.push({
      type: 'export_summary',
      chat_kind: context.kind,
      content_id: context.contentId,
      chat_id: context.chatId,
      message_count: messageIndex,
      api_page_count: messagePages.length + 1,
    });

    return { records, messageCount: messageIndex, apiPageCount: messagePages.length + 1 };
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'application/x-ndjson;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function removePanel() {
    document.getElementById(ROOT_ID)?.remove();
  }

  function setStatus(root, message) {
    const status = root.querySelector('[data-role="status"]');
    if (status) status.textContent = message;
  }

  function updatePanel() {
    const context = getCurrentChatContext();
    const contextKey = context ? `${context.kind}:${context.chatId}` : '';

    if (!context) {
      removePanel();
      state.contextKey = '';
      return;
    }

    if (document.getElementById(ROOT_ID) && state.contextKey === contextKey) return;

    removePanel();
    state.contextKey = contextKey;

    const title = getVisibleTitle(context);
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'fixed bottom-5 right-5 z-popover flex flex-col items-end gap-2';
    root.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';
    root.innerHTML = `
      <button data-role="toggle" class="typo-text-sm_leading-none_semibold rounded-sm border border-border bg-card text-card-foreground shadow-lg" style="height:40px;padding:0 14px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:#18181b;color:#fafafa;box-shadow:0 10px 28px rgba(0,0,0,.32);cursor:pointer">
        JSONL Export
      </button>
      <div data-role="panel" class="hidden rounded-sm border border-border bg-card text-card-foreground shadow-lg" style="display:none;width:300px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:#18181b;color:#fafafa;box-shadow:0 16px 40px rgba(0,0,0,.36);padding:12px">
        <div class="typo-text-sm_leading-paragraph_semibold text-text_primary" style="font-weight:700;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fafafa"></div>
        <div class="typo-text-xs_leading-paragraph_regular text-muted-foreground" style="font-size:12px;color:#a1a1aa;margin-bottom:10px">현재 대화만 천천히 내보냅니다.</div>
        <div style="display:flex;gap:8px">
          <button data-role="export" class="typo-text-sm_leading-none_semibold rounded-sm bg-primary text-primary-foreground" style="flex:1;height:34px;border:0;border-radius:6px;background:#f4f4f5;color:#18181b;font-weight:700;cursor:pointer">Export</button>
          <button data-role="cancel" class="typo-text-sm_leading-none_semibold rounded-sm border border-border" style="display:none;width:72px;height:34px;border-radius:6px;border:1px solid rgba(255,255,255,.18);background:#27272a;color:#fafafa;cursor:pointer">Cancel</button>
        </div>
        <div data-role="status" class="typo-text-xs_leading-paragraph_regular text-muted-foreground" style="margin-top:10px;font-size:12px;color:#a1a1aa;word-break:break-word;max-height:74px;overflow:auto">Ready</div>
      </div>
    `;

    root.querySelector('.typo-text-sm_leading-paragraph_semibold').textContent = title;

    const toggle = root.querySelector('[data-role="toggle"]');
    const panel = root.querySelector('[data-role="panel"]');
    const exportButton = root.querySelector('[data-role="export"]');
    const cancelButton = root.querySelector('[data-role="cancel"]');

    toggle.addEventListener('click', () => {
      const next = panel.style.display === 'none' ? 'block' : 'none';
      panel.style.display = next;
    });

    cancelButton.addEventListener('click', () => {
      state.cancelled = true;
      setStatus(root, 'Cancelling...');
    });

    exportButton.addEventListener('click', async () => {
      if (state.running) return;
      const latestContext = getCurrentChatContext();
      if (!latestContext || latestContext.chatId !== context.chatId) {
        setStatus(root, '이 페이지에서는 export할 수 없습니다.');
        return;
      }

      state.running = true;
      state.cancelled = false;
      exportButton.disabled = true;
      exportButton.textContent = 'Exporting...';
      cancelButton.style.display = 'block';
      setStatus(root, 'Preparing...');

      try {
        const result = await exportCurrentChat(latestContext, title, (progress) => {
          if (progress.phase === 'detail') {
            setStatus(root, '대화 정보를 확인하는 중');
            return;
          }
          setStatus(root, `메시지 페이지 ${progress.pageIndex} 수집 중`);
        });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${sanitizeFilePart(`crack-${latestContext.kind}-${title}-${stamp}`)}.jsonl`;
        downloadText(filename, jsonl(result.records));
        setStatus(root, `완료: messages ${result.messageCount}, raw pages ${result.apiPageCount}`);
      }
      catch (error) {
        console.error('[Crack JSONL Exporter]', error);
        setStatus(root, `실패: ${error.message || error}`);
      }
      finally {
        state.running = false;
        exportButton.disabled = false;
        exportButton.textContent = 'Export';
        cancelButton.style.display = 'none';
      }
    });

    document.body.appendChild(root);
  }

  function installRouteWatcher() {
    const notify = () => setTimeout(updatePanel, 150);
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        notify();
        return result;
      };
    }
    window.addEventListener('popstate', notify);
    new MutationObserver(notify).observe(document.documentElement, { childList: true, subtree: true });
  }

  installRouteWatcher();
  updatePanel();
})();
