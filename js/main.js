/* Report User Trainer — shell logic
   The ElevenLabs widget handles the conversation (mic, TTS, transcript).
   This file wires up the two client tools the agent can call:
     navigate_to_page      — switch the Power BI report page
     request_human_trainer — open the escalation form */

(function () {
  "use strict";

  const reportFrame = document.getElementById("report-frame");

  /* ── 1. Client tool: agent-driven report navigation ──
     Fill in the ReportSection IDs. How to get them: open the report in
     Power BI Service, click through each page, and copy the
     "ReportSection..." part from the browser URL. */

  const REPORT_PAGES = {
    key_influencers:    "ReportSection76c409e0c333d60bb1e2",
    decomposition_tree: "ReportSectionacd41c847407a998c130",
    anomaly_detection:  "ReportSection909ea50e7939156807d6"
  };

   function navigateToPage(params) {
    const pageId = REPORT_PAGES[params.page];
    if (!pageId) {
      console.warn("[Report Trainer] Unknown page:", params.page);
      return "Error: that page is not configured on this site.";
    }

    const base = reportFrame.src.split("&pageName=")[0];
    const pageLabel = params.page.replace(/_/g, " ");

    /* Resolve only once the iframe has actually rendered — otherwise the agent
       starts describing a page the user can't see yet. */
    return new Promise(function (resolve) {
      let settled = false;

      function done(msg) {
        if (settled) return;
        settled = true;
        reportFrame.removeEventListener("load", onLoad);
        resolve(msg);
      }

      function onLoad() {
        /* Power BI still paints for a moment after the iframe 'load' event. */
        setTimeout(function () {
          done("Done. The " + pageLabel + " page is now visible in the report.");
        }, 2000);
      }

      reportFrame.addEventListener("load", onLoad);
      reportFrame.src = base + "&pageName=" + pageId;

      /* Safety net: never hang the agent if the report is slow or blocked. */
      setTimeout(function () {
        done("The " + pageLabel + " page is opening — it may take a moment.");
      }, 8000);
    });
  }

  /* ── 2. Client tool: escalate to a human trainer ──
     Set HANDOFF_WEBHOOK to a Teams / Slack / n8n endpoint that accepts a
     JSON POST. Left empty, the form still works and logs to the console. */

  const HANDOFF_WEBHOOK = "https://default2ee548e16be84729b86ef482e29d2c.9f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/7489e901e76343e29e95abf04e6365b1/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=XoG79qCssRQ6h9S-bxnHk7MXmRbw71WQKEcHGvYbIYA";

  const handoff = document.getElementById("handoff");
  const handoffQuestion = document.getElementById("handoff-question");
  const handoffEmail = document.getElementById("handoff-email");
  const handoffSend = document.getElementById("handoff-send");
  const handoffDone = document.getElementById("handoff-done");
  const handoffClose = document.getElementById("handoff-close");

  let pendingQuestion = "";

  function requestHumanTrainer(params) {
    pendingQuestion = params.question || "";
    handoffQuestion.textContent = pendingQuestion
      ? '"' + pendingQuestion + '"'
      : "";
    handoffDone.hidden = true;
    handoffSend.disabled = false;
    handoffEmail.disabled = false;
    handoff.hidden = false;
    handoffEmail.focus();
    return "Done. A contact form is now open on screen — ask the user to " +
           "enter their email there.";
  }

  function closeHandoff() { handoff.hidden = true; }

  handoffClose.addEventListener("click", closeHandoff);
  handoff.addEventListener("click", function (e) {
    if (e.target === handoff) closeHandoff();   /* click outside the card */
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !handoff.hidden) closeHandoff();
  });

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

    /* Every escalation is a gap in the knowledge base — worth logging. */
    console.info("[Report Trainer] Escalation to human trainer:", payload);

if (HANDOFF_WEBHOOK) {
      fetch(HANDOFF_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          "summary": "Question for a human trainer",
          "themeColor": "118DFF",
          "title": "Question for a human trainer",
          "sections": [{
            "facts": [
              { "name": "Question", "value": pendingQuestion || "(not captured)" },
              { "name": "Email", "value": email },
              { "name": "Report", "value": "Artificial Intelligence Sample" }
            ]
          }]
        })
      })
      .then(function (r) {
        console.info("[Report Trainer] Webhook response:", r.status, r.statusText);
      })
      .catch(function (err) {
        console.error("[Report Trainer] Webhook failed:", err);
      });
    }

    handoffSend.disabled = true;
    handoffEmail.disabled = true;
    handoffDone.hidden = false;
    setTimeout(closeHandoff, 2500);
  });

  /* ── 3. Register the client tools when a call starts ── */
  window.addEventListener("elevenlabs-convai:call", function (event) {
    event.detail.config.clientTools = {
      navigate_to_page: navigateToPage,
      request_human_trainer: requestHumanTrainer
    };
  });

  /* ── 4. Signed-in user (Azure Static Web Apps only) ──
     On GitHub Pages /.auth/me doesn't exist — fails silently, so the same
     code runs on both hosts. */
  fetch("/.auth/me")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      const principal = data && data.clientPrincipal;
      if (!principal) return;
      document.getElementById("agent-user-name").textContent = principal.userDetails;
      document.getElementById("agent-user").hidden = false;
    })
    .catch(function () { /* GitHub Pages — no auth endpoint, ignore */ });

  /* ── 5. Widget load check ── */
  window.addEventListener("load", function () {
    setTimeout(function () {
      if (!(window.customElements && window.customElements.get("elevenlabs-convai"))) {
        console.error(
          "[Report Trainer] ElevenLabs embed script did not load. " +
          "Check network access to unpkg.com and any CSP headers."
        );
      }
    }, 5000);
  });
})();
