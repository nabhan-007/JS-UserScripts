  // ============================================================
  // FEATURE -- settings UI (profile-popover entry + modal)
  // ============================================================
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

  function closeSettingsModal() {
    const b = document.getElementById("brot-settings-backdrop");
    if (b) b.remove();
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
      "background:" + COLORS.overlayScrim,
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
              "\nVersion: __SCRIPT_VERSION__\n\nFeedback:\n",
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
      dsc.style.cssText = "font-size:11.5px;color:" + COLORS.statusAbsent + ";font-weight:400;";
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

    // Exam stats: 3-way segmented control -- Normal (default) in the middle
    const examRow = document.createElement("div");
    examRow.style.cssText = "padding:10px 2px;";
    const exLbl = document.createElement("div");
    exLbl.textContent = "Exam stats";
    exLbl.style.cssText = "font-weight:550;font-size:13.5px;";
    const exDsc = document.createElement("div");
    exDsc.textContent = "What the exams-page stats card shows";
    exDsc.style.cssText = "font-size:11.5px;color:" + COLORS.statusAbsent + ";font-weight:400;";
    examRow.appendChild(exLbl);
    examRow.appendChild(exDsc);

    const seg = document.createElement("div");
    seg.style.cssText =
      "display:flex;margin-top:9px;border:1px solid " + COLORS.borderLight + ";border-radius:8px;overflow:hidden;";
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
          active ? "background:" + COLORS.actionPrimary + ";color:" + COLORS.surface : "background:" + COLORS.surface + ";color:" + COLORS.textSecondary,
        ].join(";");
        b.addEventListener("click", () => {
          const cur = loadSettings();
          cur.examStats = opt[0];
          saveSettings(cur);
          bus.emit("settings:changed", "examStats");
          renderSeg();
        });
        if (i > 0) b.style.borderLeft = "1px solid " + COLORS.borderLight;
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
    fv.textContent = "v__SCRIPT_VERSION__ \u00b7 MNM Portal Companion";
    const fk = document.createElement("span");
    fk.textContent = "Esc to refresh";
    foot.appendChild(fv);
    foot.appendChild(fk);
    card.appendChild(foot);

    backdrop.appendChild(card);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeSettingsModal();
    });
    document.body.appendChild(backdrop);
  }

  // ============================================================