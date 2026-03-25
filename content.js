// content.js — ChatGPT TOC Navigator
// Includes assistant headings + user messages in one live, draggable, resizable TOC.

(function () {
  // -------------------- tiny utils --------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

  function sanitize(text) {
    return (text || "").replace(/\s+/g, " ").trim().slice(0, 180);
  }

  function summarizeFallback(el) {
    if (!el) return "Section";
    const strong = el.querySelector("strong,b");
    if (strong && strong.textContent.trim().length >= 6) return sanitize(strong.textContent);
    const li = el.querySelector("li");
    if (li) return sanitize(li.textContent);
    const txt = el.textContent || "";
    const sentence = txt.split(/(?<=[.!?])\s+/)[0] || txt.slice(0, 80);
    return sanitize(sentence || "Section");
  }

  function summarizeUserMessage(el) {
    if (!el) return "You";
    const txt = sanitize(el.textContent || "");
    if (!txt) return "You";
    return txt.length > 120 ? txt.slice(0, 117) + "..." : txt;
  }

  function uniqueSortByDomOrder(nodes) {
    const seen = new Set();
    const arr = [];
    nodes.forEach(n => {
      if (n && !seen.has(n)) {
        seen.add(n);
        arr.push(n);
      }
    });
    arr.sort((a, b) => {
      if (a === b) return 0;
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    return arr;
  }

  // -------------------- message detection --------------------
  function getAssistantBlocks() {
    const set = new Set();

    $$('article[role="article"]').forEach(a => {
      const roleEl = a.querySelector('[data-message-author-role="assistant"]');
      if (roleEl) {
        set.add(roleEl);
      } else if (a.matches('[data-message-author-role="assistant"]')) {
        set.add(a);
      }
    });

    $$('[data-message-author-role="assistant"]').forEach(el => set.add(el));

    // fallback
    $$('.markdown, .prose').forEach(el => {
      const assistantContainer = el.closest('[data-message-author-role="assistant"]');
      if (assistantContainer) set.add(assistantContainer);
    });

    return uniqueSortByDomOrder(Array.from(set));
  }

  function getUserBlocks() {
    const set = new Set();

    $$('article[role="article"]').forEach(a => {
      const roleEl = a.querySelector('[data-message-author-role="user"]');
      if (roleEl) {
        set.add(roleEl);
      } else if (a.matches('[data-message-author-role="user"]')) {
        set.add(a);
      }
    });

    $$('[data-message-author-role="user"]').forEach(el => set.add(el));

    return uniqueSortByDomOrder(Array.from(set));
  }

  function getAllConversationBlocks() {
    const assistant = getAssistantBlocks().map(node => ({ kind: "assistant", node }));
    const user = getUserBlocks().map(node => ({ kind: "user", node }));
    return uniqueSortByDomOrder([...assistant.map(x => x.node), ...user.map(x => x.node)]).map(node => {
      const kind = node.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
      return { kind, node };
    });
  }

  // -------------------- heading extraction --------------------
  function findAssistantHeadings(block) {
    const hs = $$('h1,h2,h3,h4,h5,h6', block).map(h => ({
      level: Number(h.tagName.slice(1)),
      text: sanitize(h.textContent),
      node: h,
      type: "assistant"
    })).filter(h => h.text.length);

    if (hs.length) return hs;

    const content = block.querySelector('.markdown, .prose, [data-testid="conversation-turn"]') || block;
    return [{
      level: 2,
      text: summarizeFallback(content),
      node: content,
      type: "assistant"
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
      type: "user"
    };
  }

  function ensureAnchor(node, base, i) {
    let target = node;

    if (!/^(H[1-6])$/.test((target.tagName || "").toUpperCase())) {
      target = node.closest('[data-message-author-role],article,section,div') || node;
    }

    if (!target.id) {
      target.id = `${base}-${i}-${Math.random().toString(36).slice(2, 8)}`;
    }

    return target.id;
  }

  // -------------------- panel UI --------------------
  function injectStylesOnce() {
    if ($('#cgpt-toc-style')) return;

    const s = document.createElement('style');
    s.id = 'cgpt-toc-style';
    s.textContent = `
      #cgpt-toc{
        position:fixed;
        top:80px;
        right:16px;
        width:320px;
        max-height:80vh;
        background:rgba(15,15,20,.95);
        color:#fff;
        border:1px solid rgba(255,255,255,.12);
        border-radius:12px;
        box-shadow:0 8px 24px rgba(0,0,0,.3);
        z-index:999999;
        display:flex;
        flex-direction:column;
        overflow:auto;
        font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,"Helvetica Neue",Arial;
        resize: both;
        min-width:240px;
        min-height:120px;
        max-width:50vw;
        max-height:80vh;
        box-sizing:border-box;
      }
      #cgpt-toc.min{
        height:38px;
        min-height:38px;
        resize:none;
        overflow:hidden;
      }
      #cgpt-toc.min #cgpt-toc-list{
        display:none;
      }
      #cgpt-toc-header{
        display:flex;
        align-items:center;
        gap:8px;
        padding:8px 10px;
        cursor:move;
        user-select:none;
        background:rgba(255,255,255,.06);
        border-bottom:1px solid rgba(255,255,255,.08)
      }
      #cgpt-toc-title{
        font-weight:600;
        flex:1
      }
      #cgpt-toc-list{
        overflow:auto;
        padding:8px 10px
      }
      #cgpt-toc-list ol{
        list-style:none;
        margin:0;
        padding:0
      }
      #cgpt-toc-list li{
        margin:2px 0;
        padding:4px 6px;
        border-radius:6px;
        cursor:pointer;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis
      }
      #cgpt-toc-list li:hover{
        background:rgba(255,255,255,.08)
      }
      #cgpt-toc-list li[data-level="1"]{
        padding-left:4px;
        font-weight:600
      }
      #cgpt-toc-list li[data-level="2"]{ padding-left:16px }
      #cgpt-toc-list li[data-level="3"]{ padding-left:28px }
      #cgpt-toc-list li[data-level="4"]{ padding-left:40px }
      #cgpt-toc-list li[data-level="5"]{ padding-left:52px }
      #cgpt-toc-list li[data-level="6"]{ padding-left:64px }

      /* user entries */
            #cgpt-toc-list li.cgpt-user-entry{
        color:rgba(0, 153, 255, 0.88);
        font-style:italic;
        border-left:2px solid rgba(115, 0, 255, 0.45);
        background:rgba(0, 46, 70, 0.08);
      }

      .cgpt-pulse{
        animation:cgptPulse 1.2s ease-out 1;
        outline:2px solid #6aa9ff;
        outline-offset:2px;
        border-radius:10px
      }
      @keyframes cgptPulse{
        0%{ box-shadow:0 0 0 0 rgba(106,169,255,.6) }
        100%{ box-shadow:0 0 0 16px rgba(106,169,255,0) }
      }

      h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]{
        scroll-margin-top:90px
      }

      #cgpt-toc-toggle{
        position:fixed;
        right:16px;
        bottom:16px;
        z-index:999999;
        background:rgba(15,15,20,.95);
        color:#fff;
        border:1px solid rgba(255,255,255,.12);
        border-radius:999px;
        padding:10px 14px;
        font-weight:600;
        cursor:pointer;
        box-shadow:0 8px 24px rgba(0,0,0,.3)
      }
      #cgpt-toc-toggle:hover{
        filter:brightness(1.1)
      }

      /* custom bottom-left resize grip */
      #cgpt-toc-left-resize{
        position:absolute;
        left:0;
        bottom:0;
        width:16px;
        height:16px;
        cursor:sw-resize;
        z-index:2;
      }
      #cgpt-toc-left-resize::before{
        content:"";
        position:absolute;
        left:3px;
        bottom:3px;
        width:10px;
        height:10px;
        border-left:2px solid rgba(255,255,255,.45);
        border-bottom:2px solid rgba(255,255,255,.45);
        border-bottom-left-radius:2px;
      }




    `;
    document.head.appendChild(s);
  }

  function makeButton(label, title, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title;
    b.style.background = 'transparent';
    b.style.color = 'inherit';
    b.style.border = 'none';
    b.style.padding = '4px 6px';
    b.style.cursor = 'pointer';
    b.style.borderRadius = '6px';
    b.addEventListener('mouseenter', () => b.style.background = 'rgba(255,255,255,0.1)');
    b.addEventListener('mouseleave', () => b.style.background = 'transparent');
    b.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(e);
    });
    return b;
  }


  function toggleMinimize(panel) {
    const list = $('#cgpt-toc-list', panel);
    const isMin = panel.classList.contains('min');

    if (isMin) {
      panel.classList.remove('min');
      const restoreHeight = panel.dataset.restoreHeight || '';
      if (restoreHeight) {
        panel.style.height = restoreHeight;
      } else {
        panel.style.removeProperty('height');
      }
      if (list) list.style.removeProperty('display');
      panel.dataset.minimized = '0';
      return;
    }

    const rect = panel.getBoundingClientRect();
    panel.dataset.restoreHeight = `${Math.round(rect.height)}px`;
    panel.classList.add('min');
    panel.style.height = '38px';
    if (list) list.style.display = 'none';
    panel.dataset.minimized = '1';
  }

  function createPanel() {
    if ($('#cgpt-toc')) return $('#cgpt-toc');
    injectStylesOnce();

    const existingToggle = $('#cgpt-toc-toggle');
    if (existingToggle) existingToggle.remove();

    const panel = document.createElement('div');
    panel.id = 'cgpt-toc';

    try {
      const sz = JSON.parse(localStorage.getItem('cgpt_toc_size') || '{}');
      if (sz && typeof sz === 'object') {
        if (sz.w) panel.style.width = `${sz.w}px`;
        if (sz.h) panel.style.height = `${sz.h}px`;
      }
    } catch {}

    const header = document.createElement('div');
    header.id = 'cgpt-toc-header';

    const title = document.createElement('div');
    title.id = 'cgpt-toc-title';
    title.textContent = 'Chat TOC';

    const controls = document.createElement('div');

    const btnMin = makeButton('–', 'Minimize', () => {
      toggleMinimize(panel);
    });

    const btnClose = makeButton('×', 'Close', () => {
      panel.remove();
      lastKey = '';
      showStub();
      sessionStorage.setItem('cgpt_toc_closed', '1');
    });

    controls.append(btnMin, btnClose);
    header.append(title, controls);
    panel.append(header);

    const list = document.createElement('div');
    list.id = 'cgpt-toc-list';
    panel.append(list);



    const leftResizeGrip = document.createElement('div');
    leftResizeGrip.id = 'cgpt-toc-left-resize';
    panel.append(leftResizeGrip);


    panel.classList.remove('min');
    panel.dataset.minimized = '0';
    list.style.removeProperty('display');

    document.documentElement.append(panel);

    makeDraggable(panel, header);
    setupResizePersistence(panel);
    setupLeftResize(panel, leftResizeGrip);

    return panel;
  }

  function showStub() {
    if ($('#cgpt-toc-toggle')) return;
    const t = document.createElement('button');
    t.id = 'cgpt-toc-toggle';
    t.type = 'button';
    t.textContent = 'TOC';

    const reopenTOC = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      t.remove();
      lastKey = '';
      sessionStorage.removeItem('cgpt_toc_closed');
      createPanel();
      rebuildTOC();
    };

    t.addEventListener('mousedown', reopenTOC);
    t.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') reopenTOC(e);
    });

    document.documentElement.append(t);
  }

  function makeDraggable(box, handle) {
    let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button') || e.target.closest('#cgpt-toc-left-resize')) {
        return;
      }

      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      const r = box.getBoundingClientRect();
      sl = r.left;
      st = r.top;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      box.style.left = `${sl + dx}px`;
      box.style.top = `${st + dy}px`;
      box.style.right = 'auto';
      box.style.bottom = 'auto';
    });

    window.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  function setupResizePersistence(panel) {
    if (!('ResizeObserver' in window)) return;

    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (panel.classList.contains('min') || panel.dataset.minimized === '1') return;
      try {
        localStorage.setItem('cgpt_toc_size', JSON.stringify({ w, h }));
      } catch {}
    });

    ro.observe(panel);
  }


    function setupLeftResize(panel, grip) {
    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    let startLeft = 0;
    let startTop = 0;

    grip.addEventListener('mousedown', (e) => {
      resizing = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = panel.getBoundingClientRect();
      startWidth = rect.width;
      startHeight = rect.height;
      startLeft = rect.left;
      startTop = rect.top;

      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = `${startLeft}px`;
      panel.style.top = `${startTop}px`;

      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener('mousemove', (e) => {
      if (!resizing) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newWidth = startWidth - dx;
      const newHeight = startHeight + dy;
      const newLeft = startLeft + dx;

      const minWidth = 240;
      const minHeight = 120;
      const maxWidth = Math.floor(window.innerWidth * 0.5);
      const maxHeight = Math.floor(window.innerHeight * 0.8);

      const clampedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
      const clampedHeight = Math.min(Math.max(newHeight, minHeight), maxHeight);

      // keep left edge aligned properly when width is clamped
      const appliedLeft = startLeft + (startWidth - clampedWidth);

      panel.style.width = `${clampedWidth}px`;
      panel.style.height = `${clampedHeight}px`;
      panel.style.left = `${appliedLeft}px`;
    });

    window.addEventListener('mouseup', () => {
      if (!resizing) return;
      resizing = false;

      if (panel.classList.contains('min') || panel.dataset.minimized === '1') return;

      try {
        localStorage.setItem('cgpt_toc_size', JSON.stringify({
          w: Math.round(panel.getBoundingClientRect().width),
          h: Math.round(panel.getBoundingClientRect().height)
        }));
      } catch {}
    });
  }




  // -------------------- TOC build --------------------
  let lastKey = '';

  function rebuildTOC() {
    const existingPanel = $('#cgpt-toc');
    const isClosed = sessionStorage.getItem('cgpt_toc_closed') === '1';

    if (!existingPanel && isClosed) {
      showStub();
      return;
    }

    const panel = existingPanel || createPanel();
    const list = $('#cgpt-toc-list', panel);
    if (!list) return;

    const blocks = getAllConversationBlocks();
    const entries = [];

    blocks.forEach((item, idx) => {
      const block = item.node;
      const kind = item.kind;
      const base = block.id || `cgpt-msg-${idx}`;
      if (!block.id) block.id = base;

      if (kind === 'user') {
        const entry = findUserEntry(block);
        const id = ensureAnchor(entry.node, `${base}-user`, 0);
        entries.push({
          level: 1,
          text: entry.text,
          id,
          type: 'user',
          order: idx
        });
      } else {
        const heads = findAssistantHeadings(block);
        heads.forEach((h, i) => {
          const id = ensureAnchor(h.node, `${base}-assistant`, i);
          entries.push({
            level: clamp(h.level || 2, 1, 6),
            text: h.text,
            id,
            type: 'assistant',
            order: idx
          });
        });
      }
    });

    const key = JSON.stringify(entries.map(e => `${e.order}:${e.type}:${e.level}:${e.text}:${e.id}`));
    if (key === lastKey && list.childElementCount > 0) return;
    lastKey = key;

    list.innerHTML = '';

    if (!entries.length) {
      list.innerHTML = '<div style="opacity:.75">No headings yet.</div>';
      return;
    }

    const ol = document.createElement('ol');

    entries.forEach(e => {
      const li = document.createElement('li');
      li.dataset.level = String(e.level);
      li.title = e.text;
      li.textContent = e.text;

      if (e.type === 'user') {
        li.classList.add('cgpt-user-entry');
      }

      li.addEventListener('click', () => {
        const target = document.getElementById(e.id);
        if (!target) return;

        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        } catch (_) {
          target.scrollIntoView(true);
        }

        target.classList.add('cgpt-pulse');
        setTimeout(() => target.classList.remove('cgpt-pulse'), 1200);
      });

      ol.append(li);
    });

    list.append(ol);
  }

  // -------------------- live updates --------------------
  let debTimer = null;

  function scheduleBuild() {
    clearTimeout(debTimer);
    debTimer = setTimeout(rebuildTOC, 150);
  }

  async function startObserver() {
    await sleep(400);
    rebuildTOC();

    const root = document.body || document.documentElement;
    const obs = new MutationObserver(() => scheduleBuild());
    obs.observe(root, { childList: true, subtree: true, characterData: true });
  }

  // -------------------- boot --------------------
  function boot() {
    if (sessionStorage.getItem('cgpt_toc_closed') === '1') {
      showStub();
    } else {
      createPanel();
    }
    startObserver();
  }

  const host = location.hostname;
  if (/(^|\.)chatgpt\.com$/.test(host) || /(^|\.)chat\.openai\.com$/.test(host)) {
    boot();
  }
})();