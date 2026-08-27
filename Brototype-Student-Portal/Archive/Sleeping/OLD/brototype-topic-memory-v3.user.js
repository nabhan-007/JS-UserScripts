// ==UserScript==
// @name         Brototype - Topic State Memory
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  Remembers expanded/collapsed topics, adds Expand All / Collapse All, scrolls to last-opened topic
// @author       You
// @match        https://student.brototype.com/tasks/module/details*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=brototype.com
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const LOG = "[TopicMemory]";
  const PREFIX = "brot_topic3_";
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
    return Array.from(document.querySelectorAll(".css-15fw8z6")).filter((c) => {
      const h6 = c.querySelector("h6.MuiTypography-h6.css-m3mo5c");
      return h6 && /^topic\s+\d+/i.test(h6.textContent.trim());
    });
  }

  function getTitle(c) {
    const h6 = c.querySelector("h6.MuiTypography-h6.css-m3mo5c");
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
    const content = c.children[1];
    if (!content) return false;
    const s = window.getComputedStyle(content);
    return (
      s.display !== "none" && s.maxHeight !== "0px" && s.visibility !== "hidden"
    );
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
    // "Read more" is a clickable text that expands truncated content
    for (const el of container.querySelectorAll(
      '[class*="css-"], span, p, div',
    )) {
      if (el.textContent.trim() === "Read more") {
        el.click();
      }
    }
  }

  // ── Controls ─────────────────────────────────────────────────────

  function findAnchor() {
    // The stable action bar sits beside the "Task Overview" heading.
    // It contains icon buttons with aria-labels.
    const btn = document.querySelector('[aria-label="Report An Issue"]');
    if (!btn) return null;
    // DOM: span → parent div.inner (holds both buttons) → parent div.outer
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
    if (document.getElementById("brot-topic-controls")) return;

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
    const pending = containers.filter((c) => {
      const t = getTitle(c);
      return t && saved[t];
    });

    if (pending.length === 0) {
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
    if (c) {
      setTimeout(
        () => c.scrollIntoView({ behavior: "smooth", block: "center" }),
        400,
      );
    }
  }

  // ── Click tracker ────────────────────────────────────────────────

  function attach() {
    getContainers().forEach((c) => {
      const title = getTitle(c);
      if (!title) return;
      c.addEventListener("click", function onClick(e) {
        if (restoring) return;
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
        const saved = load();
        saved[title] = !saved[title];
        save(saved);
        if (saved[title]) localStorage.setItem(lastKey(), title);
        updateCounter();
        console.log(LOG, title, "\u2192", saved[title]);
      });
    });
  }

  // ── Init ─────────────────────────────────────────────────────────

  function init() {
    console.log(LOG, "init");
    addControls();
    attach();
    restore();
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
