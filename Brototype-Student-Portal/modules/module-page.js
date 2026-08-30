// ════════════════════════════════════════════════════════════
  // FEATURE — read-more
  // ════════════════════════════════════════════════════════════

  // Style-2 fix: expanded content can be the container's next sibling —
  // scan that instead of container.children when present.
  function clickReadMore(container) {
    const sib = container.nextElementSibling;
    const sibH6 = sib && sib.querySelector("h6.MuiTypography-h6");
    let targets = Array.from(container.children);
    if (sibH6 && !/^topic\s+\d+/i.test(sibH6.textContent.trim())) {
      targets = [sib];
    }
    targets.forEach((child) => {
      child.querySelectorAll("span, p, a").forEach((el) => {
        if (
          el.textContent.trim().toLowerCase().includes("read more") &&
          el.offsetHeight > 0 &&
          el.closest("button, [role='button']") === null
        ) {
          el.click();
        }
      });
      // Also check buttons/role=button directly
      child.querySelectorAll('button, [role="button"]').forEach((el) => {
        if (
          el.textContent.trim().toLowerCase().includes("read more") &&
          el.offsetHeight > 0
        ) {
          el.click();
        }
      });
    });
  }

  function initReadMore() {
    bus.on("batch:expanded", () => {
      // All expanded topics, not just the toggled ones — topics that were
      // already open before the batch keep their "Read more" otherwise.
      getContainers().filter(isExpanded).forEach(clickReadMore);
    });
  }

  // ════════════════════════════════════════════════════════════
  // FEATURE — batch controls (Expand/Collapse All + counter)
  // ════════════════════════════════════════════════════════════

  function findAnchor() {
    // Strategy 1: "Total Topics: N" overview row — insert panel inside
    // the flex row (right-aligned, before any action buttons).
    const totalTopicsP = Array.from(document.querySelectorAll("p")).find(
      (p) => /Total Topics:\s*\d+/i.test(p.textContent.trim()),
    );
    if (totalTopicsP) {
      let el = totalTopicsP;
      while (el && el.parentElement) {
        el = el.parentElement;
        if (el.classList && el.classList.contains("custom-scrollbar")) {
          const overviewRow = el.firstElementChild;
          if (overviewRow) {
            const secondChild = overviewRow.children[1] || null;
            return { outer: overviewRow, inner: secondChild, useMargin: true };
          }
        }
      }
    }

    // Strategy 2: Report An Issue button (fallback)
    const btn = document.querySelector('[aria-label="Report An Issue"]');
    if (btn) {
      const inner = btn.parentElement;
      const outer = inner.parentElement;
      return { outer, inner };
    }

    // Strategy 3: toolbar fallback
    const toolbars = document.querySelectorAll(
      '[class*="MuiToolbar"], [class*="toolbar"], [role="toolbar"]',
    );
    for (const bar of toolbars) {
      return { outer: bar, inner: bar.firstChild };
    }

    // Strategy 4: header fallback
    const header = document.querySelector(
      'header, [class*="Header"], [class*="header"], nav',
    );
    if (header) {
      const actions = header.querySelectorAll("button, [role='button']");
      if (actions.length > 0) {
        const last = actions[actions.length - 1];
        return { outer: last.parentElement, inner: last };
      }
    }

    return null;
  }

  let addControlsObserver = null;

  function disconnectInsertObserver() {
    if (addControlsObserver) {
      addControlsObserver.disconnect();
      addControlsObserver = null;
    }
  }

  // ── Visual theme for the control panel ─────────────────────────
  // Ported from the companion script: a single injected stylesheet
  // using color-mix(currentColor) so borders/hover states adapt to
  // light or dark pages automatically, no manual isDark detection
  // needed. Accent color drives the counter pill + focus ring.
  const CONTROL_THEME_ID = "brot-topic-control-theme";
  const CONTROL_ACCENT = "#1976d2";

  function injectControlTheme() {
    if (document.getElementById(CONTROL_THEME_ID)) return;
    const style = document.createElement("style");
    style.id = CONTROL_THEME_ID;
    style.textContent = `
      #brot-topic-controls {
        display: inline-flex !important;
        align-items: center;
        gap: 8px;
        color: inherit;
        user-select: none;
      }
      #brot-topic-controls .brot-topic-button-group {
        display: inline-flex;
        overflow: hidden;
        border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
        border-radius: 6px;
      }
      #brot-topic-controls button {
        min-height: 16px;
        padding: 4px 10px !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        color: inherit !important;
        font-weight: 600 !important;
        font-size: 14px !important;
        line-height: 1 !important;
        font-family: inherit !important;
        cursor: pointer;
        transition: background-color .15s ease, color .15s ease;
      }
      #brot-topic-controls button + button {
        border-left: 1px solid color-mix(in srgb, currentColor 18%, transparent) !important;
      }
      #brot-topic-controls button:hover {
        background: color-mix(in srgb, currentColor 12%, transparent) !important;
      }
      #brot-topic-controls button:focus:not(:focus-visible) {
        outline: none !important;
      }
      #brot-topic-controls button:focus-visible {
        outline: 2px solid ${CONTROL_ACCENT} !important;
        outline-offset: -2px;
      }
      #brot-topic-counter {
        display: inline-flex;
        align-items: center;
        min-height: 18px;
        box-sizing: border-box;
        padding: 2px 6px;
        border-radius: 999px;
        background: color-mix(in srgb, ${CONTROL_ACCENT} 16%, transparent) !important;
        color: ${CONTROL_ACCENT} !important;
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
      }
    `;
    document.head.appendChild(style);
  }

  function addControls() {
    disconnectInsertObserver();

    const old = document.getElementById("brot-topic-controls");
    if (old) old.remove();

    function tryInsert() {
      const anchor = findAnchor();
      if (!anchor) return false;

      const containers = getContainers();
      if (containers.length === 0) return false;
      const expanded = containers.filter(isExpanded).length;

      injectControlTheme();

      const panel = document.createElement("div");
      panel.id = "brot-topic-controls";
      panel.style.cssText = [
        anchor.useMargin ? "margin-left:auto" : "margin-right:4px",
        anchor.useMargin ? "margin-right:10px" : "",
      ].join(";");

      const segment = document.createElement("span");
      segment.className = "brot-topic-button-group";

      const expandBtn = document.createElement("button");
      expandBtn.type = "button";
      expandBtn.textContent = "\u25BE Expand";
      expandBtn.setAttribute("aria-label", "Expand all topics");
      expandBtn.onclick = () => toggleAll(true);

      const collapseBtn = document.createElement("button");
      collapseBtn.type = "button";
      collapseBtn.textContent = "\u25B4 Collapse";
      collapseBtn.setAttribute("aria-label", "Collapse all topics");
      collapseBtn.onclick = () => toggleAll(false);

      segment.appendChild(expandBtn);
      segment.appendChild(collapseBtn);
      panel.appendChild(segment);

      const counter = document.createElement("span");
      counter.id = "brot-topic-counter";
      counter.setAttribute("aria-live", "polite");
      counter.textContent = expanded + "/" + containers.length;
      counter.setAttribute(
        "aria-label",
        expanded + " of " + containers.length + " topics expanded",
      );
      panel.appendChild(counter);

      anchor.outer.insertBefore(panel, anchor.inner);
      return true;
    }

    if (!tryInsert()) {
      addControlsObserver = new MutationObserver(() => {
        if (tryInsert()) addControlsObserver.disconnect();
      });
      addControlsObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  // React re-renders can detach a scanned container before the staggered
  // click fires — re-resolve the live node by title at click time.
  function liveContainer(c) {
    if (c.isConnected) return c;
    const t = getTitle(c);
    return (t && getContainers().find((x) => getTitle(x) === t)) || null;
  }

  // H2 fix: click the container itself — React onClick lives here
  function clickHeader(c) {
    const live = liveContainer(c);
    if (live) live.click();
  }

  function toggleAll(expand) {
    if (Lock.busy) return;

    const containers = getContainers();
    const toToggle = containers.filter((c) =>
      expand ? !isExpanded(c) : isExpanded(c),
    );

    if (toToggle.length === 0) {
      if (expand) bus.emit("batch:expanded", { containers: [] });
      return;
    }

    // Race fix: hold the lock so no concurrent restore pass can
    // interleave clicks/writes with this batch using a stale snapshot.
    Lock.busy = true;

    showOverlay(expand ? "Expanding all\u2026" : "Collapsing all\u2026");

    // Stagger clicks using real elapsed time so background-tab throttling
    // doesn't collapse the delays into one burst.
    var batchStart = Date.now();
    toToggle.forEach((c, i) => {
      setTimeout(() => {
        var wait = i * 300 - (Date.now() - batchStart);
        if (wait > 0) setTimeout(() => clickHeader(c), wait);
        else clickHeader(c);
      }, i * 300);
    });

    // Fix Perf#6: use (N-1)*300+400 instead of N*300+400
    function finishBatch() {
      bus.emit("batch:expanded", { containers: toToggle });

      // Write the end-state once — the per-topic listener is muted
      // while Lock.busy, so the batch owns the save.
      const st = load();
      getContainers().forEach((c) => {
        const t = getTitle(c);
        if (t) st[t] = expand;
      });
      save(st);
      if (expand) {
        const lastT = getTitle(toToggle[toToggle.length - 1]);
        if (lastT) {
          try {
            localStorage.setItem(lastKey(), lastT);
          } catch (err) {
            console.warn(LOG, "localStorage lastKey save failed:", err);
          }
        }
      }
      updateCounter();
      Lock.busy = false;
      hideOverlay();

      // Deferred restore (requested while this batch ran)
      if (Lock.dirty) {
        Lock.dirty = false;
        restore();
      }

      console.log(LOG, expand ? "Expand" : "Collapse", "All done");
    }

    // The site can briefly render duplicate topic lists during re-renders,
    // so verify-and-repair loops until the DOM settles (bounded).
    let repairRounds = 0;
    function verifyRepair() {
      const bad = getContainers().filter((c) => {
        const t = getTitle(c);
        return t && isExpanded(c) !== expand;
      });
      if (bad.length && repairRounds < 3) {
        repairRounds++;
        bad.forEach((c) => clickHeader(c));
        setTimeout(verifyRepair, 700);
        return;
      }
      finishBatch();
    }

    setTimeout(verifyRepair, (toToggle.length - 1) * 300 + 400);
  }

  function updateCounter() {
    const el = document.getElementById("brot-topic-counter");
    if (!el) return;
    const containers = getContainers();
    const expanded = containers.filter(isExpanded).length;
    el.textContent = expanded + "/" + containers.length;
    el.setAttribute(
      "aria-label",
      expanded + " of " + containers.length + " topics expanded",
    );
  }

  // ════════════════════════════════════════════════════════════
  // FEATURE — state memory (per-topic listeners + restore)
  // ════════════════════════════════════════════════════════════

  function attach() {
    getContainers().forEach((c) => {
      if (c.dataset.brotListener) return;
      c.dataset.brotListener = "1";

      const title = getTitle(c);
      if (!title) return;

      // Find the header element (the cursor:pointer ancestor that is the h6's parent chain)
      // On both DOM styles, this is the depth-1 div that contains h6 + subtitle
      const topicH6 = c.querySelector("h6.MuiTypography-h6");
      let headerEl = null;
      if (topicH6) {
        headerEl = topicH6.parentElement;
        while (headerEl && headerEl.parentElement !== c) {
          headerEl = headerEl.parentElement;
        }
      }

      let lastClick = 0;

      c.addEventListener("click", function onClick(e) {
        const now = Date.now();
        // Only debounce synthetic clicks (our own c.click() batch ops).
        // Real user clicks are never swallowed — e.g. a fast click right
        // after Expand/Collapse All on the same topic still registers.
        if (!e.isTrusted && now - lastClick < 200) return;
        lastClick = now;

        // Batch ops (restore/toggleAll) write their end-state themselves;
        // per-click saves during a batch would record pre-render DOM and
        // corrupt saved state during hydration.
        if (Lock.busy) return;

        // Check click was on the header area (not on expanded content inside the container).
        // Synthetic clicks (c.click()) have target === c — treat those as header clicks too.
        let el = e.target;
        let onHeader = el === c;
        if (headerEl && !onHeader) {
          while (el && el !== c) {
            if (el === headerEl) {
              onHeader = true;
              break;
            }
            el = el.parentElement;
          }
        }
        if (!onHeader) return;

        const newState = !isExpanded(c);
        const saved = load();
        saved[title] = newState;
        save(saved);

        // M2 fix: wrap in try/catch
        try {
          if (newState) localStorage.setItem(lastKey(), title);
        } catch (err) {
          console.warn(LOG, "localStorage lastKey save failed:", err);
        }

        setTimeout(updateCounter, 500);
        console.log(LOG, title, "\u2192", newState);
      });
    });
  }

  function restore(attempt) {
    attempt = attempt || 0;
    if (Lock.busy) {
      // M1 fix: mark dirty so we re-restore after current pass finishes
      Lock.dirty = true;
      return;
    }
    Lock.busy = true;

    showOverlay("Restoring topics\u2026");
    const saved = load();
    const containers = getContainers();

    const toExpand = containers.filter((c) => {
      const t = getTitle(c);
      return t && saved[t] && !isExpanded(c);
    });

    const toCollapse = containers.filter((c) => {
      const t = getTitle(c);
      return t && saved[t] === false && isExpanded(c);
    });

    const pending = [...toExpand, ...toCollapse];

    if (pending.length === 0) {
      Lock.busy = false;
      updateCounter();
      bus.emit("restore:settled");
      return;
    }

    var restoreStart = Date.now();
    pending.forEach((c, i) => {
      setTimeout(() => {
        var wait = i * 200 - (Date.now() - restoreStart);
        const run = () => {
          const t = getTitle(c);
          if (!t || saved[t] == null) return;
          const live = liveContainer(c);
          if (!live) return;
          if (isExpanded(live) === Boolean(saved[t])) return;
          clickHeader(live);
        };
        if (wait > 0) setTimeout(run, wait);
        else run();
      }, i * 200);
    });

    setTimeout(
      () => {
        // React may miss clicks fired before hydration; retry mismatched topics
        const missed = getContainers().filter((c) => {
          const t = getTitle(c);
          if (!t || !(t in saved)) return false;
          return saved[t] ? !isExpanded(c) : isExpanded(c);
        });
        if (missed.length && attempt < 2) {
          Lock.busy = false;
          setTimeout(() => restore(attempt + 1), 1000);
          return;
        }

        updateCounter();
        Lock.busy = false;

        bus.emit("restore:done");

        // M1 fix: if DOM changed during restore, re-restore
        if (Lock.dirty) {
          Lock.dirty = false;
          restore();
        } else {
          bus.emit("restore:settled");
        }
      },
      pending.length * 200 + 300,
    );
  }

  // ════════════════════════════════════════════════════════════
  // FEATURE — auto-scroll to last expanded topic
  // ════════════════════════════════════════════════════════════

  // M4 fix: track scroll timeout, clear on nav/unload
  let scrollTimeout = null;

  function clearScrollTimeout() {
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
      scrollTimeout = null;
    }
  }

  function scrollToLast() {
    clearScrollTimeout();

    const containers = getContainers();
    if (containers.length === 0) {
      hideOverlay();
      return;
    }

    const expanded = containers.filter(isExpanded).length;
    if (expanded === 0 || expanded === containers.length) {
      hideOverlay();
      return;
    }

    let last = null;
    try {
      last = localStorage.getItem(lastKey());
    } catch (e) {
      console.warn(LOG, "localStorage lastKey read failed:", e);
    }
    if (!last) {
      hideOverlay();
      return;
    }

    const c = containers.find((el) => getTitle(el) === last);
    if (!c || !isExpanded(c)) {
      hideOverlay();
      return;
    }

    scrollTimeout = setTimeout(() => {
      scrollTimeout = null;
      let scroller = c.parentElement;
      while (scroller && scroller !== document.body) {
        const style = getComputedStyle(scroller);
        if (style.overflowY === "auto" || style.overflowY === "scroll") {
          scroller.scrollTop = c.offsetTop - scroller.offsetTop - 100;
          hideOverlay();
          return;
        }
        scroller = scroller.parentElement;
      }
      c.scrollIntoView({ behavior: "smooth", block: "center" });
      hideOverlay();
    }, 600);
  }

  function initAutoScroll() {
    bus.on("restore:settled", scrollToLast);
  }

  // ════════════════════════════════════════════════════════════
  // FEATURE — upload tip toast
  // ════════════════════════════════════════════════════════════

  // Shows a dismissible tip when the user clicks "Add Attachments" while
  // other topics are still open. Auto-scroll to the last upload only
  // works when the page is in a partially-expanded state, so the tip
  // tells the user to Collapse All then reopen the topic they uploaded to.

  let toastTimeout = null;

  function hideUploadTip() {
    if (toastTimeout) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }
    const el = document.getElementById("brot-upload-tip");
    if (el) el.remove();
  }

  function showUploadTip() {
    hideUploadTip();
    if (!isModulePage()) return;
    ensureBrotStyles();
    const containers = getContainers();
    if (containers.filter(isExpanded).length <= 1) return;

    const el = document.createElement("div");
    el.id = "brot-upload-tip";
    el.style.cssText = [
      "position:fixed",
      "top:16px",
      "left:50%",
      "transform:translateX(-50%)",
      "z-index:100000",
      "display:flex",
      "align-items:center",
      "gap:11px",
      "max-width:480px",
      "padding:11px 13px",
      "border:1px solid " + COLORS.borderLight,
      "border-radius:10px",
      "background:" + COLORS.surface,
      "box-shadow:0 6px 20px " + COLORS.shadowCard,
      "color:" + COLORS.textPrimary,
      "font:500 12.5px/1.45 Inter,sans-serif",
      "cursor:pointer",
      "user-select:none",
    ].join(";");

    const icon = document.createElement("span");
    icon.textContent = "\u26A0\uFE0F";
    icon.style.cssText = [
      "width:30px",
      "height:30px",
      "flex-shrink:0",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "border-radius:8px",
      "background:" + COLORS.warningIconBg,
      "font-size:14px",
    ].join(";");
    el.appendChild(icon);

    const msg = document.createElement("span");
    msg.textContent =
      "For the script to scroll to this upload on your next visit, tap Collapse, then reopen this topic.";
    el.appendChild(msg);

    const act = document.createElement("button");
    act.type = "button";
    act.className = "brot-tip-act";
    act.textContent = "Collapse all";
    act.addEventListener("click", (e) => {
      e.stopPropagation();
      hideUploadTip();
      // Close the site's upload dialog (its own Cancel) before collapsing
      const dlg = [...document.querySelectorAll('[role="dialog"]')].find(
        (d) => d.offsetHeight > 0,
      );
      if (dlg) {
        const cancel = [...dlg.querySelectorAll("div,span")].find(
          (x) =>
            x.textContent.trim() === "Cancel" &&
            x.children.length === 0 &&
            x.offsetParent,
        );
        if (cancel) cancel.click();
      }
      if (isModulePage()) toggleAll(false);
    });
    el.appendChild(act);

    const close = document.createElement("span");
    close.textContent = "\u2715";
    close.style.cssText = [
      "margin-left:2px",
      "color:" + COLORS.textFaint,
      "font-size:13px",
      "font-weight:700",
      "cursor:pointer",
      "flex-shrink:0",
      "padding:4px",
      "border-radius:8px",
    ].join(";");
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      hideUploadTip();
    });
    el.appendChild(close);

    el.addEventListener("click", hideUploadTip);
    document.body.appendChild(el);

    el.animate(
      [
        { transform: "translateX(-50%) translateY(-80px)", opacity: 0 },
        {
          transform: "translateX(-50%) translateY(0)",
          opacity: 1,
          offset: 0.7,
        },
        { transform: "translateX(-50%) translateY(0)", opacity: 1 },
      ],
      { duration: 400, easing: "ease-out", fill: "forwards" },
    ).finished.catch(() => {});

    toastTimeout = setTimeout(hideUploadTip, 10000);
  }

  function onUploadAreaClick(e) {
    if (!isModulePage()) return;
    let node = e.target;
    while (node && node !== document.body) {
      if (node.nodeType === 1 && getComputedStyle(node).cursor === "pointer") {
        if (/add\s+attachments/i.test(node.textContent || "")) {
          bus.emit("upload:area-click");
          return;
        }
      }
      node = node.parentElement;
    }
  }

  function initUploadTip() {
    bus.on("upload:area-click", () => setTimeout(showUploadTip, 50));
  }

  document.addEventListener("click", onUploadAreaClick, true);