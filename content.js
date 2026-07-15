// content.js — ChatGPT TOC
// Live conversation navigation for user prompts and assistant headings.

(function () {
  'use strict';

  // -------------------- utilities --------------------
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function sanitize(text, maxLength = 180) {
    return (text || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  function summarizeFallback(element) {
    if (!element) return 'Section';

    const strong = element.querySelector('strong, b');
    if (strong && strong.textContent.trim().length >= 6) {
      return sanitize(strong.textContent);
    }

    const listItem = element.querySelector('li');
    if (listItem) return sanitize(listItem.textContent);

    const text = element.textContent || '';
    const sentence = text.split(/(?<=[.!?])\s+/)[0] || text.slice(0, 80);
    return sanitize(sentence || 'Section');
  }

  function summarizeUserMessage(element) {
    if (!element) return 'You';
    const text = sanitize(element.textContent || '', 120);
    return text || 'You';
  }

  function uniqueSortByDomOrder(nodes) {
    const seen = new Set();
    const unique = [];

    nodes.forEach(node => {
      if (node && !seen.has(node)) {
        seen.add(node);
        unique.push(node);
      }
    });

    unique.sort((a, b) => {
      if (a === b) return 0;
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    return unique;
  }

  function createButton(label, title, onClick, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    if (className) button.className = className;

    button.addEventListener('mousedown', event => event.stopPropagation());
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      onClick(event);
    });

    return button;
  }

  // -------------------- state --------------------
  let lastBuildKey = '';
  let debounceTimer = null;
  let currentUrl = location.href;
  let currentFilter = 'all';
  let currentQuery = '';
  let allEntries = [];
  let activeEntryId = '';
  let activeUpdatePending = false;
  let chatMutationObserver = null;
  let urlPollTimer = null;

  // -------------------- conversation detection --------------------
  function getAssistantBlocks() {
    const set = new Set();

    $$('article[role="article"]').forEach(article => {
      const roleNode = article.querySelector('[data-message-author-role="assistant"]');
      if (roleNode) {
        set.add(roleNode);
      } else if (article.matches('[data-message-author-role="assistant"]')) {
        set.add(article);
      }
    });

    $$('[data-message-author-role="assistant"]').forEach(node => set.add(node));

    // Fallback for ChatGPT layouts where the markdown container is easier to locate.
    $$('.markdown, .prose').forEach(node => {
      const assistant = node.closest('[data-message-author-role="assistant"]');
      if (assistant) set.add(assistant);
    });

    return uniqueSortByDomOrder(Array.from(set));
  }

  function getUserBlocks() {
    const set = new Set();

    $$('article[role="article"]').forEach(article => {
      const roleNode = article.querySelector('[data-message-author-role="user"]');
      if (roleNode) {
        set.add(roleNode);
      } else if (article.matches('[data-message-author-role="user"]')) {
        set.add(article);
      }
    });

    $$('[data-message-author-role="user"]').forEach(node => set.add(node));

    return uniqueSortByDomOrder(Array.from(set));
  }

  function getAllConversationBlocks() {
    const assistantNodes = getAssistantBlocks();
    const userNodes = getUserBlocks();
    const nodes = uniqueSortByDomOrder([...assistantNodes, ...userNodes]);

    return nodes.map(node => ({
      kind: node.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant',
      node
    }));
  }

  // -------------------- entry extraction --------------------
  function findAssistantHeadings(block) {
    const headings = $$('h1, h2, h3, h4, h5, h6', block)
      .map(heading => ({
        level: Number(heading.tagName.slice(1)),
        text: sanitize(heading.textContent),
        node: heading,
        type: 'assistant'
      }))
      .filter(entry => entry.text.length > 0);

    if (headings.length) return headings;

    const content = block.querySelector('.markdown, .prose, [data-testid="conversation-turn"]') || block;
    return [{
      level: 2,
      text: summarizeFallback(content),
      node: content,
      type: 'assistant'
    }];
  }

  function findUserEntry(block) {
    const content =
      block.querySelector('.whitespace-pre-wrap, .markdown, .prose, [data-testid="conversation-turn"]') ||
      block;

    return {
      level: 1,
      text: `➜ You: ${summarizeUserMessage(content)}`,
      node: content,
      type: 'user'
    };
  }

  function ensureAnchor(node, base, index) {
    let target = node;

    if (!/^(H[1-6])$/.test((target.tagName || '').toUpperCase())) {
      target = node.closest('[data-message-author-role], article, section, div') || node;
    }

    if (!target.id) {
      target.id = `${base}-${index}-${Math.random().toString(36).slice(2, 8)}`;
    }

    return target.id;
  }

  function collectEntries() {
    const blocks = getAllConversationBlocks();
    const entries = [];

    blocks.forEach((item, blockIndex) => {
      const block = item.node;
      const base = block.id || `cgpt-msg-${blockIndex}`;
      if (!block.id) block.id = base;

      if (item.kind === 'user') {
        const userEntry = findUserEntry(block);
        const id = ensureAnchor(userEntry.node, `${base}-user`, 0);
        entries.push({
          level: 1,
          text: userEntry.text,
          id,
          type: 'user',
          order: blockIndex
        });
        return;
      }

      findAssistantHeadings(block).forEach((heading, headingIndex) => {
        const id = ensureAnchor(heading.node, `${base}-assistant`, headingIndex);
        entries.push({
          level: clamp(heading.level || 2, 1, 6),
          text: heading.text,
          id,
          type: 'assistant',
          order: blockIndex
        });
      });
    });

    return entries;
  }

  // -------------------- panel creation --------------------
  function createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'cgpt-toc-toolbar';

    const search = document.createElement('input');
    search.id = 'cgpt-toc-search';
    search.type = 'search';
    search.placeholder = 'Search TOC…';
    search.setAttribute('aria-label', 'Search table of contents');
    search.value = currentQuery;
    search.addEventListener('input', () => {
      currentQuery = search.value.trim().toLowerCase();
      renderEntries();
    });

    const filters = document.createElement('div');
    filters.id = 'cgpt-toc-filters';
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Filter table of contents');

    [
      ['all', 'All'],
      ['user', 'You'],
      ['assistant', 'Replies']
    ].forEach(([value, label]) => {
      const button = createButton(label, `Show ${label.toLowerCase()} entries`, () => {
        currentFilter = value;
        updateFilterButtons();
        renderEntries();
      }, 'cgpt-toc-filter');
      button.dataset.filter = value;
      filters.append(button);
    });

    const navigation = document.createElement('div');
    navigation.id = 'cgpt-toc-navigation';

    const firstButton = createButton('↑ First', 'Jump to beginning of conversation', () => {
      jumpToFirstConversationTurn();
    }, 'cgpt-toc-nav-button');

    const latestButton = createButton('↓ Latest', 'Jump to latest conversation entry', () => {
      const latestEntry = allEntries[allEntries.length - 1];
      if (latestEntry) navigateToEntry(latestEntry);
    }, 'cgpt-toc-nav-button');

    navigation.append(firstButton, latestButton);
    toolbar.append(search, filters, navigation);
    return toolbar;
  }

  function createPanel() {
    const existing = $('#cgpt-toc');
    if (existing) return existing;

    const existingToggle = $('#cgpt-toc-toggle');
    if (existingToggle) existingToggle.remove();

    const panel = document.createElement('div');
    panel.id = 'cgpt-toc';

    try {
      const savedSize = JSON.parse(localStorage.getItem('cgpt_toc_size') || '{}');
      if (savedSize && typeof savedSize === 'object') {
        if (savedSize.w) panel.style.width = `${savedSize.w}px`;
        if (savedSize.h) panel.style.height = `${savedSize.h}px`;
      }
    } catch (_) {}

    const header = document.createElement('div');
    header.id = 'cgpt-toc-header';

    const title = document.createElement('div');
    title.id = 'cgpt-toc-title';
    title.textContent = 'Chat TOC';

    const controls = document.createElement('div');
    controls.id = 'cgpt-toc-controls';

    const refreshButton = createButton('↻', 'Refresh TOC', () => forceRebuild());
    const minimizeButton = createButton('–', 'Minimize', () => toggleMinimize(panel));
    const closeButton = createButton('×', 'Close', () => closePanel());

    controls.append(refreshButton, minimizeButton, closeButton);
    header.append(title, controls);
    panel.append(header);

    const body = document.createElement('div');
    body.id = 'cgpt-toc-body';
    body.append(createToolbar());

    const list = document.createElement('div');
    list.id = 'cgpt-toc-list';
    body.append(list);

    const status = document.createElement('div');
    status.id = 'cgpt-toc-status';
    status.setAttribute('aria-live', 'polite');
    body.append(status);

    panel.append(body);

    const leftResizeGrip = document.createElement('div');
    leftResizeGrip.id = 'cgpt-toc-left-resize';
    panel.append(leftResizeGrip);

    panel.classList.remove('min');
    panel.dataset.minimized = '0';

    document.documentElement.append(panel);

    makeDraggable(panel, header);
    setupResizePersistence(panel);
    setupLeftResize(panel, leftResizeGrip);
    updateFilterButtons();

    return panel;
  }

  function closePanel() {
    const panel = $('#cgpt-toc');
    if (panel) panel.remove();
    lastBuildKey = '';
    sessionStorage.setItem('cgpt_toc_closed', '1');
    showStub();
  }

  function showStub() {
    if ($('#cgpt-toc-toggle')) return;

    const toggle = document.createElement('button');
    toggle.id = 'cgpt-toc-toggle';
    toggle.type = 'button';
    toggle.textContent = 'TOC';
    toggle.setAttribute('aria-label', 'Open Chat TOC');

    const reopen = event => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      toggle.remove();
      sessionStorage.removeItem('cgpt_toc_closed');
      lastBuildKey = '';
      createPanel();
      forceRebuild();
    };

    toggle.addEventListener('click', reopen);
    document.documentElement.append(toggle);
  }

  function toggleMinimize(panel) {
    const isMinimized = panel.classList.contains('min');

    if (isMinimized) {
      panel.classList.remove('min');
      const restoreHeight = panel.dataset.restoreHeight || '';
      if (restoreHeight) panel.style.height = restoreHeight;
      else panel.style.removeProperty('height');
      panel.dataset.minimized = '0';
      return;
    }

    const rect = panel.getBoundingClientRect();
    panel.dataset.restoreHeight = `${Math.round(rect.height)}px`;
    panel.classList.add('min');
    panel.style.height = '38px';
    panel.dataset.minimized = '1';
  }

  // -------------------- dragging and resizing --------------------
  function makeDraggable(box, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    handle.addEventListener('mousedown', event => {
      if (event.target.closest('button') || event.target.closest('#cgpt-toc-left-resize')) return;

      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      const rect = box.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      event.preventDefault();
    });

    window.addEventListener('mousemove', event => {
      if (!dragging) return;
      box.style.left = `${startLeft + event.clientX - startX}px`;
      box.style.top = `${startTop + event.clientY - startY}px`;
      box.style.right = 'auto';
      box.style.bottom = 'auto';
    });

    window.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  function setupResizePersistence(panel) {
    if (!('ResizeObserver' in window)) return;

    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect || panel.classList.contains('min') || panel.dataset.minimized === '1') return;

      try {
        localStorage.setItem('cgpt_toc_size', JSON.stringify({
          w: Math.round(rect.width),
          h: Math.round(rect.height)
        }));
      } catch (_) {}
    });

    observer.observe(panel);
  }

  function setupLeftResize(panel, grip) {
    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    let startLeft = 0;

    grip.addEventListener('mousedown', event => {
      if (panel.classList.contains('min')) return;

      resizing = true;
      startX = event.clientX;
      startY = event.clientY;

      const rect = panel.getBoundingClientRect();
      startWidth = rect.width;
      startHeight = rect.height;
      startLeft = rect.left;

      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;

      event.preventDefault();
      event.stopPropagation();
    });

    window.addEventListener('mousemove', event => {
      if (!resizing) return;

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      const maxWidth = Math.floor(window.innerWidth * 0.5);
      const maxHeight = Math.floor(window.innerHeight * 0.8);
      const width = clamp(startWidth - deltaX, 240, maxWidth);
      const height = clamp(startHeight + deltaY, 120, maxHeight);
      const left = startLeft + (startWidth - width);

      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
      panel.style.left = `${left}px`;
    });

    window.addEventListener('mouseup', () => {
      if (!resizing) return;
      resizing = false;

      try {
        localStorage.setItem('cgpt_toc_size', JSON.stringify({
          w: Math.round(panel.getBoundingClientRect().width),
          h: Math.round(panel.getBoundingClientRect().height)
        }));
      } catch (_) {}
    });
  }

  // -------------------- rendering --------------------
  function updateFilterButtons() {
    $$('#cgpt-toc-filters .cgpt-toc-filter').forEach(button => {
      const selected = button.dataset.filter === currentFilter;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function getVisibleEntries() {
    return allEntries.filter(entry => {
      const filterMatch = currentFilter === 'all' || entry.type === currentFilter;
      const searchMatch = !currentQuery || entry.text.toLowerCase().includes(currentQuery);
      return filterMatch && searchMatch;
    });
  }

  function updateStatus(visibleCount) {
    const status = $('#cgpt-toc-status');
    if (!status) return;

    const prompts = allEntries.filter(entry => entry.type === 'user').length;
    const sections = allEntries.filter(entry => entry.type === 'assistant').length;
    const filtered = visibleCount !== allEntries.length ? ` · ${visibleCount} shown` : '';
    status.textContent = `${prompts} prompt${prompts === 1 ? '' : 's'} · ${sections} section${sections === 1 ? '' : 's'}${filtered}`;
  }

  function getConversationTurnTarget(node) {
    if (!node) return null;
    return node.closest('article[role="article"], [data-testid^="conversation-turn"]') || node;
  }

  function getScrollableAncestor(element) {
    let current = element?.parentElement || null;

    while (current && current !== document.documentElement) {
      const style = getComputedStyle(current);
      const overflowY = style.overflowY;
      const isScrollable =
        (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
        current.scrollHeight > current.clientHeight + 2;

      if (isScrollable) return current;
      current = current.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function conversationTurnSignature(node) {
    if (!node) return '';
    return node.id || sanitize(node.textContent || '', 160);
  }

  async function jumpToFirstConversationTurn() {
    let previousSignature = '';
    let stablePasses = 0;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const firstBlock = getAllConversationBlocks()[0]?.node;
      const target = getConversationTurnTarget(firstBlock);
      if (!target) return;

      const signature = conversationTurnSignature(target);
      const scroller = getScrollableAncestor(target);

      try {
        target.scrollIntoView({
          behavior: attempt === 0 ? 'smooth' : 'auto',
          block: 'start',
          inline: 'nearest'
        });
      } catch (_) {
        target.scrollIntoView(true);
      }

      // Push the containing chat scroller fully upward as well. This helps
      // ChatGPT reveal older virtualized turns above the current first node.
      if (scroller) {
        try {
          scroller.scrollTo({ top: 0, behavior: attempt === 0 ? 'smooth' : 'auto' });
        } catch (_) {
          scroller.scrollTop = 0;
        }
      }

      await sleep(attempt === 0 ? 550 : 350);

      const refreshedFirst = getConversationTurnTarget(getAllConversationBlocks()[0]?.node);
      const refreshedSignature = conversationTurnSignature(refreshedFirst);
      const refreshedScroller = getScrollableAncestor(refreshedFirst || target);
      const atTop = !refreshedScroller || refreshedScroller.scrollTop <= 2;

      if (refreshedSignature === signature && signature === previousSignature && atTop) {
        stablePasses += 1;
      } else {
        stablePasses = 0;
      }

      previousSignature = refreshedSignature || signature;
      if (stablePasses >= 1) break;
    }

    forceRebuild();

    const firstEntry = allEntries[0];
    const firstTarget = firstEntry ? document.getElementById(firstEntry.id) : null;
    if (firstEntry && firstTarget) {
      firstTarget.classList.add('cgpt-pulse');
      setTimeout(() => firstTarget.classList.remove('cgpt-pulse'), 1200);
      setActiveEntry(firstEntry.id);
    }
  }

  function navigateToEntry(entry) {
    const target = document.getElementById(entry.id);
    if (!target) {
      forceRebuild();
      return;
    }

    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    } catch (_) {
      target.scrollIntoView(true);
    }

    target.classList.add('cgpt-pulse');
    setTimeout(() => target.classList.remove('cgpt-pulse'), 1200);
    setActiveEntry(entry.id);
  }

  function renderEntries() {
    const list = $('#cgpt-toc-list');
    if (!list) return;

    const visibleEntries = getVisibleEntries();
    list.innerHTML = '';

    if (!allEntries.length) {
      list.innerHTML = '<div class="cgpt-toc-empty">No conversation sections yet.</div>';
      updateStatus(0);
      return;
    }

    if (!visibleEntries.length) {
      list.innerHTML = '<div class="cgpt-toc-empty">No matching entries.</div>';
      updateStatus(0);
      return;
    }

    const orderedList = document.createElement('ol');

    visibleEntries.forEach(entry => {
      const item = document.createElement('li');
      item.dataset.level = String(entry.level);
      item.dataset.entryId = entry.id;
      item.dataset.entryType = entry.type;
      item.title = entry.text;
      item.textContent = entry.text;

      if (entry.type === 'user') item.classList.add('cgpt-user-entry');
      if (entry.id === activeEntryId) item.classList.add('cgpt-active-entry');

      item.addEventListener('click', () => navigateToEntry(entry));
      orderedList.append(item);
    });

    list.append(orderedList);
    updateStatus(visibleEntries.length);
  }

  function rebuildTOC(force = false) {
    const panel = $('#cgpt-toc');
    const isClosed = sessionStorage.getItem('cgpt_toc_closed') === '1';

    if (!panel && isClosed) {
      showStub();
      return;
    }

    if (!panel) createPanel();

    const entries = collectEntries();
    const key = JSON.stringify(entries.map(entry =>
      `${entry.order}:${entry.type}:${entry.level}:${entry.text}:${entry.id}`
    ));

    if (!force && key === lastBuildKey && allEntries.length === entries.length) return;

    lastBuildKey = key;
    allEntries = entries;
    renderEntries();
    scheduleActiveUpdate();
  }

  function forceRebuild() {
    lastBuildKey = '';
    rebuildTOC(true);
  }

  // -------------------- active section tracking --------------------
  function setActiveEntry(id) {
    if (!id || id === activeEntryId) return;
    activeEntryId = id;

    $$('#cgpt-toc-list li[data-entry-id]').forEach(item => {
      item.classList.toggle('cgpt-active-entry', item.dataset.entryId === id);
    });

    const activeItem = $(`#cgpt-toc-list li[data-entry-id="${CSS.escape(id)}"]`);
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function updateActiveEntry() {
    activeUpdatePending = false;
    if (!allEntries.length || !$('#cgpt-toc')) return;

    const topGuide = 140;
    let selected = null;
    let closestAbove = -Infinity;
    let closestBelow = Infinity;

    allEntries.forEach(entry => {
      const target = document.getElementById(entry.id);
      if (!target) return;
      const rect = target.getBoundingClientRect();

      if (rect.bottom < 0 || rect.top > window.innerHeight) return;

      if (rect.top <= topGuide && rect.top > closestAbove) {
        selected = entry;
        closestAbove = rect.top;
      } else if (!selected && rect.top > topGuide && rect.top < closestBelow) {
        selected = entry;
        closestBelow = rect.top;
      }
    });

    if (selected) setActiveEntry(selected.id);
  }

  function scheduleActiveUpdate() {
    if (activeUpdatePending) return;
    activeUpdatePending = true;
    requestAnimationFrame(updateActiveEntry);
  }

  // -------------------- live updates and navigation --------------------
  function mutationIsRelevant(mutation) {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    if (target && target.closest('#cgpt-toc, #cgpt-toc-toggle')) return false;

    if (mutation.type === 'characterData') {
      return Boolean(target?.closest('[data-message-author-role], article[role="article"], main'));
    }

    return Array.from(mutation.addedNodes).some(node => {
      if (!(node instanceof Element)) return false;
      if (node.matches('[data-message-author-role], article[role="article"], h1, h2, h3, h4, h5, h6')) return true;
      return Boolean(node.querySelector?.('[data-message-author-role], article[role="article"], h1, h2, h3, h4, h5, h6'));
    }) || Boolean(target?.closest('[data-message-author-role], article[role="article"], main'));
  }

  function scheduleBuild(delay = 180) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => rebuildTOC(false), delay);
  }

  function handleConversationChange() {
    currentUrl = location.href;
    lastBuildKey = '';
    allEntries = [];
    activeEntryId = '';

    const list = $('#cgpt-toc-list');
    if (list) list.innerHTML = '<div class="cgpt-toc-empty">Loading conversation…</div>';
    updateStatus(0);

    scheduleBuild(100);
    setTimeout(() => forceRebuild(), 450);
    setTimeout(() => forceRebuild(), 1200);
  }

  function checkUrlChange() {
    if (location.href !== currentUrl) handleConversationChange();
  }

  function installHistoryHooks() {
    ['pushState', 'replaceState'].forEach(method => {
      const original = history[method];
      if (original.__cgptTocWrapped) return;

      const wrapped = function (...args) {
        const result = original.apply(this, args);
        window.dispatchEvent(new Event('cgpt-toc-locationchange'));
        return result;
      };
      wrapped.__cgptTocWrapped = true;
      history[method] = wrapped;
    });

    window.addEventListener('popstate', checkUrlChange);
    window.addEventListener('hashchange', checkUrlChange);
    window.addEventListener('cgpt-toc-locationchange', checkUrlChange);
    urlPollTimer = window.setInterval(checkUrlChange, 750);
  }

  async function startObservers() {
    await sleep(400);
    forceRebuild();

    const root = document.body || document.documentElement;
    chatMutationObserver = new MutationObserver(mutations => {
      if (mutations.some(mutationIsRelevant)) scheduleBuild();
    });
    chatMutationObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });

    document.addEventListener('scroll', scheduleActiveUpdate, true);
    window.addEventListener('resize', scheduleActiveUpdate);
    installHistoryHooks();
  }

  // -------------------- boot --------------------
  function boot() {
    if (sessionStorage.getItem('cgpt_toc_closed') === '1') showStub();
    else createPanel();

    startObservers();
  }

  const host = location.hostname;
  if (/(^|\.)chatgpt\.com$/.test(host) || /(^|\.)chat\.openai\.com$/.test(host)) {
    boot();
  }
})();
