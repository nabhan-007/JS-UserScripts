  // ============================================================
  // FEATURE -- first-install disclaimer (blocking agreement modal)
  // ============================================================
  // Accept  -> persisted in localStorage (brot_settings.disclaimerAccepted),
  //            modal never shows again, features boot.
  // Decline -> recorded in sessionStorage (tab-scoped by nature), modal
  //            closes, script stays inert. A new tab/session shows the
  //            modal again, so an accidental Decline is recoverable.
  // No decision (reload/Esc before choosing) -> modal shows again.
  // Re-accept on version bumps is deliberately NOT done (see TODO #4).
  //
  // Styling is fully inline (update-modal pattern), NOT the .brot-card /
  // .brot-done classes: those are scoped to #brot-settings-backdrop and
  // do not apply inside this backdrop. Card is opaque, backdrop translucent.

  const DISCLAIMER_DECLINED_KEY = "brot_disclaimer_declined";

  function isDisclaimerAccepted() {
    try {
      return !!loadSettings().disclaimerAccepted;
    } catch (e) {
      return false;
    }
  }

  function isDisclaimerDeclined() {
    try {
      return sessionStorage.getItem(DISCLAIMER_DECLINED_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function closeDisclaimerModal() {
    const b = document.getElementById("brot-disclaimer-backdrop");
    if (b) b.remove();
  }

  // onAccept is unused (Accept reloads; the guard then lets full boot run).
  // Kept as an optional hook for tests.
  function showDisclaimerModal(onAccept) {
    closeDisclaimerModal();
    if (!document.body) {
      // document-start injection: body doesn't exist yet, retry on ready
      document.addEventListener(
        "DOMContentLoaded",
        () => showDisclaimerModal(onAccept),
        { once: true },
      );
      return;
    }

    const backdrop = document.createElement("div");
    backdrop.id = "brot-disclaimer-backdrop";
    backdrop.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:100003",
      "background:" + COLORS.overlayScrim,
      "display:flex",
      "align-items:center",
      "justify-content:center",
    ].join(";");

    // Opaque card, update-modal pattern: header band + body.
    const card = document.createElement("div");
    card.style.cssText = [
      "background:" + COLORS.surface,
      "border:1px solid " + COLORS.borderLight,
      "border-radius:14px",
      "box-shadow:0 12px 40px " + COLORS.shadowLifted,
      "width:505px",
      "max-width:94vw",
      "max-height:86vh",
      "overflow:auto",
      "padding:0",
      "font:14.5px/1.55 Inter,sans-serif",
      "color:" + COLORS.textPrimary,
    ].join(";");

    // Header band
    const hdr = document.createElement("div");
    hdr.style.cssText = [
      "background:linear-gradient(135deg,#f8f9fa 0%,#eef0f2 100%)",
      "padding:26px 28px 20px",
      "border-bottom:1px solid " + COLORS.borderSeparator,
      "text-align:center",
    ].join(";");

    const icon = document.createElement("div");
    icon.textContent = "!";
    icon.style.cssText = [
      "width:40px",
      "height:40px",
      "border-radius:50%",
      "background:" + COLORS.actionPrimary,
      "color:" + COLORS.surface,
      "font-size:21px",
      "font-weight:700",
      "line-height:40px",
      "text-align:center",
      "margin:0 auto 12px",
    ].join(";");
    hdr.appendChild(icon);

    const heading = document.createElement("div");
    heading.textContent = "Before you start";
    heading.style.cssText = "font-size:17px;font-weight:700;margin-bottom:4px;";
    hdr.appendChild(heading);

    const detail = document.createElement("div");
    detail.textContent = "MNM Portal Companion";
    detail.style.cssText = "font-size:13px;color:" + COLORS.textMuted + ";";
    hdr.appendChild(detail);
    card.appendChild(hdr);

    // Body
    const body = document.createElement("div");
    body.style.cssText = "padding:20px 28px 24px;";

    const p1 = document.createElement("div");
    p1.style.cssText = "font-size:14px;color:" + COLORS.textSecondary + ";";
    p1.textContent =
      "MNM Portal Companion is a community-built script. It is thoroughly " +
      "tested, but it is not affiliated with or endorsed by Brototype.";
    const p2 = document.createElement("div");
    p2.style.cssText =
      "font-size:14px;color:" + COLORS.textSecondary + ";margin-top:10px;";
    p2.textContent =
      "By clicking Accept, you agree that you run this script at your own " +
      "risk and assume full responsibility for anything that happens on " +
      "your account. The makers accept no liability.";
    body.appendChild(p1);
    body.appendChild(p2);

    const accept = document.createElement("button");
    accept.type = "button";
    accept.id = "brot-disclaimer-accept";
    accept.textContent = "I understand - Accept";
    accept.style.cssText = [
      "display:block",
      "width:100%",
      "margin-top:20px",
      "padding:12px",
      "border:none",
      "border-radius:8px",
      "background:" + COLORS.actionPrimary,
      "color:" + COLORS.surface,
      "font:650 14.5px/1.2 Inter,sans-serif",
      "cursor:pointer",
      "transition:background 0.15s",
    ].join(";");
    accept.addEventListener("mouseenter", () => { accept.style.background = COLORS.actionPrimaryHover; });
    accept.addEventListener("mouseleave", () => { accept.style.background = COLORS.actionPrimary; });
    accept.addEventListener("click", () => {
      const cur = loadSettings();
      cur.disclaimerAccepted = true;
      saveSettings(cur);
      closeDisclaimerModal();
      if (typeof onAccept === "function") {
        onAccept();
      } else {
        // Guard (guard.js) stopped this run before anything installed,
        // so reload: the next run sees acceptance and boots fully.
        location.reload();
      }
    });
    body.appendChild(accept);

    const decline = document.createElement("button");
    decline.type = "button";
    decline.id = "brot-disclaimer-decline";
    decline.textContent = "Decline";
    decline.style.cssText = [
      "display:block",
      "width:100%",
      "margin-top:8px",
      "padding:8px",
      "border:none",
      "background:transparent",
      "color:#aaa",
      "font:13px/1 Inter,sans-serif",
      "cursor:pointer",
      "border-radius:6px",
      "transition:color 0.12s",
    ].join(";");
    decline.addEventListener("mouseenter", () => { decline.style.color = "#666"; });
    decline.addEventListener("mouseleave", () => { decline.style.color = "#aaa"; });
    decline.addEventListener("click", () => {
      try {
        sessionStorage.setItem(DISCLAIMER_DECLINED_KEY, "1");
      } catch (e) {}
      closeDisclaimerModal();
      // Deliberately no "disabled" notice: plain portal, zero code.
      // New tab/session re-shows the modal (accidental-decline recovery).
    });
    body.appendChild(decline);

    card.appendChild(body);

    // Blocking: backdrop click does nothing. Esc is not listening yet
    // (features boot only after Accept), so reload just re-shows this.
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
  }
