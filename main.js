/* Report User Trainer — shell logic
   Keep this minimal: the ElevenLabs widget handles the whole
   conversation (mic, TTS, transcript). This file only manages
   the page shell around it. */

(function () {
  "use strict";

  const POWERBI_PLACEHOLDER = "POWERBI_EMBED_URL";
  const AGENT_PLACEHOLDER = "ELEVENLABS_AGENT_ID";

  const reportFrame = document.getElementById("report-frame");
  const statusText = document.getElementById("agent-status-text");
  const statusDot = document.getElementById("agent-status-dot");
  const panel = document.getElementById("agent-panel");
  const toggle = document.getElementById("panel-toggle");

  /* ── 1. Panel collapse/expand ── */
  toggle.addEventListener("click", function () {
    const collapsed = panel.classList.toggle("collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.title = collapsed ? "Expand panel" : "Collapse panel";
  });

  /* ── 2. Config sanity checks (dev aid — visible in console) ── */
  if (reportFrame.getAttribute("src") === POWERBI_PLACEHOLDER) {
    console.warn(
      "[Report Trainer] Power BI URL not set. " +
      "Replace POWERBI_EMBED_URL in index.html with the 'Publish to web' link."
    );
  }

  const convai = document.querySelector("elevenlabs-convai");
  if (convai && convai.getAttribute("agent-id") === AGENT_PLACEHOLDER) {
    console.warn(
      "[Report Trainer] ElevenLabs agent ID not set. " +
      "Replace ELEVENLABS_AGENT_ID in index.html with your agent's ID."
    );
    statusText.textContent = "Agent not configured yet";
    statusDot.style.background = "#A19F9D";
    statusDot.style.boxShadow = "none";
  }

  /* ── 3. Client tool: agent-driven report navigation ──
     The ElevenLabs agent calls navigate_to_page({ page }) and we swap
     the iframe URL. "Publish to web" supports the pageName parameter,
     so switching = reloading the iframe on the requested page.

     Fill in the ReportSection IDs below. How to get them: open the
     report in Power BI Service, click through each page, and copy the
     "ReportSection..." part from the end of the browser URL. */

  const REPORT_PAGES = {
    key_influencers:   "REPORTSECTION_ID_1",
    decomposition_tree: "REPORTSECTION_ID_2",
    anomaly_detection: "REPORTSECTION_ID_3"
  };

  function navigateToPage(params) {
    const pageId = REPORT_PAGES[params.page];
    if (!pageId || pageId.indexOf("REPORTSECTION_ID") === 0) {
      console.warn("[Report Trainer] Unknown or unconfigured page:", params.page);
      return "Error: page not configured on this site.";
    }
    const base = reportFrame.src.split("&pageName=")[0];
    reportFrame.src = base + "&pageName=" + pageId;
    return "Done. The " + params.page.replace(/_/g, " ") +
           " page is now loading in the report.";
  }

  /* ── 4. Client tool: escalate to a human trainer ──
     The agent calls request_human_trainer({ question }) when it can't
     answer or the user asks for a person. We reveal a small form in the
     panel; on send we forward the unanswered question + email.

     Set HANDOFF_WEBHOOK to a Teams/Slack incoming webhook (or any
     endpoint that accepts a JSON POST). Left empty, the form still
     works and just logs to the console — fine for demo. */

  const HANDOFF_WEBHOOK = "";

  const handoff = document.getElementById("handoff");
  const handoffQuestion = document.getElementById("handoff-question");
  const handoffEmail = document.getElementById("handoff-email");
  const handoffSend = document.getElementById("handoff-send");
  const handoffDone = document.getElementById("handoff-done");

  let pendingQuestion = "";

  function requestHumanTrainer(params) {
    pendingQuestion = params.question || "";
    handoffQuestion.textContent = pendingQuestion
      ? '"' + pendingQuestion + '"'
      : "";
    handoff.hidden = false;
    handoffDone.hidden = true;
    handoff.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return "Done. A contact form is now open in the panel — ask the user " +
           "to enter their email there.";
  }

  handoffSend.addEventListener("click", function () {
    const email = handoffEmail.value.trim();
    if (!email || email.indexOf("@") === -1) {
      handoffEmail.focus();
      return;
    }

    const payload = {
      question: pendingQuestion,
      email: email,
      report: "Artificial Intelligence Sample",
      at: new Date().toISOString()
    };

    /* Every escalation is a gap in the knowledge base — worth logging
       even when no webhook is configured. */
    console.info("[Report Trainer] Escalation to human trainer:", payload);

    if (HANDOFF_WEBHOOK) {
      fetch(HANDOFF_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(function (err) {
        console.error("[Report Trainer] Escalation webhook failed:", err);
      });
    }

    handoffSend.disabled = true;
    handoffEmail.disabled = true;
    handoffDone.hidden = false;
  });

  /* Register client tools when the widget starts a call */
  window.addEventListener("elevenlabs-convai:call", function (event) {
    event.detail.config.clientTools = {
      navigate_to_page: navigateToPage,
      request_human_trainer: requestHumanTrainer
    };
  });

  /* ── 5. Signed-in user (Azure Static Web Apps only) ──
     On Azure SWA, /.auth/me returns the logged-in Entra user.
     On GitHub Pages this endpoint doesn't exist — we fail silently,
     so the same code runs on both hosts. */
  fetch("/.auth/me")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      const principal = data && data.clientPrincipal;
      if (!principal) return;
      document.getElementById("agent-user-name").textContent =
        principal.userDetails;
      document.getElementById("agent-user").hidden = false;
    })
    .catch(function () { /* GitHub Pages — no auth endpoint, ignore */ });

  /* ── 6. Widget load status ──
     The embed script upgrades <elevenlabs-convai> into a custom element.
     If that hasn't happened a few seconds after load, surface it. */
  window.addEventListener("load", function () {
    setTimeout(function () {
      const defined = window.customElements &&
        window.customElements.get("elevenlabs-convai");
      if (!defined) {
        statusText.textContent = "Voice widget failed to load";
        statusDot.style.background = "#C4314B";
        statusDot.style.boxShadow = "none";
        console.error(
          "[Report Trainer] ElevenLabs embed script did not load. " +
          "Check network access to unpkg.com and any CSP headers."
        );
      }
    }, 5000);
  });
})();
