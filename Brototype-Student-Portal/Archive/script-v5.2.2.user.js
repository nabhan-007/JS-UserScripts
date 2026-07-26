// ==UserScript==
// @name         Brototype - Topic State Memory
// @namespace    http://tampermonkey.net/
// @version      5.2.2
// @description  Remembers which topics you've expanded or collapsed on Brototype module pages — survives page reloads, SPA navigation, and re-renders.
// @description  Features: Persistent state per topic, Expand All / Collapse All with live counter + automatic read-more expansion, translucent overlay during batch ops, auto-scroll to last expanded topic, upload-safe, SPA-aware. Zero config, zero dependencies.
// @author       Nabhan
// @match        https://student.brototype.com/tasks/module/details*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=brototype.com
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  // ── Config ────────────────────────────────────────────────

  // All localStorage keys use this prefix.
  // Change this number to reset saved state (e.g., after a breaking update).
  const PREFIX = "brot_topic5_";

  // Tag used in console.log so our messages are easy to spot.
  const LOG = "[TopicMemory]";

  // ── Overlay ─────────────────────────────────────────────────

  // Shows a translucent full-page overlay with a spinner and message
  // while the script is batch-clicking topics. Prevents the user
  // from interfering with staggered expand/collapse operations.

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
      { duration: 800, iterations: Infinity },
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

  // Extracts the module ID from the URL, e.g.
  // "https://...details?id=abc-123" → "abc-123"
  function getModuleId() {
    const m = location.href.match(/id=([a-f0-9-]+)/i);
    return m ? m[1] : "";
  }

  // Finds all topic container elements on the page.
  // Strategy A (primary): text-based via h6 content — survives MUI CSS changes.
  // Strategy B (fallback): hash-class-based — catches unusual DOM layouts.
  function getContainers() {
    // ── Strategy A: text-based (stable) ──
    const stable = Array.from(document.querySelectorAll("h6.MuiTypography-h6"))
      .filter((h) => /^topic\s+\d+/i.test(h.textContent.trim()))
      .map((h) => h.parentElement.parentElement.parentElement)
      .filter((c) => {
        if (!c || c.children.length < 1) return false;
        const h6 = c.querySelector("h6.MuiTypography-h6");
        return h6 && c.children[0].contains(h6);
      });

    if (stable.length > 0) {
      getContainers._usedFallback = false;
      return stable;
    }

    // ── Strategy B: fallback using hash class ──
    const fallback = Array.from(
      document.querySelectorAll(
        'div[class*="css-"] > div[class*="css-"] > div[class*="css-"]' +
          ' > div[class*="css-"]:not([class*="Mui"])',
      ),
    ).filter((c) => {
      const h6 = c.querySelector("h6.MuiTypography-h6");
      return h6 && /^topic\s+\d+/i.test(h6.textContent.trim());
    });

    getContainers._usedFallback = fallback.length > 0;
    return fallback;
  }
  getContainers._usedFallback = false;

  // Returns true if a topic container is expanded
  // (has a content div as children[1]).
  function isExpanded(c) {
    return c.children.length > 1;
  }

  // Reads the topic title from inside a container ("Topic 1", etc.)
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
    } catch {
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

  function findAnchor() {
    const btn = document.querySelector('[aria-label="Report An Issue"]');
    if (!btn) return null;
    const inner = btn.parentElement;
    const outer = inner.parentElement;
    return { outer, inner };
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
    const containers = getContainers();
    const toToggle = containers.filter((c) =>
      expand ? !isExpanded(c) : isExpanded(c),
    );

    if (toToggle.length === 0) return;

    showOverlay(expand ? "Expanding all\u2026" : "Collapsing all\u2026");

    toToggle.forEach((c, i) => {
      setTimeout(() => clickHeader(c), i * 300);
    });

    setTimeout(
      () => {
        if (expand) {
          toToggle.forEach((c) => clickReadMore(c));
        }

        updateCounter();
        hideOverlay();
        console.log(LOG, expand ? "Expand" : "Collapse", "All done");
      },
      toToggle.length * 300 + 400,
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

  function clickHeader(c) {
    const header = c.children[0];
    if (header) {
      header.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
          detail: 1,
        }),
      );
    }
  }

  function clickReadMore(container) {
    const header = container.children[0];
    Array.from(container.children).forEach((child) => {
      if (child === header) return;
      child
        .querySelectorAll('button, [role="button"], span, p, a')
        .forEach((el) => {
          if (
            el.textContent.trim().toLowerCase().includes("read more") &&
            el.offsetHeight > 0
          ) {
            el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

      let lastClick = 0;

      c.addEventListener("click", function onClick(e) {
        const now = Date.now();
        if (now - lastClick < 200) return;
        lastClick = now;

        let el = e.target;
        const header = c.children[0];
        let onHeader = false;
        while (el && el !== c) {
          if (el === header) {
            onHeader = true;
            break;
          }
          el = el.parentElement;
        }
        if (!onHeader) return;

        const newState = !isExpanded(c);
        const saved = load();
        saved[title] = newState;
        save(saved);

        if (newState) localStorage.setItem(lastKey(), title);

        setTimeout(updateCounter, 500);
        console.log(LOG, title, "\u2192", newState);
      });
    });
  }

  // ── Restore saved state ────────────────────────────────────

  let restoring = false;

  function restore() {
    if (restoring) return;
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
        scrollToLast();
        restoring = false;
      },
      pending.length * 200 + 300,
    );
  }

  // ── Scroll to last expanded topic ──────────────────────────

  function scrollToLast() {
    const containers = getContainers();
    if (containers.length === 0) { hideOverlay(); return; }

    const expanded = containers.filter(isExpanded).length;
    if (expanded === 0 || expanded === containers.length) { hideOverlay(); return; }

    const last = localStorage.getItem(lastKey());
    if (!last) { hideOverlay(); return; }

    const c = containers.find((el) => getTitle(el) === last);
    if (!c || !isExpanded(c)) { hideOverlay(); return; }

    setTimeout(() => {
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

  // ── DOM watch (survive React re-renders) ───────────────────

  let controlsObserver = null;
  let watchDebounce = null;

  function watchControls() {
    if (controlsObserver) controlsObserver.disconnect();

    controlsObserver = new MutationObserver(() => {
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

  // ── Init ───────────────────────────────────────────────────

  function init() {
    const containers = getContainers();
    const strategy = getContainers._usedFallback
      ? "fallback (hash)"
      : "primary (stable)";
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

  function onUrlChange() {
    if (controlsObserver) controlsObserver.disconnect();
    showOverlay("Restoring topics\u2026");

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
        console.log(LOG, "SPA navigation failed - forcing full reload");
        location.reload();
      }
    }

    waitForTopics();
  }

  // ── Kickoff ────────────────────────────────────────────────

  setTimeout(() => {
    if (getContainers().length > 0) {
      init();
    } else {
      showOverlay("Loading\u2026");
      let attempts = 0;

      function wait() {
        if (getContainers().length > 0) {
          init();
          return;
        }
        attempts++;
        if (attempts < 30) setTimeout(wait, 300);
        else hideOverlay();
      }

      wait();
    }
  }, 500);
})();
