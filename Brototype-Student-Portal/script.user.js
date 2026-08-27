// ==UserScript==
// @name         MNM Portal Companion for Brototype
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Remembers which topics you've expanded or collapsed on Brototype module pages — survives page reloads, SPA navigation, and re-renders. Persistent state per topic, Expand All / Collapse All with live counter + automatic read-more expansion, translucent overlay during batch ops, auto-scroll to last expanded topic, upload-safe, SPA-aware. Optional exam-stats extras: delusion mode (100% pass rate) and a last-5-exams card. Zero config, zero dependencies.
// @author       Nabhan
// @match        https://student.brototype.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=brototype.com
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  // Modular layout: CORE (config, event bus, lock, overlay, DOM finder,
  // state store) → FEATURES (read-more, batch controls, state memory,
  // auto-scroll, upload tip, settings UI) → RUNTIME (teardown registry,
  // DOM watch, SPA, init). Features talk through the bus, never into
  // each other, so one fix can't ripple sideways.

  // ════════════════════════════════════════════════════════════
  // CORE — config & settings
  // ════════════════════════════════════════════════════════════

  const PREFIX = "brot_topic5_";
  const LOG = "[MNM Companion]";
  const SETTINGS_KEY = "brot_settings";
  const DEFAULT_SETTINGS = {
    loadingImage: false,
    examStats: "normal", // "normal" | "delusion" | "last5"
  };

  function loadSettings() {
    try {
      return Object.assign(
        {},
        DEFAULT_SETTINGS,
        JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {},
      );
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {
      console.warn(LOG, "settings save failed:", e);
    }
  }

  // The script now runs on the whole domain (see @match). Only act on
  // module details pages; the SPA watchers stay alive everywhere so
  // navigating into a module still triggers init.
  function isModulePage() {
    return /^\/tasks\/module\/details([/?]|$)/.test(location.pathname);
  }

  function isExamsPage() {
    return /^\/exams([/?]|$)/.test(location.pathname);
  }

  // ════════════════════════════════════════════════════════════
  // CORE — event bus
  // ════════════════════════════════════════════════════════════

  const bus = {
    map: {},
    on(evt, fn) {
      (this.map[evt] = this.map[evt] || []).push(fn);
    },
    emit(evt, data) {
      (this.map[evt] || []).forEach((fn) => {
        try {
          fn(data);
        } catch (e) {
          console.warn(LOG, "listener failed:", evt, e);
        }
      });
    },
  };

  // Events:
  //   batch:expanded  { containers } — Expand All finished expanding
  //   restore:done    — restore pass finished clicking topics
  //   restore:settled — restore fully settled (safe to scroll)
  //   upload:area-click — user clicked an "Add Attachments" area

  // ════════════════════════════════════════════════════════════
  // CORE — busy lock (shared by batch ops and restore passes)
  // ════════════════════════════════════════════════════════════

  const Lock = {
    busy: false,
    dirty: false,
  };

  // ════════════════════════════════════════════════════════════
  // CORE — overlay
  // ════════════════════════════════════════════════════════════

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

    if (loadSettings().loadingImage) {
      const img = document.createElement("img");
      img.src =
        "https://raw.githubusercontent.com/nabhan-007/JS-UserScripts/main/Brototype-Student-Portal/assets/aniya-nil.png";
      img.alt = "";
      img.style.cssText = [
        "width:min(320px,70vw)",
        "display:block",
        "user-select:none",
        "pointer-events:none",
      ].join(";");
      img.addEventListener("error", () => img.remove());

      overlaySpin = img.animate(
        [{ opacity: 0.7 }, { opacity: 1 }, { opacity: 0.7 }],
        { duration: 1600, iterations: Infinity },
      );

      el.appendChild(img);
    } else {
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

      el.appendChild(spinner);
    }

    const label = document.createElement("div");
    label.textContent = text || "Working\u2026";
    label.style.cssText =
      "color:#fff;font:15px/1.4 sans-serif;font-weight:500;";

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

  // ════════════════════════════════════════════════════════════
  // CORE — DOM finder
  // ════════════════════════════════════════════════════════════

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
          ' > div[class*="css-"]:not([class*="Mui"])',
      ),
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

  // ════════════════════════════════════════════════════════════
  // CORE — state store
  // ════════════════════════════════════════════════════════════

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

  // ════════════════════════════════════════════════════════════
  // CORE — shared styles (used by settings modal + upload tip)
  // ════════════════════════════════════════════════════════════

  function ensureBrotStyles() {
    if (document.getElementById("brot-styles")) return;
    const st = document.createElement("style");
    st.id = "brot-styles";
    st.textContent = [
      "#brot-settings-backdrop .brot-card{background:#fff;border:1px solid #e6e6e6;",
      "border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,0.08);width:400px;",
      "max-width:92vw;max-height:86vh;overflow:auto;padding:24px;",
      "font:13.5px/1.5 Inter,sans-serif;color:#1a1a1a;}",
      "#brot-settings-backdrop .brot-trow{display:flex;align-items:center;gap:14px;",
      "padding:10px 2px;cursor:pointer;}",
      "#brot-settings-backdrop .brot-trow:hover{background:#fafafa;}",
      "#brot-settings-backdrop .brot-trow+.brot-trow{border-top:1px solid #efefef;}",
      "#brot-settings-backdrop .brot-sec{font-size:10.5px;font-weight:700;",
      "text-transform:uppercase;letter-spacing:0.9px;color:#b8b8b8;margin:20px 0 6px;}",
      "#brot-settings-backdrop .brot-sdgrid{display:grid;grid-template-columns:1fr 1fr;",
      "gap:8px;margin-top:4px;}",
      "#brot-settings-backdrop .brot-sd{border:1px solid #e2e2e2;background:#fff;",
      "border-radius:8px;padding:9px 10px;font:12px/1.35 Inter,sans-serif;color:#444;",
      "cursor:pointer;text-align:left;transition:background 0.12s,border-color 0.12s;}",
      "#brot-settings-backdrop .brot-sd:hover{background:#f7f7f7;border-color:#d5d5d5;}",
      "#brot-settings-backdrop .brot-sd .brot-k{display:block;font-size:12.5px;",
      "font-weight:650;color:#1a1a1a;margin-bottom:1px;}",
      "#brot-settings-backdrop .brot-sd.brot-danger{border-color:#f0cdcd;background:#fdf7f6;}",
      "#brot-settings-backdrop .brot-sd.brot-danger:hover{background:#fbeeed;border-color:#e8b7b7;}",
      "#brot-settings-backdrop .brot-sd.brot-danger .brot-k{color:#c0392b;}",
      "#brot-settings-backdrop a.brot-sd{display:block;text-decoration:none;}",
      "#brot-settings-backdrop .brot-contact{display:flex;align-items:center;gap:4px;",
      "padding:6px 10px;border:1px solid #e2e2e2;background:#fff;border-radius:7px;",
      "font:600 12px/1 Inter,sans-serif;color:#1a1a1a;cursor:pointer;flex-shrink:0;",
      "transition:background 0.12s,border-color 0.12s;}",
      "#brot-settings-backdrop .brot-contact:hover{background:#f7f7f7;border-color:#d5d5d5;}",
      "#brot-settings-backdrop .brot-contact .brot-arr{color:#8a8a8a;font-weight:400;}",
      "#brot-settings-backdrop .brot-contact:hover .brot-arr{color:#333;}",
      "#brot-settings-backdrop .brot-done{display:block;width:100%;margin-top:18px;",
      "padding:11px;border:none;border-radius:8px;background:#111;color:#fff;",
      "font:650 13.5px/1.2 Inter,sans-serif;cursor:pointer;transition:background 0.15s;}",
      "#brot-settings-backdrop .brot-done:hover{background:#333;}",
      "#brot-settings-backdrop .brot-foot{margin-top:18px;padding-top:12px;",
      "border-top:1px solid #efefef;font-size:11px;color:#b8b8b8;",
      "display:flex;justify-content:space-between;align-items:center;}",
      "#brot-settings-backdrop .brot-foot kbd{font-family:inherit;background:#f2f2f2;",
      "border:1px solid #e4e4e4;border-radius:4px;padding:1px 5px;font-size:10px;color:#888;}",
      ".brot-switch{position:relative;display:inline-block;width:34px;height:20px;",
      "flex-shrink:0;cursor:pointer;}",
      ".brot-switch input{opacity:0;width:0;height:0;position:absolute;}",
      ".brot-switch .brot-track{position:absolute;inset:0;background:#e2e2e2;",
      "border-radius:6px;transition:background 0.15s;}",
      ".brot-switch .brot-thumb{position:absolute;top:3px;left:3px;width:14px;height:14px;",
      "border-radius:4px;background:#fff;transition:transform 0.15s;}",
      ".brot-switch input:checked ~ .brot-track{background:#111;}",
      ".brot-switch input:checked ~ .brot-track .brot-thumb{transform:translateX(14px);}",
      ".brot-tip-act{border:none;background:#111;color:#fff;font:650 12px/1 Inter,sans-serif;",
      "padding:8px 12px;border-radius:7px;cursor:pointer;flex-shrink:0;",
      "transition:background 0.15s;}",
      ".brot-tip-act:hover{background:#333;}",
    ].join("\n");
    document.head.appendChild(st);
  }
  // ════════════════════════════════════════════════════════════
  // FEATURE — settings UI (profile-popover entry + modal)
  // ════════════════════════════════════════════════════════════
  // Global: the header popover exists on every page, not just modules.
  // Anchored by stable text ("Theme Mode"), never by MUI hash classes.

  let settingsObserver = null;
  let settingsScanTimer = null;

  function injectSettingsRow(popover) {
    if (popover.querySelector("#brot-settings-row")) return;
    const rows = Array.from(popover.querySelectorAll("li"));
    const profileRow = rows.find((li) =>
      /my profile/i.test(li.textContent || ""),
    );
    const logoutRow = rows.find((li) =>
      /log\s?out/i.test(li.textContent || ""),
    );
    if (!profileRow || !logoutRow) return;

    const row = profileRow.cloneNode(true);
    row.id = "brot-settings-row";
    const label = Array.from(row.querySelectorAll("p")).find((p) =>
      /my profile/i.test(p.textContent || ""),
    );
    if (label) label.textContent = "MNM Script Settings";
    const svg = row.querySelector("svg");
    if (svg) {
      const gear = document.createElement("span");
      gear.textContent = "\u2699\uFE0E";
      gear.style.cssText = "font-size:20px;line-height:1;display:inline-block;";
      svg.replaceWith(gear);
    }
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      openSettingsModal();
    });
    logoutRow.parentElement.insertBefore(row, logoutRow);
  }

  function scanForSettingsPopover() {
    const papers = document.querySelectorAll(
      ".MuiPopover-root .MuiPaper-root, .MuiModal-root .MuiPaper-root",
    );
    for (let i = 0; i < papers.length; i++) {
      if ((papers[i].textContent || "").indexOf("Theme Mode") !== -1) {
        injectSettingsRow(papers[i]);
        return;
      }
    }
  }

  function watchSettingsPopover() {
    if (settingsObserver) return;
    settingsObserver = new MutationObserver(() => {
      if (settingsScanTimer) clearTimeout(settingsScanTimer);
      settingsScanTimer = setTimeout(scanForSettingsPopover, 150);
    });
    settingsObserver.observe(document.body, { childList: true, subtree: true });
  }

  function destroySettingsWatcher() {
    if (settingsObserver) {
      settingsObserver.disconnect();
      settingsObserver = null;
    }
    if (settingsScanTimer) {
      clearTimeout(settingsScanTimer);
      settingsScanTimer = null;
    }
  }

  function settingsEscHandler(e) {
    if (e.key === "Escape") closeSettingsModal();
  }

  function closeSettingsModal() {
    const b = document.getElementById("brot-settings-backdrop");
    if (b) b.remove();
    document.removeEventListener("keydown", settingsEscHandler, true);
  }

  function openSettingsModal() {
    closeSettingsModal();
    ensureBrotStyles();

    const backdrop = document.createElement("div");
    backdrop.id = "brot-settings-backdrop";
    backdrop.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:100001",
      "background:rgba(0,0,0,0.5)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
    ].join(";");

    const card = document.createElement("div");
    card.className = "brot-card";

    const trow = document.createElement("div");
    trow.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;";
    const title = document.createElement("div");
    title.textContent = "MNM Portal Companion";
    title.style.cssText = "font-size:16px;font-weight:700;";
    trow.appendChild(title);

    const contact = document.createElement("button");
    contact.type = "button";
    contact.className = "brot-contact";
    const ct = document.createElement("span");
    ct.textContent = "Contact us ";
    const ca = document.createElement("span");
    ca.className = "brot-arr";
    ca.textContent = "\u2197";
    contact.appendChild(ct);
    contact.appendChild(ca);
    contact.addEventListener("click", () => {
      window.open(
        "https://mail.google.com/mail/?view=cm&fs=1&to=mhod.nabhan@gmail.com&su=" +
          encodeURIComponent("MNM Portal Companion \u2014 feedback") +
          "&body=" +
          encodeURIComponent(
            "Hi Nabhan!\n\nPage: " +
              location.href +
              "\nVersion: 1.0.0\n\nFeedback:\n",
          ),
        "_blank",
        "noopener",
      );
    });
    trow.appendChild(contact);
    card.appendChild(trow);

    function addToggle(key, label, desc) {
      const row = document.createElement("label");
      row.className = "brot-trow";
      row.dataset.brotKey = key;
      const txt = document.createElement("span");
      txt.style.cssText = "flex:1;";
      const lbl = document.createElement("div");
      lbl.textContent = label;
      lbl.style.cssText = "font-weight:550;font-size:13.5px;";
      const dsc = document.createElement("div");
      dsc.textContent = desc;
      dsc.style.cssText = "font-size:11.5px;color:#9a9a9a;font-weight:400;";
      txt.appendChild(lbl);
      txt.appendChild(dsc);
      const sw = document.createElement("span");
      sw.className = "brot-switch";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!loadSettings()[key];
      cb.addEventListener("change", () => {
        const cur = loadSettings();
        cur[key] = cb.checked;
        saveSettings(cur);
        bus.emit("settings:changed", key);
      });
      const track = document.createElement("span");
      track.className = "brot-track";
      const thumb = document.createElement("span");
      thumb.className = "brot-thumb";
      track.appendChild(thumb);
      sw.appendChild(cb);
      sw.appendChild(track);
      row.appendChild(txt);
      row.appendChild(sw);
      card.appendChild(row);
    }

    addToggle(
      "loadingImage",
      "aniya nill",
      "Show the \u201caniya nill\u201d art on loading overlays (off = spinner)",
    );

    // Exam stats: 3-way segmented control — Normal (default) in the middle
    const examRow = document.createElement("div");
    examRow.style.cssText = "padding:10px 2px;";
    const exLbl = document.createElement("div");
    exLbl.textContent = "Exam stats";
    exLbl.style.cssText = "font-weight:550;font-size:13.5px;";
    const exDsc = document.createElement("div");
    exDsc.textContent = "What the exams-page stats card shows";
    exDsc.style.cssText = "font-size:11.5px;color:#9a9a9a;font-weight:400;";
    examRow.appendChild(exLbl);
    examRow.appendChild(exDsc);

    const seg = document.createElement("div");
    seg.style.cssText =
      "display:flex;margin-top:9px;border:1px solid #e2e2e2;border-radius:8px;overflow:hidden;";
    const segOpts = [
      ["delusion", "Delusion"],
      ["normal", "Normal"],
      ["last5", "Last 5 exams"],
    ];
    function renderSeg() {
      seg.innerHTML = "";
      segOpts.forEach((opt, i) => {
        const b = document.createElement("button");
        b.type = "button";
        const active = (loadSettings().examStats || "normal") === opt[0];
        b.textContent = opt[1];
        b.style.cssText = [
          "flex:1",
          "padding:8px 4px",
          "border:none",
          "cursor:pointer",
          "font:600 11.5px/1.2 Inter,sans-serif",
          "transition:background 0.12s",
          active ? "background:#111;color:#fff" : "background:#fff;color:#444",
        ].join(";");
        b.addEventListener("click", () => {
          const cur = loadSettings();
          cur.examStats = opt[0];
          saveSettings(cur);
          bus.emit("settings:changed", "examStats");
          renderSeg();
        });
        if (i > 0) b.style.borderLeft = "1px solid #e2e2e2";
        seg.appendChild(b);
      });
    }
    renderSeg();
    examRow.appendChild(seg);
    card.appendChild(examRow);

    const sec1 = document.createElement("div");
    sec1.textContent = "Preferences";
    sec1.className = "brot-sec";
    card.insertBefore(sec1, card.querySelector(".brot-trow"));

    const dataTitle = document.createElement("div");
    dataTitle.textContent = "Saved data";
    dataTitle.className = "brot-sec";
    card.appendChild(dataTitle);

    const sdGrid = document.createElement("div");
    sdGrid.className = "brot-sdgrid";
    card.appendChild(sdGrid);

    function addDataButton(k, hint, danger, fn) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "brot-sd" + (danger ? " brot-danger" : "");
      const kk = document.createElement("span");
      kk.className = "brot-k";
      kk.textContent = k;
      btn.appendChild(kk);
      btn.appendChild(document.createTextNode(hint));
      btn.addEventListener("click", fn);
      sdGrid.appendChild(btn);
    }

    addDataButton(
      "Reset this module",
      "Expand/collapse state only",
      false,
      () => {
        try {
          localStorage.removeItem(moduleKey());
          localStorage.removeItem(lastKey());
        } catch (err) {
          console.warn(LOG, "module reset failed:", err);
        }
        if (isModulePage()) {
          updateCounter();
          toggleAll(false);
        }
        closeSettingsModal();
      },
    );

    addDataButton(
      "Reset ALL modules",
      "Every saved state, after confirm",
      true,
      () => {
        if (!window.confirm("Delete saved state for every module?")) return;
        try {
          const keys = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && /^brot_topic\d+_/.test(k)) keys.push(k);
          }
          keys.forEach((k) => localStorage.removeItem(k));
        } catch (err) {
          console.warn(LOG, "full reset failed:", err);
        }
        if (isModulePage()) {
          updateCounter();
          toggleAll(false);
        }
        closeSettingsModal();
      },
    );

    const done = document.createElement("button");
    done.type = "button";
    done.textContent = "Done";
    done.className = "brot-done";
    done.addEventListener("click", closeSettingsModal);
    card.appendChild(done);

    const foot = document.createElement("div");
    foot.className = "brot-foot";
    const fv = document.createElement("span");
    fv.textContent = "v1.0.0 \u00b7 MNM Portal Companion";
    const fk = document.createElement("span");
    fk.textContent = "esc close";
    foot.appendChild(fv);
    foot.appendChild(fk);
    card.appendChild(foot);

    backdrop.appendChild(card);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeSettingsModal();
    });
    document.addEventListener("keydown", settingsEscHandler, true);
    document.body.appendChild(backdrop);
  }

  // ════════════════════════════════════════════════════════════
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
      '[class*="MuiToolbar"], [class*="toolbar"], [role="toolbar"]',
    );
    for (const bar of toolbars) {
      return { outer: bar, inner: bar.firstChild };
    }

    // Strategy 3: top-right action area (last flex child of main header)
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

  function addControls() {
    disconnectInsertObserver();

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

    if (toToggle.length === 0) return;

    // Race fix: hold the lock so no concurrent restore pass can
    // interleave clicks/writes with this batch using a stale snapshot.
    Lock.busy = true;

    showOverlay(expand ? "Expanding all\u2026" : "Collapsing all\u2026");

    toToggle.forEach((c, i) => {
      setTimeout(() => clickHeader(c), i * 300);
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

    setTimeout(
      () => {
        bus.emit("batch:expanded", { containers: toToggle });
        verifyRepair();
      },
      (toToggle.length - 1) * 300 + 400,
    );
  }

  function updateCounter() {
    const el = document.getElementById("brot-topic-counter");
    if (!el) return;
    const containers = getContainers();
    const expanded = containers.filter(isExpanded).length;
    el.textContent = expanded + "/" + containers.length;
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

    pending.forEach((c, i) => {
      setTimeout(() => {
        const t = getTitle(c);
        if (!t || saved[t] == null) return;
        const live = liveContainer(c);
        if (!live) return;
        // state may have settled since the scan; never double-toggle
        if (isExpanded(live) === Boolean(saved[t])) return;
        clickHeader(live);
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
      "border:1px solid #e6e6e6",
      "border-radius:10px",
      "background:#fff",
      "box-shadow:0 6px 20px rgba(0,0,0,0.08)",
      "color:#1a1a1a",
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
      "background:#fdf0ef",
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
      "color:#b8b8b8",
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

  // ════════════════════════════════════════════════════════════
  // FEATURE — exams page (delusion mode + last-5 exams card)
  // ════════════════════════════════════════════════════════════
  // Both tweaks are exams-page only, toggle-driven, and fully
  // reversible: originals are remembered and restored on teardown.
  // applyExams() is a no-op when nothing changes, so the observer
  // below can't loop on its own writes.

  let examsObserver = null;
  let examsScanTimer = null;
  const delusionTextOrig = new Map(); // rate <p> → original text
  const delusionTileOrig = new Map(); // h6 tile → original text (delusion)
  const delusionBarOrig = new Map(); // split-bar segment → original width

  // Site's own pass/fail palette (sampled from the stats slider)
  const STATUS_COLORS = {
    Passed: "#109d58",
    Failed: "#db4437",
    Absent: "#9a9a9a",
  };

  // The stats card is the ancestor of a "% Pass Rate" paragraph that
  // also holds the "Total Attended" totals block.
  function findStatsCard() {
    const p = [...document.querySelectorAll("p")].find((x) =>
      /Pass Rate/.test(x.textContent || ""),
    );
    let a = p ? p.parentElement : null;
    while (a && a !== document.body) {
      const t = a.textContent || "";
      if (/Pass Rate/.test(t) && /Total Attended/.test(t)) return a;
      a = a.parentElement;
    }
    return null;
  }

  // Completed-exam rows: climb from each "Completed on:" paragraph to
  // the first ancestor whose text carries a status word.
  function findExamRows() {
    const datePs = [...document.querySelectorAll("p")].filter((x) =>
      /Completed on:/.test(x.textContent || ""),
    );
    const rows = [];
    datePs.forEach((dp) => {
      let el = dp.parentElement;
      while (el && el !== document.body) {
        if (/Passed|Failed|Absent/.test(el.textContent || "")) break;
        el = el.parentElement;
      }
      if (el && el !== document.body) rows.push(el);
    });
    // Drop ancestor wrappers that matched on behalf of a nested row.
    return rows.filter(
      (r, i) => !rows.some((o, j) => j !== i && o !== r && o.contains(r)),
    );
  }

  function parseExamRow(row) {
    const t = (row.textContent || "").replace(/\s+/g, " ").trim();
    const status = (t.match(/Passed|Failed|Absent/) || [""])[0];
    const title = (
      (t.match(/(?:Normal|Screening|Special)(.*?)Completed on:/) || [])[1] || ""
    ).trim();
    const mod = (t.match(/Module\s*\d+/i) || [""])[0];
    return {
      status: status,
      date: (t.split("Completed on:")[1] || "")
        .split(/Passed|Failed|Absent/)[0]
        .replace(/\s*\d{1,2}:\d{2}\s*(AM|PM)\s*$/i, "")
        .trim(),
      title: title,
      mod: mod,
    };
  }

  // The replacement is a deep clone of the site's own stats card —
  // identical layout (tiles, icons, dividers, rates, slider) — with the
  // numbers recomputed over the last 5 completed exams. Bar segments
  // are fixed up after insertion (computed styles need a live node).
  function buildLast5Card(stats) {
    const rows = findExamRows().slice(0, 5);
    if (rows.length === 0) return null;

    const shell = stats.cloneNode(true);
    shell.id = "brot-last5-card";

    const h6s = [...shell.querySelectorAll("h6")];
    const ps = [...shell.querySelectorAll("p")];
    const passP = ps.find((x) => /Pass Rate/.test(x.textContent || ""));
    const failP = ps.find((x) => /Fail Rate/.test(x.textContent || ""));
    if (h6s.length < 3 || !passP || !failP) return null;

    const failed = rows.filter((r) => /Failed/.test(r.textContent)).length;
    const absent = rows.filter((r) => /Absent/.test(r.textContent)).length;
    const passed = rows.length - failed - absent;
    const pct = Math.round((passed / rows.length) * 100);

    // Quick health read: green outline at 50%+, red below
    shell.style.outline = "2px solid " + (pct >= 50 ? "#109d58" : "#db4437");
    shell.style.outlineOffset = "2px";

    // Clear label line above the tiles (flex row → wrap it to full width)
    shell.style.flexWrap = "wrap";
    const head = document.createElement("div");
    head.textContent = "Last 5 exams";
    head.style.cssText =
      "flex:0 0 100%;font-weight:700;font-size:13.5px;margin-bottom:4px;";
    shell.insertBefore(head, shell.firstChild);

    h6s[0].textContent = rows.length + " Exams";
    h6s[1].textContent = failed + " Exams";
    h6s[2].textContent = absent + " Exams";
    passP.textContent = pct + "% Pass Rate";
    failP.textContent = 100 - pct + "% Fail Rate";

    // Keep the site action buttons — forward their clicks to the hidden
    // original card's live React buttons so they still work.
    const origBtns = [...stats.querySelectorAll("button")];
    [...shell.querySelectorAll("button")].forEach((b, i) => {
      const orig = origBtns[i];
      if (!orig) {
        b.remove();
        return;
      }
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        orig.click();
      });
    });

    return shell;
  }

  function fixLast5Bar(shell) {
    [...shell.querySelectorAll("div")].forEach((d) => {
      if (d.offsetHeight === 0) return;
      const bg = getComputedStyle(d).backgroundColor;
      const green = /16,\s*157,\s*88/.test(bg);
      const red = /219,\s*68,\s*55/.test(bg);
      if (!green && !red) return;
      const passP = [...shell.querySelectorAll("p")].find((x) =>
        /Pass Rate/.test(x.textContent || ""),
      );
      const pct = passP ? parseInt(passP.textContent, 10) : 50;
      const p = green ? pct : 100 - pct;
      d.style.flex = "0 0 " + p + "%";
      d.style.width = p + "%";
    });
  }

  function restoreDelusion() {
    delusionTextOrig.forEach((txt, p) => {
      if (p.isConnected && p.textContent !== txt) p.textContent = txt;
    });
    delusionTextOrig.clear();
    delusionTileOrig.forEach((txt, h6) => {
      if (h6.isConnected && h6.textContent !== txt) h6.textContent = txt;
    });
    delusionTileOrig.clear();
    delusionBarOrig.forEach((w, seg) => {
      if (seg.isConnected) seg.style.width = w;
    });
    delusionBarOrig.clear();
  }

  function applyExams() {
    const mode = loadSettings().examStats || "normal";
    const delusion = mode === "delusion";
    const last5 = mode === "last5";

    // Delusion mode: rewrite the rate labels AND fill the green/red
    // split bar to 100/0 (labels alone leave the red sliver visible).
    const ratePs = [...document.querySelectorAll("p")].filter((x) =>
      /%\s*(Pass|Fail) Rate/.test(x.textContent || ""),
    );
    ratePs.forEach((p) => {
      if (delusion) {
        if (!delusionTextOrig.has(p)) delusionTextOrig.set(p, p.textContent);
        const isPass = /Pass/.test(p.textContent);
        const next = isPass ? "100% Pass Rate" : "0% Fail Rate";
        if (p.textContent !== next) p.textContent = next;
      }
    });
    const stats = findStatsCard();
    if (stats) {
      const h6s = [...stats.querySelectorAll("h6")];
      // Tiles delusion: zero the Failed/Absent counts
      h6s.forEach((h6, i) => {
        if (i !== 1 && i !== 2) return;
        if (delusion) {
          if (!delusionTileOrig.has(h6))
            delusionTileOrig.set(h6, h6.textContent);
          if (h6.textContent !== "0 Exams") h6.textContent = "0 Exams";
        }
      });
      const segs = [...stats.querySelectorAll("div")].filter((d) => {
        if (d.offsetHeight === 0) return false;
        const bg = getComputedStyle(d).backgroundColor;
        return /16,\s*157,\s*88/.test(bg) || /219,\s*68,\s*55/.test(bg);
      });
      segs.forEach((seg) => {
        if (!delusion) return;
        if (!delusionBarOrig.has(seg))
          delusionBarOrig.set(seg, seg.style.width);
        const green = /16,\s*157,\s*88/.test(
          getComputedStyle(seg).backgroundColor,
        );
        const next = green ? "100%" : "0%";
        if (seg.style.width !== next) seg.style.width = next;
      });
    }
    if (!delusion) restoreDelusion();

    // Last 5 exams: slot the recomputed clone ABOVE the normal card —
    // the original stays visible below it, fully live.
    const oldCard = document.getElementById("brot-last5-card");
    if (!last5) {
      if (oldCard) oldCard.remove();
      return;
    }
    if (oldCard) return; // already in place; observer rebuilds after re-renders
    const live = findStatsCard();
    if (!live) return;
    const shell = buildLast5Card(live);
    if (!shell) return;
    live.insertAdjacentElement("beforebegin", shell);
    fixLast5Bar(shell);
  }

  function startExamsObserver() {
    if (examsObserver) return;
    examsObserver = new MutationObserver(() => {
      if (examsScanTimer) clearTimeout(examsScanTimer);
      examsScanTimer = setTimeout(applyExams, 250);
    });
    examsObserver.observe(document.body, { childList: true, subtree: true });
  }

  function stopExams() {
    if (examsObserver) {
      examsObserver.disconnect();
      examsObserver = null;
    }
    if (examsScanTimer) {
      clearTimeout(examsScanTimer);
      examsScanTimer = null;
    }
    restoreDelusion();
    const oldCard = document.getElementById("brot-last5-card");
    if (oldCard) oldCard.remove();
  }

  function startExams() {
    stopExams();
    let tries = 0;
    (function wait() {
      if (!isExamsPage()) return;
      if (findStatsCard() || ++tries > 40) {
        applyExams();
        startExamsObserver();
        return;
      }
      setTimeout(wait, 300);
    })();
  }

  bus.on("settings:changed", (key) => {
    if (key === "examStats" && isExamsPage()) applyExams();
  });

  // ════════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════════
  // RUNTIME — teardown registry
  // ════════════════════════════════════════════════════════════

  const navTeardowns = [];
  const pageTeardowns = [];

  onNavTeardown(() => disconnectInsertObserver());
  onNavTeardown(() => Watch.disconnect());
  onNavTeardown(() => clearScrollTimeout());
  onPageTeardown(() => {
    document.removeEventListener("click", onUploadAreaClick, true);
    hideUploadTip();
  });
  onPageTeardown(() => {
    destroySettingsWatcher();
    closeSettingsModal();
  });
  onPageTeardown(() => stopExams());

  function onNavTeardown(fn) {
    navTeardowns.push(fn);
  }

  function onPageTeardown(fn) {
    pageTeardowns.push(fn);
  }

  function runTeardowns(list) {
    list.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        void e;
      }
    });
    list.length = 0;
  }

  // ════════════════════════════════════════════════════════════
  // RUNTIME — DOM watch (survive React re-renders)
  // ════════════════════════════════════════════════════════════

  const Watch = {
    observer: null,
    debounce: null,
    disconnect() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this.debounce) {
        clearTimeout(this.debounce);
        this.debounce = null;
      }
    },
    start() {
      this.disconnect();
      this.observer = new MutationObserver(() => {
        // Fix Perf#5: skip if controls still exist and topic count unchanged
        const controlsExist = !!document.getElementById("brot-topic-controls");
        const hasTopics = getContainers().length > 0;
        if (controlsExist && hasTopics) return;

        if (this.debounce) clearTimeout(this.debounce);
        this.debounce = setTimeout(() => {
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
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    },
  };

  // ════════════════════════════════════════════════════════════
  // RUNTIME — update checker
  // ════════════════════════════════════════════════════════════

  const UPDATE_URL =
    "https://raw.githubusercontent.com/nabhan-007/JS-UserScripts/main/Brototype-Student-Portal/script.user.js";
  const LOCAL_VERSION = "1.0.0";

  function parseVersion(text) {
    const m = text.match(/@version\s+([^\s]+)/);
    return m ? m[1] : null;
  }

  function cmpVersions(a, b) {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0;
      const y = pb[i] || 0;
      if (x !== y) return x - y;
    }
    return 0;
  }

  function showUpdateModal(remoteVer) {
    ensureBrotStyles();

    function close() {
      var b = document.getElementById("brot-update-backdrop");
      if (b) b.remove();
    }

    var backdrop = document.createElement("div");
    backdrop.id = "brot-update-backdrop";
    backdrop.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:100002",
      "background:rgba(0,0,0,0.45)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
    ].join(";");

    var card = document.createElement("div");
    card.style.cssText = [
      "background:#fff",
      "border:1px solid #e6e6e6",
      "border-radius:14px",
      "box-shadow:0 12px 40px rgba(0,0,0,0.15)",
      "width:370px",
      "max-width:90vw",
      "padding:0",
      "font:13.5px/1.5 Inter,sans-serif",
      "color:#1a1a1a",
      "overflow:hidden",
    ].join(";");

    // Header band
    var hdr = document.createElement("div");
    hdr.style.cssText = [
      "background:linear-gradient(135deg,#f8f9fa 0%,#eef0f2 100%)",
      "padding:22px 24px 18px",
      "border-bottom:1px solid #eee",
      "text-align:center",
    ].join(";");
    card.appendChild(hdr);

    var icon = document.createElement("div");
    icon.textContent = "\u2191";
    icon.style.cssText = [
      "width:36px",
      "height:36px",
      "border-radius:50%",
      "background:#111",
      "color:#fff",
      "font-size:18px",
      "line-height:36px",
      "text-align:center",
      "margin:0 auto 10px",
    ].join(";");
    hdr.appendChild(icon);

    var heading = document.createElement("div");
    heading.textContent = "Update available";
    heading.style.cssText = "font-size:15px;font-weight:700;margin-bottom:4px;";
    hdr.appendChild(heading);

    var detail = document.createElement("div");
    detail.textContent = "v" + LOCAL_VERSION + " \u2192 v" + remoteVer;
    detail.style.cssText = "font-size:12.5px;color:#888;";
    hdr.appendChild(detail);

    // Body
    var body = document.createElement("div");
    body.style.cssText = "padding:18px 24px 20px;";

    var dlBtn = document.createElement("a");
    dlBtn.href = UPDATE_URL;
    dlBtn.target = "_blank";
    dlBtn.rel = "noopener";
    dlBtn.textContent = "Update now";
    dlBtn.addEventListener("click", close);
    dlBtn.style.cssText = [
      "display:block",
      "width:100%",
      "padding:11px",
      "border:none",
      "border-radius:8px",
      "background:#111",
      "color:#fff",
      "font:650 13px/1.2 Inter,sans-serif",
      "cursor:pointer",
      "text-decoration:none",
      "text-align:center",
      "transition:background 0.15s",
    ].join(";");
    dlBtn.addEventListener("mouseenter", function () { dlBtn.style.background = "#333"; });
    dlBtn.addEventListener("mouseleave", function () { dlBtn.style.background = "#111"; });
    body.appendChild(dlBtn);

    var skip = document.createElement("button");
    skip.type = "button";
    skip.textContent = "Skip this version";
    skip.style.cssText = [
      "display:block",
      "width:100%",
      "margin-top:6px",
      "padding:8px",
      "border:none",
      "background:transparent",
      "color:#aaa",
      "font:12px/1 Inter,sans-serif",
      "cursor:pointer",
      "border-radius:6px",
      "transition:color 0.12s",
    ].join(";");
    skip.addEventListener("mouseenter", function () { skip.style.color = "#666"; });
    skip.addEventListener("mouseleave", function () { skip.style.color = "#aaa"; });
    skip.addEventListener("click", function () {
      try { sessionStorage.setItem("brot_update_skip", "1"); } catch (e) {}
      close();
    });
    body.appendChild(skip);

    card.appendChild(body);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) close();
    });
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
  }

  function checkForUpdate() {
    fetch(UPDATE_URL, { cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.text() : null;
      })
      .then(function (txt) {
        if (!txt) return;
        const remote = parseVersion(txt);
        if (remote && cmpVersions(remote, LOCAL_VERSION) > 0) {
          try {
            if (sessionStorage.getItem("brot_update_skip")) return;
          } catch (e) {}
          showUpdateModal(remote);
        }
      })
      .catch(function () {});
  }

  // ════════════════════════════════════════════════════════════
  // RUNTIME — init, SPA navigation, unload, kickoff
  // ════════════════════════════════════════════════════════════

  function init() {
    if (!isModulePage()) return;
    const containers = getContainers();
    const strategy = usedFallback ? "fallback (hash)" : "primary (stable)";
    console.log(LOG, "init \u2014", containers.length, "topics via", strategy);

    addControls();
    attach();
    restore();

    setTimeout(() => Watch.start(), 1000);
  }

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
    runTeardowns(navTeardowns);
    runTeardowns(pageTeardowns);
  });

  function onUrlChange() {
    runTeardowns(navTeardowns);
    hideOverlay();
    stopExams();

    // Left the module page — remove controls and do nothing
    if (!isModulePage()) {
      const controls = document.getElementById("brot-topic-controls");
      if (controls) controls.remove();
      if (isExamsPage()) startExams();
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

  // Feature bootstrap
  initReadMore();
  initAutoScroll();
  initUploadTip();
  watchSettingsPopover();
  checkForUpdate();

  // ── Kickoff ────────────────────────────────────────────────

  setTimeout(() => {
    // Exams page — apply stats tweaks; module pages handled below
    if (isExamsPage()) {
      startExams();
      return;
    }

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