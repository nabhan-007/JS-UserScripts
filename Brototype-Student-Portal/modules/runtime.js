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

    const backdrop = document.createElement("div");
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

    const card = document.createElement("div");
    card.style.cssText = [
      "background:#fff",
      "border:1px solid #e6e6e6",
      "border-radius:12px",
      "box-shadow:0 8px 32px rgba(0,0,0,0.12)",
      "width:380px",
      "max-width:90vw",
      "padding:28px 24px 22px",
      "font:13.5px/1.5 Inter,sans-serif",
      "color:#1a1a1a",
      "text-align:center",
    ].join(";");

    const icon = document.createElement("div");
    icon.textContent = "\uD83D\uDD34";
    icon.style.cssText = "font-size:28px;margin-bottom:10px;";
    card.appendChild(icon);

    const heading = document.createElement("div");
    heading.textContent = "Update available";
    heading.style.cssText = "font-size:16px;font-weight:700;margin-bottom:6px;";
    card.appendChild(heading);

    const detail = document.createElement("div");
    detail.textContent =
      "v" + LOCAL_VERSION + " \u2192 v" + remoteVer;
    detail.style.cssText =
      "font-size:13px;color:#666;margin-bottom:18px;";
    card.appendChild(detail);

    const dlBtn = document.createElement("a");
    dlBtn.href = UPDATE_URL;
    dlBtn.target = "_blank";
    dlBtn.rel = "noopener";
    dlBtn.textContent = "Update now";
    dlBtn.style.cssText = [
      "display:block",
      "width:100%",
      "padding:11px",
      "border:none",
      "border-radius:8px",
      "background:#111",
      "color:#fff",
      "font:650 13.5px/1.2 Inter,sans-serif",
      "cursor:pointer",
      "text-decoration:none",
      "text-align:center",
      "transition:background 0.15s",
    ].join(";");
    card.appendChild(dlBtn);

    const skip = document.createElement("button");
    skip.type = "button";
    skip.textContent = "Skip this version";
    skip.style.cssText = [
      "display:block",
      "width:100%",
      "margin-top:8px",
      "padding:8px",
      "border:none",
      "background:transparent",
      "color:#999",
      "font:12px/1 Inter,sans-serif",
      "cursor:pointer",
    ].join(";");
    skip.addEventListener("click", () => {
      try { sessionStorage.setItem("brot_update_skip", "1"); } catch (e) {}
      backdrop.remove();
    });
    card.appendChild(skip);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.remove();
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