/* Report User Trainer — shell logic
   The ElevenLabs widget handles the conversation (mic, TTS, transcript).
   This file wires up the client tools the agent can call:
     navigate_to_page        — switch the Power BI report page
     request_human_trainer   — open the escalation form
     show_inspiration_video  — show a short inspiration video
     open_report_link        -  open Report Link  */

(function () {
  "use strict";

  const reportFrame = document.getElementById("report-frame");

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
    /* Uncomment to show the intro only once per browser:
    if (localStorage.getItem("reportTrainerIntroSeen")) {
      hideVideoOverlay();
    } else {
      localStorage.setItem("reportTrainerIntroSeen", "true");
    }
    */

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

  inspirationClose.addEventListener("click", closeInspirationVideo);
  inspirationModal.addEventListener("click", function (e) {
    if (e.target === inspirationModal) closeInspirationVideo();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !inspirationModal.hidden) closeInspirationVideo();
  });

   /* ── 3. Client tool: open the report in Power BI (new tab) ──
     The URL is hardcoded on purpose — same safety pattern as navigation
     and inspiration videos: the agent triggers the action, it never
     supplies or recites a URL itself. */

  const REPORT_DIRECT_LINK =
    "https://app.powerbi.com/reportEmbed?reportId=e8176c05-e6b3-4de6-bcfc-38ac625e1e13&autoAuth=true&ctid=2ee548e1-6be8-4729-b86e-f482e29d2c9f";

  function openReportLink() {
    window.open(REPORT_DIRECT_LINK, "_blank", "noopener");
    return "Done. The report has opened in a new browser tab.";
  }
   
  /* ── 4. Client tool: escalate to a human trainer ──
     Set HANDOFF_WEBHOOK to the Power Automate flow endpoint. Left empty,
     the form still works and logs to the console. */

  const HANDOFF_WEBHOOK = "https://default2ee548e16be84729b86ef482e29d2c.9f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/451e4aab07094a5ba18a85afd0a8085d/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=t-qqVgWweRwYRrjYD0tI4Ipf-Da7W4eKc2bO5MNOzlk";

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
          question: pendingQuestion || "(not captured)",
          email: email,
          report: "Artificial Intelligence Sample"
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

  /* ── 5. Register the client tools when a call starts ── */
  window.addEventListener("elevenlabs-convai:call", function (event) {
    event.detail.config.clientTools = {
      navigate_to_page: navigateToPage,
      request_human_trainer: requestHumanTrainer,
      show_inspiration_video: showInspirationVideo,
      open_report_link: openReportLink       
    };
  });

  /* ── 6. Signed-in user (Azure Static Web Apps only) ──
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

  /* ── 7. Widget load check ── */
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
