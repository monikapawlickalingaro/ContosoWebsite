/* Report User Trainer — shell logic
   The ElevenLabs widget handles the conversation (mic, TTS, transcript).
   This file wires up the client tools the agent can call:
     navigate_to_page        — switch the Power BI report page
     request_human_trainer   — open the escalation form
     show_inspiration_video  — show a short inspiration video
     open_report_link        — open the full report in a new tab

   ARCHITECTURE NOTE (2026-07): the Teams webhook call no longer happens
   here. It now lives as a server-side "Webhook Tool" (escalate_to_human_trainer)
   configured directly on the ElevenLabs agent, with the Power Automate URL
   and auth secret stored there — never shipped to the browser.
   This file's job for escalation is now only: collect the email, then hand
   it back to the agent via sendContextualUpdate() so the agent can call
   that server-side tool itself. */

(function () {
  "use strict";

  const reportFrame = document.getElementById("report-frame");

  /* Reference to the <elevenlabs-convai> element, captured the moment a
     call starts. Needed so we can call widget.sendContextualUpdate(). */
  let widgetEl = null;

  /* ── 0. Intro video overlay ──
     Try to autoplay WITH sound first — works for returning visitors and
     many browsers on a first visit too. If the browser blocks it, fall
     back to muted autoplay with a visible "tap for sound" button, so the
     video is never broken either way. */

  const videoOverlay = document.getElementById("video-overlay");
  const introVideo = document.getElementById("intro-video");
  const videoClose = document.getElementById("video-close");
  const videoUnmute = document.getElementById("video-unmute");

  function hideVideoOverlay() {
    videoOverlay.hidden = true;
    introVideo.pause();
  }

  if (videoOverlay && introVideo && videoClose && videoUnmute) {
    introVideo.addEventListener("ended", hideVideoOverlay);
    videoClose.addEventListener("click", hideVideoOverlay);

    videoUnmute.addEventListener("click", function () {
      introVideo.muted = false;
      introVideo.play().catch(function () {});
      videoUnmute.hidden = true;
    });

    /* Attempt 1: autoplay with sound. */
    videoUnmute.hidden = true;
    introVideo.play().catch(function () {
      /* Blocked — fall back to muted autoplay and show the button. */
      introVideo.muted = true;
      videoUnmute.hidden = false;
      introVideo.play().catch(function () {
        /* Even muted autoplay can be blocked in rare cases — the button
           stays visible so a click can still start it. */
      });
    });
  } else if (videoOverlay) {
    console.warn(
      "[Report Trainer] Video overlay markup incomplete — check that " +
      "index.html has #intro-video, #video-close, and #video-unmute."
    );
  }

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

  /* ── 2. Client tool: show an inspiration video ──
     Videos are hardcoded on purpose, keyed by topic — the agent picks
     from this fixed list, it never supplies an arbitrary URL. That keeps
     a voice agent from ever being able to embed unknown content on the
     page. Add more entries here as you record more videos. */

  const INSPIRATION_VIDEOS = {
    general: "IjeWd6krkwQ"
    /* voice_navigation: "SOME_OTHER_VIDEO_ID", */
    /* escalation_demo:  "SOME_OTHER_VIDEO_ID", */
  };

  const inspirationModal = document.getElementById("inspiration-video");
  const inspirationFrame = document.getElementById("inspiration-video-frame");
  const inspirationClose = document.getElementById("inspiration-video-close");

  function showInspirationVideo(params) {
    const key = (params && params.video) || "general";
    const videoId = INSPIRATION_VIDEOS[key];
    if (!videoId) {
      console.warn("[Report Trainer] Unknown inspiration video:", key);
      return "Error: that video is not configured on this site.";
    }
    inspirationFrame.src =
      "https://www.youtube.com/embed/" + videoId + "?autoplay=1";
    inspirationModal.hidden = false;
    return "Done. The video is now playing on screen.";
  }

  function closeInspirationVideo() {
    inspirationModal.hidden = true;
    inspirationFrame.src = "";   /* clears the iframe so playback stops */
  }

  if (inspirationClose) {
    inspirationClose.addEventListener("click", closeInspirationVideo);
  }
  if (inspirationModal) {
    inspirationModal.addEventListener("click", function (e) {
      if (e.target === inspirationModal) closeInspirationVideo();
    });
  }

  /* ── 2b. Client tool: open the report in Power BI (new tab) ──
     The URL is hardcoded on purpose — same safety pattern as navigation
     and inspiration videos: the agent triggers the action, it never
     supplies or recites a URL itself. */

  const REPORT_DIRECT_LINK =
    "https://app.powerbi.com/groups/me/reports/d724f3b0-8c9e-454d-8c54-30a245b070ba/ReportSection76c409e0c333d60bb1e2?experience=power-bi";

  function openReportLink() {
    window.open(REPORT_DIRECT_LINK, "_blank", "noopener");
    return "Done. The report has opened in a new browser tab.";
  }

  /* ── 3. Client tool: escalate to a human trainer ──
     This tool ONLY opens the on-screen form and captures the question.
     It no longer sends anything itself — no webhook URL, no secret here.
     Once the user submits their email, we push it back into the
     conversation via sendContextualUpdate(); the agent then calls its own
     server-side "escalate_to_human_trainer" webhook tool to actually notify
     Teams. */

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
    if (e.key === "Escape") {
      closeHandoff();
      closeInspirationVideo();
    }
  });

  handoffSend.addEventListener("click", function () {
    const email = handoffEmail.value.trim();
    if (!email || email.indexOf("@") === -1) {
      handoffEmail.focus();
      return;
    }

    const payload = {
      question: pendingQuestion || "(not captured)",
      email: email,
      report: "Artificial Intelligence Sample",
      at: new Date().toISOString()
    };

    /* Every escalation is a gap in the knowledge base — worth logging. */
    console.info("[Report Trainer] Escalation submitted:", payload);

    /* Hand the email back to the agent instead of calling the webhook
       ourselves. sendContextualUpdate() is silent — it won't make the
       agent speak on its own — but the agent's next turn (or its own
       judgement) can act on it and call escalate_to_human_trainer with
       the full payload.
       NOTE: sendContextualUpdate() must exist on the widget element for
       this to work. If your installed @elevenlabs/convai-widget-embed
       version doesn't expose it, this will throw and we fall back to
       just logging — nothing breaks, but Teams won't get notified until
       this is fixed. Test this path first. */
    try {
      if (widgetEl && typeof widgetEl.sendContextualUpdate === "function") {
        widgetEl.sendContextualUpdate(
          "The user submitted the escalation form. " +
          "Question: \"" + payload.question + "\". " +
          "Email: " + payload.email + ". " +
          "Report: " + payload.report + ". " +
          "Call escalate_to_human_trainer now with these details."
        );
      } else {
        console.error(
          "[Report Trainer] widget.sendContextualUpdate is not available — " +
          "the agent was not notified. Check the ElevenLabs widget version."
        );
      }
    } catch (err) {
      console.error("[Report Trainer] sendContextualUpdate failed:", err);
    }

    handoffSend.disabled = true;
    handoffEmail.disabled = true;
    handoffDone.hidden = false;
    setTimeout(closeHandoff, 2500);
  });

  /* ── 4. Register the client tools when a call starts ── */
  window.addEventListener("elevenlabs-convai:call", function (event) {
    /* Capture the widget element so requestHumanTrainer's handler can
       reach it later via sendContextualUpdate(). */
    widgetEl = event.target;

    event.detail.config.clientTools = {
      navigate_to_page: navigateToPage,
      request_human_trainer: requestHumanTrainer,
      show_inspiration_video: showInspirationVideo,
      open_report_link: openReportLink
    };
  });

  /* ── 5. Signed-in user (Azure Static Web Apps only) ──
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

  /* ── 6. Widget load check ── */
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
