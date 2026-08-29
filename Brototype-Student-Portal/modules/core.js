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

  // ════════════════════════════════════════════════════════════
  // CORE — color palette (single source of truth)
  // ════════════════════════════════════════════════════════════

  var COLORS = {
    // neutrals
    textPrimary:    "#1a1a1a",
    textSecondary:  "#444",
    textMuted:      "#888",
    textFaint:      "#b8b8b8",
    surface:        "#fff",
    surfaceHover:   "#f7f7f7",
    borderLight:    "#e2e2e2",
    borderSeparator:"#efefef",
    // action
    actionPrimary:      "#111",
    actionPrimaryHover: "#333",
    // danger
    dangerText:        "#c0392b",
    dangerBg:          "#fdf7f6",
    dangerBgHover:     "#fbeeed",
    dangerBorder:      "#f0cdcd",
    dangerBorderHover: "#e8b7b7",
    // status
    statusPass:    "#109d58",
    statusFail:    "#db4437",
    statusAbsent:  "#9a9a9a",
    // accent (topic counter)
    accentText:  "#1a6ddb",
    accentBg:    "#eaf1fc",
    // warning
    warningIconBg: "#fdf0ef",
    // overlay
    overlayScrim: "rgba(0,0,0,0.5)",
    shadowCard:   "rgba(0,0,0,0.08)",
    shadowLifted: "rgba(0,0,0,0.15)",
    // dark mode
    dmBorder:       "rgba(255,255,255,.25)",
    dmSegmentBg:    "rgba(255,255,255,.06)",
    dmHover:        "rgba(255,255,255,.12)",
    dmAccentText:   "#7db4f5",
    dmAccentBg:     "rgba(125,180,245,.2)",
    dmSpinner:      "rgba(255,255,255,0.25)",
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
      "background:rgba(0,0,0,0.5)",
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

  // Walk up from h6 to find the outermost cursor:pointer ancestor.
  // This is the actual topic container (wraps both header + content).
  // Earlier approach (skip-1-return-2nd) broke on modules where the
  // h6 itself has cursor:pointer, shifting the count.
  function findContainerFromH6(h6) {
    let el = h6.parentElement;
    let lastPointer = null;
    while (el && el !== document.body) {
      if (getComputedStyle(el).cursor === "pointer") {
        lastPointer = el;
      }
      el = el.parentElement;
    }
    return lastPointer;
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
      "#brot-settings-backdrop .brot-card{background:#fff;border:1px solid #e2e2e2;",
      "border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,0.08);width:400px;",
      "max-width:92vw;max-height:86vh;overflow:auto;padding:24px;",
      "font:13.5px/1.5 Inter,sans-serif;color:#1a1a1a;}",
      "#brot-settings-backdrop .brot-trow{display:flex;align-items:center;gap:14px;",
      "padding:10px 2px;cursor:pointer;}",
      "#brot-settings-backdrop .brot-trow:hover{background:#f7f7f7;}",
      "#brot-settings-backdrop .brot-trow+.brot-trow{border-top:1px solid #efefef;}",
      "#brot-settings-backdrop .brot-sec{font-size:10.5px;font-weight:700;",
      "text-transform:uppercase;letter-spacing:0.9px;color:#b8b8b8;margin:20px 0 6px;}",
      "#brot-settings-backdrop .brot-sdgrid{display:grid;grid-template-columns:1fr 1fr;",
      "gap:8px;margin-top:4px;}",
      "#brot-settings-backdrop .brot-sd{border:1px solid #e2e2e2;background:#fff;",
      "border-radius:8px;padding:9px 10px;font:12px/1.35 Inter,sans-serif;color:#444;",
      "cursor:pointer;text-align:left;transition:background 0.12s,border-color 0.12s;}",
      "#brot-settings-backdrop .brot-sd:hover{background:#f7f7f7;border-color:#e2e2e2;}",
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
      "#brot-settings-backdrop .brot-contact:hover{background:#f7f7f7;border-color:#e2e2e2;}",
      "#brot-settings-backdrop .brot-contact .brot-arr{color:#888;font-weight:400;}",
      "#brot-settings-backdrop .brot-contact:hover .brot-arr{color:#333;}",
      "#brot-settings-backdrop .brot-done{display:block;width:100%;margin-top:18px;",
      "padding:11px;border:none;border-radius:8px;background:#111;color:#fff;",
      "font:650 13.5px/1.2 Inter,sans-serif;cursor:pointer;transition:background 0.15s;}",
      "#brot-settings-backdrop .brot-done:hover{background:#333;}",
      "#brot-settings-backdrop .brot-foot{margin-top:18px;padding-top:12px;",
      "border-top:1px solid #efefef;font-size:11px;color:#b8b8b8;",
      "display:flex;justify-content:space-between;align-items:center;}",
      "#brot-settings-backdrop .brot-foot kbd{font-family:inherit;background:#f7f7f7;",
      "border:1px solid #e2e2e2;border-radius:4px;padding:1px 5px;font-size:10px;color:#888;}",
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