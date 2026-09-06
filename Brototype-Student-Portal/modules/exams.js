  // ============================================================
  // FEATURE -- exams page (delusion mode + last-5 exams card)
  // ============================================================
  // Both tweaks are exams-page only, toggle-driven, and fully
  // reversible: originals are remembered and restored on teardown.
  // applyExams() is a no-op when nothing changes, so the observer
  // below can't loop on its own writes.

  let examsObserver = null;
  let examsScanTimer = null;
  const delusionTextOrig = new Map(); // rate <p> -> original text
  const delusionTileOrig = new Map(); // h6 tile -> original text (delusion)
  const delusionBarOrig = new Map(); // split-bar segment -> original width

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

  // The replacement is a deep clone of the site's own stats card --
  // identical layout (tiles, icons, dividers, rates, slider) -- with the
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

    // Clear label line above the tiles (flex row -> wrap it to full width)
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

    // Keep the site action buttons -- forward their clicks to the hidden
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
    injectCopyPendings();
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

    // Last 5 exams: slot the recomputed clone ABOVE the normal card --
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

  // ============================================================
  // FEATURE -- copy pendings button (TODO #3)
  // ============================================================
  // One shared "Copy" button, sticky top-right inside the visible
  // pendings text panel. Copies the panel text with a
  // "Module N - Pendings" header. Shown only while a pendings tab is
  // active; re-injected idempotently from applyExams() (the body panel
  // is re-rendered on every tab switch), removed by stopExams().
  //
  // Module rule: on a 1st-attempt exam the Previous Pendings belong to
  // the previous module, so the header says Module N-1 (floored at 1).
  // Otherwise the header uses the exam's own module number.
  //
  // Stable hooks (no MUI hash classes):
  //   prev body  -- [data-testid="review-previous-pending-tab"] > p
  //   curr body  -- [data-testid="review-pending-topic-tab"] > p
  // Active tab = whichever container is rendered (React only renders
  // the visible tab body). The button-odd-one-out check covers the
  // case where both are somehow present.

  const PENDING_TABS = [
    { kind: "Previous Pendings", testid: "review-previous-pending-tab", prev: true },
    { kind: "Current Pendings", testid: "review-pending-topic-tab", prev: false },
  ];

  function findDetailPaper() {
    return (
      [...document.querySelectorAll("div.MuiPaper-root")].find((p) => {
        const t = p.textContent || "";
        return /Details/.test(t) && /Pendings/.test(t);
      }) || null
    );
  }

  function activePendings(paper) {
    let kind = null;
    const tabs = [...paper.querySelectorAll("button")].filter((b) =>
      /Details|Pendings|Marks/.test(b.textContent.trim()),
    );
    if (tabs.length > 1) {
      const counts = {};
      tabs.forEach((b) => {
        counts[b.className] = (counts[b.className] || 0) + 1;
      });
      let majority = null;
      let max = 0;
      for (const c in counts) {
        if (counts[c] > max) {
          max = counts[c];
          majority = c;
        }
      }
      const odd = tabs.find((b) => b.className !== majority);
      if (odd && /Pendings/.test(odd.textContent.trim())) {
        kind = odd.textContent.trim();
      }
    }
    const byKind = (k) => PENDING_TABS.find((t) => t.kind === k);
    const boxOf = (t) =>
      t && paper.querySelector('[data-testid="' + t.testid + '"]');
    let tab = byKind(kind);
    let box = boxOf(tab);
    if (!box) {
      // Button signal missing/mismatched -- trust the rendered container
      tab = PENDING_TABS.find((t) => boxOf(t));
      box = boxOf(tab);
    }
    if (!tab || !box) return null;
    const text = (box.textContent || "").trim();
    if (!text) return null;
    return { kind: tab.kind, text };
  }

  // Header chip reads e.g. "Module 10 , 1st attempt".
  function detailModuleNum(paper) {
    const t = paper.textContent || "";
    let m = t.match(/Module\s+(\d+)\s*,\s*(\d+)\s*(?:st|nd|rd|th)?\s*attempt/i);
    if (m) return { n: parseInt(m[1], 10), attempt: parseInt(m[2], 10) };
    m = t.match(/Module\s+(\d+)/i);
    if (m) return { n: parseInt(m[1], 10), attempt: 0 };
    return { n: 0, attempt: 0 };
  }

  function pendingsHeader(paper, isPrev) {
    const info = detailModuleNum(paper);
    let n = info.n;
    if (isPrev && info.attempt === 1 && n > 1) n = n - 1;
    return "Module " + (n > 0 ? n : "?") + " - Pendings";
  }

  // W1 icons (inline SVG, ASCII-only so no encoding risk)
  const COPY_ICON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const CHECK_ICON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" ' +
    'stroke-linejoin="round">' +
    '<polyline points="20 6 9 17 4 12"/></svg>';

  function flashCopyBtn(btn) {
    const icCopy = btn.querySelector(".brot-ic-copy");
    const icOk = btn.querySelector(".brot-ic-ok");
    const tip = btn.querySelector(".brot-tip");
    btn.classList.add("done");
    btn.setAttribute("aria-label", "Pendings copied to clipboard");
    if (icCopy) icCopy.style.display = "none";
    if (icOk) icOk.style.display = "";
    if (tip) tip.textContent = "Copied";
    setTimeout(() => {
      if (!btn.isConnected) return;
      btn.classList.remove("done");
      btn.setAttribute("aria-label", "Copy pendings to clipboard");
      if (icCopy) icCopy.style.display = "";
      if (icOk) icOk.style.display = "none";
      if (tip) tip.textContent = "Copy";
    }, 1600);
  }

  function fallbackCopy(text, done) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      done();
    } catch (e) {
      console.warn(LOG, "copy failed:", e);
    }
  }

  function copyPendingsText(full, btn) {
    const done = () => flashCopyBtn(btn);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(full).then(done, () =>
        fallbackCopy(full, done),
      );
    } else {
      fallbackCopy(full, done);
    }
  }

  function injectCopyPendings() {
    if (!isExamsPage()) return;
    const paper = findDetailPaper();
    const active = paper && activePendings(paper);
    let btn = document.getElementById("brot-copy-pendings");
    // Body panel is re-rendered per tab switch -- stale node check first
    if (btn && !btn.isConnected) btn.remove();
    if (!paper || !active) {
      btn = document.getElementById("brot-copy-pendings");
      if (btn) btn.remove();
      return;
    }
    if (document.getElementById("brot-copy-pendings")) return; // in place
    const tab = PENDING_TABS.find((t) => t.kind === active.kind);
    const box = tab && paper.querySelector('[data-testid="' + tab.testid + '"]');
    const scroller = box && box.parentElement;
    if (!scroller) return;

    if (!document.getElementById("brot-copy-style")) {
      const st = document.createElement("style");
      st.id = "brot-copy-style";
      st.textContent =
        "#brot-copy-pendings{position:sticky;top:8px;float:right;z-index:2;" +
        "width:28px;height:28px;display:inline-flex;align-items:center;" +
        "justify-content:center;border:1px solid " +
        COLORS.borderLight +
        ";background:" +
        COLORS.surface +
        ";color:" +
        COLORS.textSecondary +
        ";border-radius:8px;padding:0;margin:0 0 8px 8px;cursor:pointer;}" +
        "#brot-copy-pendings:hover{background:" +
        COLORS.surfaceHover +
        ";color:" +
        COLORS.textPrimary +
        ";}" +
        "#brot-copy-pendings.done,#brot-copy-pendings.done:hover{border-color:" +
        COLORS.statusPass +
        ";color:" +
        COLORS.statusPass +
        ";background:" +
        COLORS.surface +
        ";}" +
        "#brot-copy-pendings .brot-tip{position:absolute;top:calc(100% + 6px);" +
        "right:0;background:" +
        COLORS.actionPrimary +
        ";color:" +
        COLORS.surface +
        ";font:500 11.5px/1 Inter,sans-serif;padding:5px 10px;border-radius:6px;" +
        "white-space:nowrap;opacity:0;pointer-events:none;transition:opacity 0.12s;}" +
        "#brot-copy-pendings:hover .brot-tip,#brot-copy-pendings.done .brot-tip{opacity:1;}";
      document.head.appendChild(st);
    }

    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "brot-copy-pendings";
    btn.setAttribute("aria-label", "Copy pendings to clipboard");
    btn.innerHTML =
      '<span class="brot-ic-copy" style="display:inline-flex">' +
      COPY_ICON +
      '</span><span class="brot-ic-ok" style="display:none">' +
      CHECK_ICON +
      '</span><span class="brot-tip">Copy</span>';
    btn.addEventListener("click", () => {
      const live = findDetailPaper();
      const now = live && activePendings(live);
      if (!now || !live) return;
      const isPrev = (PENDING_TABS.find((t) => t.kind === now.kind) || {}).prev;
      copyPendingsText(pendingsHeader(live, isPrev) + "\n\n" + now.text, btn);
    });
    scroller.insertBefore(btn, scroller.firstChild);
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
    const copyBtn = document.getElementById("brot-copy-pendings");
    if (copyBtn) copyBtn.remove();
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

  // ============================================================