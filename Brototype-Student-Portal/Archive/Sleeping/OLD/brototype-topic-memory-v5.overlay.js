// ==UserScript==
// @name         Brototype Topic Memory - Overlay
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Translucent overlay while Brototype Topic Memory processes restore/bulk actions.
// @author       naabo
// @match        https://student.brototype.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const ID = "brot5-over";
  const SAFETY_MS = 30000;

  let el = null;
  let statusEl = null;
  let hideTimer = null;

  function create() {
    const overlay = document.createElement("div");
    overlay.id = ID;
    overlay.style.cssText = [
      "position:fixed;top:0;left:0;width:100vw;height:100vh",
      "background:rgba(0,0,0,0.25)",
      "z-index:2147483647;display:flex;flex-direction:column",
      "align-items:center;justify-content:center",
      "font-family:system-ui,sans-serif;pointer-events:auto",
      "transition:opacity .3s ease;opacity:1",
    ].join(";");

    const spin = document.createElement("div");
    spin.style.cssText = [
      "width:36px;height:36px",
      "border:3px solid rgba(255,255,255,.3)",
      "border-top-color:#fff",
      "border-radius:50%",
      "animation:" + ID + "-spin .7s linear infinite",
      "margin-bottom:14px",
    ].join(";");

    const st = document.createElement("div");
    st.id = ID + "-status";
    st.textContent = "Working\u2026";
    st.style.cssText =
      "color:#fff;font-size:15px;font-weight:500;text-shadow:0 1px 4px rgba(0,0,0,.4)";

    overlay.appendChild(spin);
    overlay.appendChild(st);
    document.body.appendChild(overlay);

    if (!document.getElementById(ID + "-style")) {
      const s = document.createElement("style");
      s.id = ID + "-style";
      s.textContent = "@keyframes " + ID + "-spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(s);
    }

    el = overlay;
    statusEl = st;
  }

  window.BROT_Overlay = {
    show: function (msg) {
      if (!el) create();
      el.style.display = "flex";
      el.style.opacity = "1";
      statusEl.textContent = msg || "Working\u2026";
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        window.BROT_Overlay.hide();
      }, SAFETY_MS);
    },
    update: function (msg) {
      if (statusEl) statusEl.textContent = msg;
    },
    hide: function () {
      if (!el) return;
      clearTimeout(hideTimer);
      el.style.opacity = "0";
      setTimeout(function () {
        if (el) el.style.display = "none";
      }, 300);
    },
  };
})();
