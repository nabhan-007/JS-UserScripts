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
    shell.style.outline = "2px solid " + (pct >= 50 ? COLORS.statusPass : COLORS.statusFail);
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