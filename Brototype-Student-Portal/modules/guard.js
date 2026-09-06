  // ============================================================
  // GUARD -- first-install gate (runs before anything else installs)
  // ============================================================
  // This file sits right after core.js in build order. Everything below
  // it (listeners, observers, history patching, feature boot) never even
  // evaluates until the user accepts:
  //   Accept   -> flag in localStorage, reload, full script boots.
  //   Decline  -> session-scoped flag, modal closes, script is absent
  //               (no listeners, no patches, no DOM) until next session.
  //   Undecided -> reload simply re-shows the modal.
  // Works because function declarations (showDisclaimerModal,
  // isDisclaimerAccepted, ...) hoist to the top of the IIFE scope, so
  // they are callable here even though defined in later modules.

  if (!isDisclaimerAccepted()) {
    if (!isDisclaimerDeclined()) {
      showDisclaimerModal();
    }
    return;
  }
