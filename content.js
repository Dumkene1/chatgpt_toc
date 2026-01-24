(() => {
  // ===== Helpers =====
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

  const PANEL_ID = "cgpt-toc";
  const TOGGLE_ID = "cgpt-toc-toggle";

  let observer = null;
  let debTimer = null;
  let lastKey = "";

  // ===== Panel UI =====
  function makeButton(label, title, onClick) {
    const b = document.createElement("button");
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }

  function makeDraggable(box, handle) {
    let dragging = false,
      sx = 0,
      sy = 0,
      sl = 0,
      st = 0;

    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      const r = box.getBoundingClientRect();
      sl = r.left;
      st = r.top;
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      box.style.left = `${Math.max(8, sl + dx)}px`;
      box.style.top = `${Math.max(8, st + dy)}px`;
      box.style.right = "auto";
      box.style.bottom = "auto";
    });

    window.addEventListener("mouseup", () => (dragging = false));
  }

  function setupResizePersistence(panel) {
    if (!("ResizeObserver" in window)) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      try {
        localStorage.setItem(
          "cgpt_toc_size",
          JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) })
        );
      } catch {}
    });
    ro.observe(panel);
  }

  function showToggle() {
    if (document.getElementById(TOGGLE_ID)) return;
    const t = document.createElement("button");
    t.id = TOGGLE_ID;
    t.textContent = "TOC";
    t.addEventListener("click", () => {
      t.remove();
      sessionStorage.removeItem("cgpt_toc_closed");
      ensurePanel();
      rebuildTOC();
    });
    document.documentElement.appendChild(t);
  }

  function ensurePanel() {
    // Respect closed state so observer doesn't re-create a blank shell
    if (sessionStorage.getItem("cgpt_toc_closed") === "1") return;
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;

    // restore size
    try {
      const sz = JSON.parse(localStorage.getItem("cgpt_toc_size") || "{}");
      if (sz?.w) panel.style.width = `${sz.w}px`;
      if (sz?.h) panel.style.height = `${sz.h}px`;
    } catch {}

    const header = document.createElement("div");
    header.id = "cgpt-toc-header";

    const title = document.createElement("div");
    title.id = "cgpt-toc-title";
    title.textContent = "ChatGPT TOC";

    const controls = document.createElement("div");
    controls.id = "cgpt-toc-controls";

    const btnMin = makeButton("–", "Minimize (collapses list)", () => {
      panel.classList.toggle("cgpt-min");
    });

    const btnClose = makeButton("×", "Close", () => {
      sessionStorage.setItem("cgpt_toc_closed", "1");
      lastKey = ""; // ensures rebuild works when reopened
      panel.remove();
      showToggle();
    });

    controls.append(btnMin, btnClose);
    header.append(title, controls);

    const list = document.createElement("div");
    list.id = "cgpt-toc-list";


    // Bottom-left resize handle (since CSS resize only gives bottom-right)
    const resizeBL = document.createElement("div");
    resizeBL.className = "cgpt-resize-bl";
    panel.appendChild(resizeBL);

    // Drag-resize from bottom-left: width changes + left shifts; height changes
    let resizing = false;
    let startX = 0, startY = 0;
    let startW = 0, startH = 0;
    let startLeft = 0;

    const onMove = (e) => {
      if (!resizing) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // dragging left increases width, dragging right decreases width
      const newW = Math.max(220, startW - dx);
      const newH = Math.max(180, startH + dy);

      // To keep the right edge fixed, move left as width changes
      const deltaW = newW - startW;
      const newLeft = startLeft - deltaW;

      panel.style.width = `${newW}px`;
      panel.style.height = `${newH}px`;
      panel.style.left = `${Math.max(8, newLeft)}px`;
      panel.style.right = "auto";

      // persist size immediately (your ResizeObserver also persists, but this feels snappy)
      try {
        localStorage.setItem(
          "cgpt_toc_size",
          JSON.stringify({ w: Math.round(newW), h: Math.round(newH) })
        );
      } catch {}
    };

    const onUp = () => {
      if (!resizing) return;
      resizing = false;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      document.body.style.userSelect = "";
    };

    resizeBL.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      resizing = true;
      startX = e.clientX;
      startY = e.clientY;

      const r = panel.getBoundingClientRect();
      startW = r.width;
      startH = r.height;
      startLeft = r.left;

      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseup", onUp, true);
    });




    panel.append(header, list);
    document.documentElement.appendChild(panel);

    makeDraggable(panel, header);
    setupResizePersistence(panel);
  }

  // ===== TOC logic =====
  function getAssistantBlocks() {
    const set = new Set();
    $$('article[role="article"]').forEach((a) => {
      if (a && a.textContent && !a.querySelector("textarea,input")) set.add(a);
    });
    $$('[data-message-author-role="assistant"]').forEach((el) => set.add(el));
    $$(".markdown, .prose").forEach((el) => {
      const container = el.closest('article,[data-message-author-role="assistant"]') || el;
      set.add(container);
    });
    return Array.from(set);
  }

  function summarizeFallback(el) {
    if (!el) return "Section";
    const strong = el.querySelector("strong,b");
    if (strong && strong.textContent.trim().length >= 6) return strong.textContent.trim();
    const li = el.querySelector("li");
    if (li) return li.textContent.trim();
    const txt = el.textContent || "";
    const sentence = txt.split(/(?<=[.!?])\s+/)[0] || txt.slice(0, 80);
    return (sentence || "Section").replace(/\s+/g, " ").trim();
  }

  function findHeadings(block) {
    const hs = $$("h1,h2,h3,h4,h5,h6", block)
      .map((h) => ({
        level: Number(h.tagName.slice(1)),
        text: (h.textContent || "").replace(/\s+/g, " ").trim(),
        node: h
      }))
      .filter((h) => h.text.length);

    if (hs.length) return hs;

    const content =
      block.querySelector('.markdown, .prose, [data-testid="conversation-turn"]') || block;
    return [{ level: 2, text: summarizeFallback(content), node: content }];
  }

  function ensureAnchor(node, base, i) {
    let target = node;
    if (!/^(H[1-6])$/.test((target.tagName || "").toUpperCase())) {
      target = node.closest('article,[data-message-author-role="assistant"],section,div') || node;
    }
    if (!target.id) target.id = `${base}-${i}-${Math.random().toString(36).slice(2, 8)}`;
    return target.id;
  }

  function rebuildTOC() {
    ensurePanel();
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const list = $("#cgpt-toc-list", panel);
    if (!list) return;

    const blocks = getAssistantBlocks();
    const entries = [];

    blocks.forEach((block, bIdx) => {
      const base = block.id || `cgpt-msg-${bIdx}`;
      if (!block.id) block.id = base;

      const heads = findHeadings(block);
      heads.forEach((h, i) => {
        const id = ensureAnchor(h.node, base, i);
        entries.push({ level: clamp(h.level || 2, 1, 6), text: h.text, id });
      });
    });

    const key = JSON.stringify(entries.map((e) => `${e.level}:${e.text}:${e.id}`));
    // Important: if panel was recreated, list is empty—so rebuild even if key matches.
    if (key === lastKey && list.childElementCount > 0) return;
    lastKey = key;

    list.innerHTML = "";
    if (!entries.length) {
      list.innerHTML =
        '<div style="opacity:.75">No headings found yet. Ask ChatGPT to use markdown headings (### …) for a richer TOC.</div>';
      return;
    }

    const ol = document.createElement("ol");
    entries.forEach((e) => {
      const li = document.createElement("li");
      li.dataset.level = String(e.level);
      li.title = e.text;
      li.textContent = e.text;

      li.addEventListener("click", () => {
        const target = document.getElementById(e.id);
        if (!target) return;
        try {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch {
          target.scrollIntoView(true);
        }
        target.classList.add("cgpt-pulse");
        setTimeout(() => target.classList.remove("cgpt-pulse"), 1200);
      });

      ol.appendChild(li);
    });

    list.appendChild(ol);
  }

  // ===== Boot / observer =====
  function scheduleBuild() {
    clearTimeout(debTimer);
    debTimer = setTimeout(rebuildTOC, 150);
  }

  function boot() {
    const host = location.hostname;
    const ok = /(^|\.)chatgpt\.com$/.test(host) || /(^|\.)chat\.openai\.com$/.test(host);
    if (!ok) return;

    if (sessionStorage.getItem("cgpt_toc_closed") === "1") showToggle();
    else ensurePanel();

    rebuildTOC();

    observer = new MutationObserver(() => scheduleBuild());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  boot();
})();
