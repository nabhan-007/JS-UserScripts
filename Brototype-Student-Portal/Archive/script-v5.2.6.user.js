// ==UserScript==
// @name         Brototype - Topic State Memory
// @namespace    http://tampermonkey.net/
// @version      5.2.6
// @description  Remembers which topics you've expanded or collapsed on Brototype module pages — survives page reloads, SPA navigation, and re-renders. Persistent state per topic, Expand All / Collapse All with live counter + automatic read-more expansion, translucent overlay during batch ops, auto-scroll to last expanded topic, upload-safe, SPA-aware. Zero config, zero dependencies.
// @author       Nabhan
// @match        https://student.brototype.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=brototype.com
// @grant        none
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/nabhan-007/JS-UserScripts/main/Brototype-Student-Portal/script.user.js
// @downloadURL  https://raw.githubusercontent.com/nabhan-007/JS-UserScripts/main/Brototype-Student-Portal/script.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ── Config ────────────────────────────────────────────────

  const PREFIX = "brot_topic5_";
  const LOG = "[TopicMemory]";

  // The script now runs on the whole domain (see @match). Only act on
  // module details pages; the SPA watchers stay alive everywhere so
  // navigating into a module still triggers init.
  function isModulePage() {
    return /^\/tasks\/module\/details([/?]|$)/.test(location.pathname);
  }

  // ── Overlay ─────────────────────────────────────────────────

  let overlayTimeout = null;
  let overlaySpin = null;

  function showOverlay(text) {
    hideOverlay();

    const el = document.createElement("div");
    el.id = "brot-overlay";
    el.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:99999",
      "background:rgba(0,0,0,0.4)",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "gap:12px",
      "cursor:wait",
    ].join(";");

    const spinner = document.createElement("div");
    spinner.style.cssText = [
      "width:36px",
      "height:36px",
      "border:3px solid rgba(255,255,255,0.25)",
      "border-top-color:#fff",
      "border-radius:50%",
    ].join(";");

    overlaySpin = spinner.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      { duration: 800, iterations: Infinity }
    );

    const label = document.createElement("div");
    label.textContent = text || "Working\u2026";
    label.style.cssText =
      "color:#fff;font:15px/1.4 sans-serif;font-weight:500;";

    el.appendChild(spinner);
    el.appendChild(label);
    document.body.appendChild(el);

    overlayTimeout = setTimeout(hideOverlay, 30000);
  }

  function hideOverlay() {
    if (overlayTimeout) {
      clearTimeout(overlayTimeout);
      overlayTimeout = null;
    }
    if (overlaySpin) {
      overlaySpin.cancel();
      overlaySpin = null;
    }
    const el = document.getElementById("brot-overlay");
    if (el) el.remove();
  }

  // ── DOM helpers ────────────────────────────────────────────

  function getModuleId() {
    const m = location.href.match(/id=([a-f0-9-]+)/i);
    if (m) return m[1];
    let h = 0;
    for (const ch of location.pathname) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return "u" + h.toString(36);
  }

  // H3 fix: dynamic DOM climb instead of hard-coded 3 levels.
  // Walks up from h6 to find the first ancestor that has ≥2 children
  // and contains the h6 in its first child.
  let usedFallback = false;

  function getContainers() {
    // Strategy A: text-based (stable)
    const stable = Array.from(document.querySelectorAll("h6.MuiTypography-h6"))
      .filter((h) => /^topic\s+\d+/i.test(h.textContent.trim()))
      .map((h) => findContainerFromH6(h))
      .filter(Boolean);

    if (stable.length > 0) {
      usedFallback = false;
      return stable;
    }

    // Strategy B: fallback using hash class
    const fallback = Array.from(
      document.querySelectorAll(
        'div[class*="css-"] > div[class*="css-"] > div[class*="css-"]' +
          ' > div[class*="css-"]:not([class*="Mui"])'
      )
    ).filter((c) => {
      const h6 = c.querySelector("h6.MuiTypography-h6");
      return h6 && /^topic\s+\d+/i.test(h6.textContent.trim());
    });

    usedFallback = fallback.length > 0;
    return fallback;
  }

  // H3 fix: walk up from h6 to find the topic container dynamically.
  // Skips the first cursor:pointer ancestor (header div) and returns
  // the second (the actual clickable topic container with React onClick).
  function findContainerFromH6(h6) {
    let el = h6.parentElement;
    let foundPointer = false;
    while (el && el !== document.body) {
      if (getComputedStyle(el).cursor === "pointer") {
        if (!foundPointer) {
          foundPointer = true;
        } else {
          return el;
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  // Detects expanded state across two DOM styles:
  // 1. Module 10: content is a child of the container (child count changes)
  // 2. Miscellaneous: content is a sibling of the container (child count stable)
  // Both detected by: does a non-topic h6 exist inside the container (style 1)
  // or as the next sibling (style 2)?
  function isExpanded(c) {
    // Style 1: expanded content inside the container
    for (const child of c.children) {
      const h6 = child.querySelector("h6.MuiTypography-h6");
      if (h6 && !/^topic\s+\d+/i.test(h6.textContent.trim())) {
        return child.offsetHeight > 0;
      }
    }
    // Style 2: expanded content as next sibling of the container
    const next = c.nextElementSibling;
    if (next) {
      const h6 = next.querySelector("h6.MuiTypography-h6");
      if (h6 && !/^topic\s+\d+/i.test(h6.textContent.trim())) {
        return next.offsetHeight > 0;
      }
    }
    return false;
  }

  function getTitle(c) {
    const h6 = c.querySelector("h6.MuiTypography-h6");
    return h6 ? h6.textContent.trim() : "";
  }

  // ── State management ───────────────────────────────────────

  function moduleKey() {
    return PREFIX + getModuleId();
  }

  function lastKey() {
    return PREFIX + getModuleId() + "_last";
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(moduleKey())) || {};
    } catch (e) {
      console.warn(LOG, "localStorage parse failed:", e);
      return {};
    }
  }

  function save(state) {
    try {
      localStorage.setItem(moduleKey(), JSON.stringify(state));
    } catch (e) {
      console.warn(LOG, "localStorage save failed:", e);
    }
  }

  // ── UI Controls ────────────────────────────────────────────

  // M5 fix: fallback anchor strategies
  function findAnchor() {
    // Strategy 1: Report An Issue button (primary)
    const btn = document.querySelector('[aria-label="Report An Issue"]');
    if (btn) {
      const inner = btn.parentElement;
      const outer = inner.parentElement;
      return { outer, inner };
    }

    // Strategy 2: any toolbar-like container with inline-flex or flex
    const toolbars = document.querySelectorAll(
      '[class*="MuiToolbar"], [class*="toolbar"], [role="toolbar"]'
    );
    for (const bar of toolbars) {
      return { outer: bar, inner: bar.firstChild };
    }

    // Strategy 3: top-right action area (last flex child of main header)
    const header = document.querySelector(
      'header, [class*="Header"], [class*="header"], nav'
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

  function addControls() {
    if (addControlsObserver) {
      addControlsObserver.disconnect();
      addControlsObserver = null;
    }

    const old = document.getElementById("brot-topic-controls");
    if (old) old.remove();

    function tryInsert() {
      const anchor = findAnchor();
      if (!anchor) return false;

      const containers = getContainers();
      const expanded = containers.filter(isExpanded).length;

      const panel = document.createElement("div");
      panel.id = "brot-topic-controls";
      panel.style.cssText = [
        "display:inline-flex",
        "gap:6px",
        "margin-right:4px",
        "align-items:center",
        "user-select:none",
      ].join(";");

      const btnStyle = [
        "font-size:11px",
        "font-weight:600",
        "line-height:1",
        "padding:4px 8px",
        "border:1px solid #d0d0d0",
        "border-radius:6px",
        "cursor:pointer",
        "display:inline-flex",
        "align-items:center",
        "gap:2px",
        "color:#555",
        "background:#fff",
      ].join(";");

      const expandBtn = document.createElement("button");
      expandBtn.textContent = "\u25B8 Expand";
      expandBtn.style.cssText = btnStyle;
      expandBtn.onclick = () => toggleAll(true);

      const collapseBtn = document.createElement("button");
      collapseBtn.textContent = "\u25BE Collapse";
      collapseBtn.style.cssText = btnStyle;
      collapseBtn.onclick = () => toggleAll(false);

      const counter = document.createElement("span");
      counter.id = "brot-topic-counter";
      counter.textContent = expanded + "/" + containers.length;
      counter.style.cssText = "font-size:11px;color:#888;margin-left:2px;";

      panel.appendChild(expandBtn);
      panel.appendChild(collapseBtn);
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

  // ── Toggle All / Counter ────────────────────────────────────

  function toggleAll(expand) {
    if (restoring) return;

    const containers = getContainers();
    const toToggle = containers.filter((c) =>
      expand ? !isExpanded(c) : isExpanded(c)
    );

    if (toToggle.length === 0) return;

    showOverlay(expand ? "Expanding all\u2026" : "Collapsing all\u2026");

    toToggle.forEach((c, i) => {
      setTimeout(() => clickHeader(c), i * 300);
    });

    // Fix Perf#6: use (N-1)*300+400 instead of N*300+400
    setTimeout(
      () => {
        if (expand) {
          toToggle.forEach((c) => clickReadMore(c));
        }

        updateCounter();
        hideOverlay();
        console.log(LOG, expand ? "Expand" : "Collapse", "All done");
      },
      (toToggle.length - 1) * 300 + 400
    );
  }

  function updateCounter() {
    const el = document.getElementById("brot-topic-counter");
    if (!el) return;
    const containers = getContainers();
    const expanded = containers.filter(isExpanded).length;
    el.textContent = expanded + "/" + containers.length;
  }

  // ── Click simulation ───────────────────────────────────────

  // H2 fix: click the container itself — React onClick lives here
  function clickHeader(c) {
    c.click();
  }

  // Fix: scope clickReadMore to non-header content children only
  function clickReadMore(container) {
    const topicH6 = container.querySelector("h6.MuiTypography-h6");
    let headerEl = null;
    if (topicH6) {
      headerEl = topicH6.parentElement;
      while (headerEl && headerEl.parentElement !== container) {
        headerEl = headerEl.parentElement;
      }
    }
    Array.from(container.children).forEach((child) => {
      if (headerEl && child === headerEl) return;
      child.querySelectorAll("span, p, a").forEach((el) => {
        if (
          el.textContent.trim().toLowerCase().includes("read more") &&
          el.offsetHeight > 0 &&
          el.closest("button, [role='button']") === null
        ) {
          const btn = el.closest("button, [role='button']");
          if (btn) {
            btn.click();
          } else {
            el.click();
          }
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

  // ── Event handling ─────────────────────────────────────────

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

  // ── Restore saved state ────────────────────────────────────

  let restoring = false;
  let restoreDirty = false;

  function restore() {
    if (restoring) {
      // M1 fix: mark dirty so we re-restore after current pass finishes
      restoreDirty = true;
      return;
    }
    restoring = true;

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
      restoring = false;
      updateCounter();
      scrollToLast();
      return;
    }

    pending.forEach((c, i) => {
      setTimeout(() => clickHeader(c), i * 200);
    });

    setTimeout(
      () => {
        updateCounter();
        restoring = false;

        // M1 fix: if DOM changed during restore, re-restore
        if (restoreDirty) {
          restoreDirty = false;
          restore();
        } else {
          scrollToLast();
        }
      },
      pending.length * 200 + 300
    );
  }

  // ── Scroll to last expanded topic ──────────────────────────

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

  // ── Upload tip toast ────────────────────────────────────────

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
      "gap:10px",
      "max-width:480px",
      "padding:12px 12px 12px 16px",
      "border-radius:8px",
      "border-left:5px solid #f59e0b",
      "background:#fff",
      "color:#1f2937",
      "font:14px/1.5 sans-serif",
      "font-weight:600",
      "box-shadow:0 6px 24px rgba(0,0,0,0.35)",
      "cursor:pointer",
      "user-select:none",
    ].join(";");

    const msg = document.createElement("span");
    msg.textContent =
      "For the script to scroll to this upload on your next visit, tap Collapse, then reopen this topic.";
    el.appendChild(msg);

    const close = document.createElement("span");
    close.textContent = "\u2715";
    close.style.cssText = [
      "margin-left:4px",
      "color:#9ca3af",
      "font-size:14px",
      "font-weight:700",
      "cursor:pointer",
      "flex-shrink:0",
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
      { duration: 400, easing: "ease-out", fill: "forwards" }
    )
      .finished.then(() => {
        el.animate(
          [
            { transform: "translateX(-50%) scale(1)" },
            { transform: "translateX(-50%) scale(1.03)" },
            { transform: "translateX(-50%) scale(1)" },
          ],
          { duration: 300, easing: "ease-in-out" }
        );
      })
      .catch(() => {});

    toastTimeout = setTimeout(hideUploadTip, 10000);
  }

  function onUploadAreaClick(e) {
    if (!isModulePage()) return;
    let node = e.target;
    while (node && node !== document.body) {
      if (node.nodeType === 1 && getComputedStyle(node).cursor === "pointer") {
        if (/add\s+attachments/i.test(node.textContent || "")) {
          setTimeout(showUploadTip, 50);
          return;
        }
      }
      node = node.parentElement;
    }
  }

  document.addEventListener("click", onUploadAreaClick, true);

  // ── DOM watch (survive React re-renders) ───────────────────

  let controlsObserver = null;
  let watchDebounce = null;

  function watchControls() {
    if (controlsObserver) controlsObserver.disconnect();

    controlsObserver = new MutationObserver((mutations) => {
      // Fix Perf#5: skip if controls still exist and topic count unchanged
      const controlsExist = !!document.getElementById("brot-topic-controls");
      const hasTopics = getContainers().length > 0;
      if (controlsExist && hasTopics) return;

      if (watchDebounce) clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => {
        if (document.getElementById("brot-topic-controls")) return;

        const containers = getContainers();
        if (containers.length === 0) return;

        console.log(LOG, "re-init after DOM replacement");

        addControls();
        attach();

        let tries = 0;

        function waitRAF() {
          const valid = getContainers().every((c) => c.children.length >= 1);
          if (valid || tries >= 20) {
            restore();
            return;
          }
          tries++;
          requestAnimationFrame(waitRAF);
        }
        requestAnimationFrame(waitRAF);
      }, 200);
    });

    controlsObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function disconnectAllObservers() {
    if (controlsObserver) {
      controlsObserver.disconnect();
      controlsObserver = null;
    }
    if (addControlsObserver) {
      addControlsObserver.disconnect();
      addControlsObserver = null;
    }
    if (watchDebounce) {
      clearTimeout(watchDebounce);
      watchDebounce = null;
    }
    clearScrollTimeout();
  }

  // ── Init ───────────────────────────────────────────────────

  function init() {
    if (!isModulePage()) return;
    const containers = getContainers();
    const strategy = usedFallback ? "fallback (hash)" : "primary (stable)";
    console.log(LOG, "init \u2014", containers.length, "topics via", strategy);

    addControls();
    attach();
    restore();

    setTimeout(watchControls, 1000);
  }

  // ── SPA navigation ─────────────────────────────────────────

  const origPushState = history.pushState;
  history.pushState = function (...args) {
    origPushState.apply(this, args);
    onUrlChange();
  };

  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    onUrlChange();
  };

  window.addEventListener("popstate", onUrlChange);

  // L3 fix: cleanup on page unload
  window.addEventListener("unload", () => {
    document.removeEventListener("click", onUploadAreaClick, true);
    hideUploadTip();
    disconnectAllObservers();
  });

  function onUrlChange() {
    disconnectAllObservers();
    hideOverlay();

    // Left the module page — remove controls and do nothing
    if (!isModulePage()) {
      const controls = document.getElementById("brot-topic-controls");
      if (controls) controls.remove();
      return;
    }

    let attempts = 0;

    function waitForTopics() {
      if (getContainers().length > 0) {
        setTimeout(init, 800);
        return;
      }
      attempts++;
      if (attempts < 30) {
        setTimeout(waitForTopics, 300);
      } else {
        console.log(LOG, "SPA navigation - topics not found, staying idle");
        hideOverlay();
      }
    }

    waitForTopics();
  }

  // ── Kickoff ────────────────────────────────────────────────

  setTimeout(() => {
    // Not a module page — stay idle; SPA watchers will handle entering one
    if (!isModulePage()) return;
    if (getContainers().length > 0) {
      init();
    } else {
      showOverlay("Loading\u2026");
      let attempts = 0;

      const wait = function () {
        if (getContainers().length > 0) {
          init();
          return;
        }
        attempts++;
        if (attempts < 30) setTimeout(wait, 300);
        else hideOverlay();
      };

      wait();
    }
  }, 500);
})();
