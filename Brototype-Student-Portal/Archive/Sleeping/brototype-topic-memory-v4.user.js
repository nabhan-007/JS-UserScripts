// ==UserScript==
// @name         Brototype - Topic State Memory
// @namespace    http://tampermonkey.net/
// @version      4.1.5
// @description  Remembers expanded/collapsed topics, adds Expand All / Collapse All, scrolls to last-opened topic
// @author       NAABO
// @match        https://student.brototype.com/tasks/module/details*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=brototype.com
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  const LOG = "[TopicMemory]";
  const PREFIX = "brot_topic4_";
  let restoring = false;

  // ── Storage ──────────────────────────────────────────────────────

  function getModuleId() {
    const m = location.href.match(/id=([a-f0-9-]+)/i);
    return m ? m[1] : "default";
  }

  function key() {
    return PREFIX + getModuleId();
  }

  function lastKey() {
    return PREFIX + getModuleId() + "_last";
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(key())) || {};
    } catch {
      return {};
    }
  }

  function save(map) {
    localStorage.setItem(key(), JSON.stringify(map));
  }

  // ── DOM helpers ──────────────────────────────────────────────────

  function getContainers() {
    // Strategy A (stable): find h6 text-matched, walk up 3 levels to container
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

    // Strategy B (fallback): hash-based selector from MUI
    getContainers._usedFallback = true;
    return Array.from(document.querySelectorAll(".css-15fw8z6")).filter((c) => {
      const h6 = c.querySelector("h6.MuiTypography-h6");
      return h6 && /^topic\s+\d+/i.test(h6.textContent.trim());
    });
  }

  function getTitle(c) {
    const h6 = c.querySelector("h6.MuiTypography-h6");
    return h6 ? h6.textContent.trim() : null;
  }

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

  function isExpanded(c) {
    return c.children.length > 1;
  }

  // ── Toggle all ───────────────────────────────────────────────────

  function toggleAll(expand) {
    const containers = getContainers();
    const saved = load();
    const toToggle = containers.filter((c) => {
      const title = getTitle(c);
      if (!title) return false;
      return expand ? !isExpanded(c) : isExpanded(c);
    });
    if (toToggle.length === 0) return;

    restoring = true;
    toToggle.forEach((c, i) => {
      setTimeout(() => {
        clickHeader(c);
        const title = getTitle(c);
        if (title) {
          saved[title] = expand;
          if (expand) localStorage.setItem(lastKey(), title);
        }
        if (expand) {
          setTimeout(() => clickReadMore(c), 200);
        }
      }, i * 300);
    });

    setTimeout(
      () => {
        save(saved);
        restoring = false;
        updateCounter();
        console.log(LOG, expand ? "Expand All" : "Collapse All", "done");
      },
      toToggle.length * 300 + 300,
    );
  }

  function clickReadMore(container) {
    for (const sel of [
      "button",
      '[role="button"]',
      '[class*="css-"]',
      "span",
      "p",
      "div",
    ]) {
      for (const el of container.querySelectorAll(sel)) {
        if (el.textContent.trim() === "Read more") {
          el.click();
          return;
        }
      }
    }
  }

  // ── Controls ─────────────────────────────────────────────────────

  function findAnchor() {
    const btn = document.querySelector('[aria-label="Report An Issue"]');
    if (!btn) return null;
    const inner = btn.parentElement;
    if (!inner) return null;
    const outer = inner.parentElement;
    if (!outer) return null;
    return { outer, inner };
  }

  function updateCounter() {
    const el = document.getElementById("brot-topic-counter");
    if (!el) return;
    const containers = getContainers();
    const expanded = containers.filter(isExpanded).length;
    el.textContent = expanded + "/" + containers.length;
  }

  function addControls() {
    const old = document.getElementById("brot-topic-controls");
    if (old) old.remove();

    const tryInsert = () => {
      const anchor = findAnchor();
      if (!anchor) return false;
      const { outer, inner } = anchor;

      const panel = document.createElement("div");
      panel.id = "brot-topic-controls";
      panel.style.cssText =
        "display:inline-flex;gap:6px;margin-right:4px;align-items:center;user-select:none;";

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
        "transition:background 0.15s",
      ].join(";");

      const expandBtn = document.createElement("button");
      expandBtn.textContent = "\u25B8 Expand";
      expandBtn.style.cssText = btnStyle;
      expandBtn.addEventListener("mouseenter", () => {
        expandBtn.style.background = "#e8f0fe";
        expandBtn.style.borderColor = "#a0c4ff";
      });
      expandBtn.addEventListener("mouseleave", () => {
        expandBtn.style.background = "#fff";
        expandBtn.style.borderColor = "#d0d0d0";
      });
      expandBtn.onclick = () => toggleAll(true);

      const collapseBtn = document.createElement("button");
      collapseBtn.textContent = "\u25BE Collapse";
      collapseBtn.style.cssText = btnStyle;
      collapseBtn.addEventListener("mouseenter", () => {
        collapseBtn.style.background = "#fce8e8";
        collapseBtn.style.borderColor = "#ffa0a0";
      });
      collapseBtn.addEventListener("mouseleave", () => {
        collapseBtn.style.background = "#fff";
        collapseBtn.style.borderColor = "#d0d0d0";
      });
      collapseBtn.onclick = () => toggleAll(false);

      const counter = document.createElement("span");
      counter.id = "brot-topic-counter";
      const containers = getContainers();
      const expanded = containers.filter(isExpanded).length;
      counter.textContent = expanded + "/" + containers.length;
      counter.style.cssText =
        "font-size:11px;color:#888;margin-left:2px;font-weight:500;";

      panel.appendChild(expandBtn);
      panel.appendChild(collapseBtn);
      panel.appendChild(counter);
      outer.insertBefore(panel, inner);
      console.log(LOG, "controls added");
      return true;
    };

    if (tryInsert()) return;

    const obs = new MutationObserver(() => {
      if (tryInsert()) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 10000);
  }

  // ── Restore ──────────────────────────────────────────────────────

  function restore() {
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
      updateCounter();
      scrollToLast();
      return;
    }

    restoring = true;
    pending.forEach((c, i) => {
      setTimeout(() => clickHeader(c), i * 500);
    });

    setTimeout(
      () => {
        restoring = false;
        updateCounter();
        scrollToLast();
      },
      pending.length * 500 + 200,
    );
  }

  function scrollToLast() {
    const last = localStorage.getItem(lastKey());
    if (!last) return;
    const c = getContainers().find((c) => getTitle(c) === last);
    if (!c || !isExpanded(c)) return;
    setTimeout(() => {
      let scroller = c.parentElement;
      while (scroller && scroller !== document.body) {
        const style = getComputedStyle(scroller);
        if (style.overflowY === "auto" || style.overflowY === "scroll") {
          scroller.scrollTop = c.offsetTop - scroller.offsetTop - 100;
          return;
        }
        scroller = scroller.parentElement;
      }
      c.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 600);
  }

  // ── Click tracker ────────────────────────────────────────────────

  function attach() {
    getContainers().forEach((c) => {
      if (c.dataset.brotListener) return;
      c.dataset.brotListener = "1";
      const title = getTitle(c);
      if (!title) return;
      let lastClick = 0;
      c.addEventListener("click", function onClick(e) {
        if (restoring) return;
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
        console.log(LOG, title, "\u2192", saved[title]);
      });
    });
  }

  // ── DOM watch (survives React re-renders) ────────────────────────

  let controlsObserver = null;

  function watchControls() {
    if (controlsObserver) controlsObserver.disconnect();
    controlsObserver = new MutationObserver(() => {
      if (document.getElementById("brot-topic-controls")) return;
      const containers = getContainers();
      if (containers.length === 0) return;
      console.log(LOG, "re-init after DOM replacement");
      addControls();
      attach();
      let tries = 0;
      function waitRAF() {
        if (
          getContainers().every((c) => c.children.length >= 1) ||
          tries >= 20
        ) {
          restore();
          return;
        }
        tries++;
        requestAnimationFrame(waitRAF);
      }
      requestAnimationFrame(waitRAF);
    });
    controlsObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ── Init ─────────────────────────────────────────────────────────

  function init() {
    const containers = getContainers();
    const strategy = getContainers._usedFallback
      ? "fallback (hash)"
      : "primary (stable)";
    console.log(LOG, "init —", containers.length, "topics via", strategy);
    addControls();
    attach();
    restore();
    setTimeout(watchControls, 1000);
  }

  function waitForTopics(callback) {
    if (getContainers().length > 0) {
      setTimeout(callback, 800);
      return;
    }
    const obs = new MutationObserver(() => {
      if (getContainers().length > 0) {
        setTimeout(callback, 800);
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return obs;
  }

  // ── SPA navigation detection ─────────────────────────────────────

  let currentObs = null;

  function onUrlChange() {
    if (currentObs) currentObs.disconnect();
    currentObs = waitForTopics(init);
  }

  // Initial load
  currentObs = waitForTopics(init);

  // Listen for SPA navigation (pushState / replaceState)
  const origPush = history.pushState.bind(history);
  history.pushState = function () {
    origPush.apply(this, arguments);
    onUrlChange();
  };
  const origReplace = history.replaceState.bind(history);
  history.replaceState = function () {
    origReplace.apply(this, arguments);
    onUrlChange();
  };
  window.addEventListener("popstate", onUrlChange);
})();
