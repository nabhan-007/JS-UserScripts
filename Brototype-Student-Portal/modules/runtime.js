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
  const LOCAL_VERSION = "__SCRIPT_VERSION__";

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