/* EJZ Poppetje — interactive home-screen mascot. Offline, no CDN. */
(function () {
  "use strict";

  var mascot = document.getElementById("mascot");
  var stage = document.getElementById("stage");
  var head = document.getElementById("head");
  var face = document.getElementById("face");
  var eyeL = document.getElementById("eye-l");
  var eyeR = document.getElementById("eye-r");
  var smile = document.getElementById("smile");
  var phones = document.getElementById("phones");
  var cupL = document.getElementById("cup-l");
  var cupR = document.getElementById("cup-r");
  var micArm = document.getElementById("mic-arm");
  var shadow = document.getElementById("shadow");
  var bubbles = document.getElementById("bubbles");
  var form = document.getElementById("search-form");
  var input = document.getElementById("q");
  var micBtn = document.getElementById("mic-btn");
  var resultsEl = document.getElementById("results");
  var voiceHint = document.getElementById("voice-hint");
  var listenStatus = document.getElementById("listen-status");
  var shortcutInput = document.getElementById("shortcut-name");
  var voiceDebugToggle = document.getElementById("voice-debug");
  var voiceDebugLogEl = document.getElementById("voice-debug-log");
  var tiltBtn = document.getElementById("tilt-btn");
  var tapContinue = document.getElementById("tap-continue");

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", function (e) {
    reduced = e.matches;
  });

  var state = {
    phonesOn: true,
    thinking: false,
    busy: false,
    lastActivity: Date.now(),
    lookX: 0,
    lookY: 0,
    tiltX: 0,
    tiltY: 0,
    turn: 0,
    bounceY: 0,
    pointerId: null,
    startX: 0,
    startY: 0,
    moved: false,
    holdTimer: null,
    holdArmed: false,
    tiltEnabled: false,
    listening: false,
    recognition: null,
    conversation: false,
    dictationMode: false,
    pendingTranscript: "",
    silenceTimer: null,
    dictateTimer: null,
    speaking: false,
    submitLock: false,
    lastOpenUrl: "",
    noResultTimer: null,
    startWatchTimer: null,
    gotResult: false,
    gotAudio: false,
    speechUnlocked: false,
    lastTranscriptAt: 0,
    needsTap: false,
    starting: false
  };

  var IDLE_MS = 5000;
  var HOLD_MS = 460;
  var EYE_RANGE = 11;

  var GREET = ["Hoi!", "Hoi, tik maar.", "Zullen we iets ontwerpen?"];
  var TAP_LINES = ["Boing!", "Hoi!", "Leuk!", "Ik kijk mee.", "Nog een keertje?"];
  var IDLE_LINES = [
    "Wat zullen we maken?",
    "Ik kijk even rond.",
    "Kantel je telefoon eens.",
    "Houd me even vast.",
    "Aha, zo zit het.",
    "Even niks doen is ook goed."
  ];
  var THINK_LINES = ["Even nadenken…", "Ik zoek met je mee.", "Hmm."];

  if (typeof anime !== "undefined") anime.suspendWhenDocumentHidden = false;

  function now() { return Date.now(); }
  function activity() { state.lastActivity = now(); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function springEase() {
    return reduced ? "linear" : "easeOutElastic(1, 0.6)";
  }
  function backEase() {
    return reduced ? "linear" : "easeOutBack(1.6)";
  }
  function dur(ms) { return reduced ? 1 : ms; }

  function setLook(x, y, ms) {
    state.lookX = clamp(x, -1, 1);
    state.lookY = clamp(y, -1, 1);
    var tx = state.lookX * EYE_RANGE;
    var ty = state.lookY * EYE_RANGE;
    if (typeof anime === "undefined") {
      eyeL.style.transform = eyeR.style.transform = "translate(" + tx + "px," + ty + "px)";
      return;
    }
    anime({
      targets: [eyeL, eyeR],
      translateX: tx,
      translateY: ty,
      duration: dur(ms == null ? 180 : ms),
      easing: reduced ? "linear" : "easeOutQuad"
    });
  }

  function lookAtPoint(clientX, clientY) {
    var r = head.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    var dx = (clientX - cx) / (r.width * 0.7);
    var dy = (clientY - cy) / (r.height * 0.7);
    setLook(dx, dy, 140);
  }

  function iconScale() {
    if (document.body.classList.contains("closeup-mode")) return 1.95;
    if (document.body.classList.contains("maskable")) return 0.78;
    if (document.body.classList.contains("icon-mode")) return 1.5;
    return 1;
  }

  function applyMascotTransform() {
    var x = state.tiltX * 22;
    var y = state.tiltY * 16 + state.bounceY;
    var rot = state.tiltX * 8 + state.turn;
    mascot.style.transform = "translate(" + x + "px," + y + "px) rotate(" + rot + "deg) scale(" + iconScale() + ")";
    var s = 1 - Math.min(Math.abs(state.bounceY) / 80, 0.35);
    shadow.style.transform = "scaleX(" + s + ")";
    shadow.style.opacity = String(0.55 + 0.45 * s);
  }

  function smileOn(show) {
    if (!smile || typeof anime === "undefined") return;
    anime({
      targets: smile,
      opacity: show ? 1 : 0,
      scale: show ? 1 : 0.6,
      duration: dur(show ? 220 : 160),
      easing: backEase()
    });
  }

  function blink(times) {
    times = times || 1;
    if (typeof anime === "undefined") return Promise.resolve();
    return anime({
      targets: [eyeL, eyeR],
      scaleY: [
        { value: 0.12, duration: dur(70), easing: "easeInQuad" },
        { value: 1, duration: dur(90), easing: "easeOutQuad" }
      ],
      delay: anime.stagger(0),
      loop: times,
      easing: "linear"
    }).finished;
  }

  function bounce() {
    if (typeof anime === "undefined") return Promise.resolve();
    if (reduced) {
      blink(1);
      return Promise.resolve();
    }
    var obj = { y: 0 };
    return anime({
      targets: obj,
      y: [
        { value: -28, duration: 220, easing: "easeOutCubic" },
        { value: 6, duration: 200, easing: "easeInCubic" },
        { value: -10, duration: 180, easing: "easeOutBack(1.8)" },
        { value: 0, duration: 280, easing: "easeOutElastic(1, 0.7)" }
      ],
      update: function () {
        state.bounceY = obj.y;
        applyMascotTransform();
      }
    }).finished;
  }

  function turnHead(dir) {
    if (typeof anime === "undefined") return;
    var target = dir * 18;
    var obj = { t: state.turn };
    anime({
      targets: obj,
      t: target,
      duration: dur(420),
      easing: springEase(),
      update: function () {
        state.turn = obj.t;
        applyMascotTransform();
      },
      complete: function () {
        anime({
          targets: obj,
          t: 0,
          delay: dur(700),
          duration: dur(500),
          easing: "easeOutQuad",
          update: function () {
            state.turn = obj.t;
            applyMascotTransform();
          }
        });
      }
    });
    setLook(dir * 0.85, 0.05, 280);
  }

  var AVATAR = '<svg class="bubble-avatar" viewBox="8 12 184 184" aria-hidden="true"><g transform="rotate(-8 100 108)"><circle cx="100" cy="108" r="62" fill="#000"/><path d="M 30.46 82.69 A 74 74 0 0 1 169.54 82.69" fill="none" stroke="#3F8C66" stroke-width="14" stroke-linecap="round"/><rect x="16" y="86" width="28" height="52" rx="14" fill="#3F8C66"/><rect x="156" y="86" width="28" height="52" rx="14" fill="#3F8C66"/><path d="M 36 128 Q 44 144 63 143" fill="none" stroke="#3F8C66" stroke-width="6" stroke-linecap="round"/><rect x="52" y="136" width="22" height="14" rx="7" fill="#3F8C66"/><g transform="rotate(8 103.5 105)"><rect x="96" y="90" width="15" height="30" rx="7.5" fill="#fff"/></g><g transform="rotate(8 131.5 105)"><rect x="124" y="90" width="15" height="30" rx="7.5" fill="#fff"/></g></g></svg>';

  function bubble(text, who, opts) {
    if (!text) return null;
    who = who || "bot";
    opts = opts || {};
    var row = document.createElement("div");
    row.className = "bubble-row " + (who === "user" ? "user" : "bot");
    if (opts.action) row.classList.add("has-action");
    if (who !== "user") row.innerHTML = AVATAR;
    var el = document.createElement("div");
    el.className = "bubble" + (who === "user" ? " user" : "");
    el.textContent = text;
    if (opts.action) {
      var actions = document.createElement("div");
      actions.className = "bubble-actions";
      actions.appendChild(opts.action);
      el.appendChild(actions);
    }
    row.appendChild(el);
    bubbles.appendChild(row);
    try { bubbles.scrollTop = bubbles.scrollHeight; } catch (err) {}
    if (typeof anime !== "undefined" && !reduced) {
      anime.remove(el);
      anime({
        targets: el,
        translateY: [18, 0],
        opacity: [0, 1],
        scale: [0.86, 1],
        duration: 520,
        easing: "easeOutElastic(1, 0.7)"
      });
    } else {
      el.style.opacity = "1";
    }
    var sticky = opts.sticky !== false && (who === "user" || state.conversation || state.dictationMode || opts.action);
    if (!sticky) {
      var life = reduced ? 1800 : 2400;
      if (typeof anime !== "undefined" && !reduced) {
        setTimeout(function () {
          if (!el.parentNode) return;
          anime({
            targets: el,
            opacity: 0,
            translateY: -10,
            duration: 280,
            easing: "easeInQuad",
            complete: function () { if (row.parentNode) row.remove(); }
          });
        }, life);
      } else {
        setTimeout(function () { if (row.parentNode) row.remove(); }, life);
      }
    }
    while (bubbles.children.length > 6) bubbles.removeChild(bubbles.firstChild);
    bobMic();
    return row;
  }

  function setMicRotate(angle, instant, delay) {
    if (!micArm) return;
    if (typeof anime === "undefined" || instant || reduced) {
      if (typeof anime !== "undefined") anime.set(micArm, { rotate: angle });
      else micArm.style.transform = "rotate(" + angle + "deg)";
      return;
    }
    anime.remove(micArm);
    anime({
      targets: micArm,
      rotate: angle,
      duration: dur(560),
      delay: delay || 0,
      easing: "easeOutElastic(1, 0.6)"
    });
  }

  function bobMic() {
    var q = new URLSearchParams(location.search);
    if (q.has("shot") || q.has("closeup") || q.has("icon")) return;
    if (!micArm || !state.phonesOn || reduced || typeof anime === "undefined") return;
    anime.remove(micArm);
    anime({
      targets: micArm,
      rotate: [0, 12, -7, 4, 0],
      duration: 720,
      easing: "easeInOutQuad"
    });
  }

  function setHeadphones(on, instant) {
    state.phonesOn = !!on;
    if (typeof anime === "undefined") {
      phones.style.transform = on ? "translateY(0)" : "translateY(-86px)";
      phones.style.opacity = on ? "1" : "0.95";
      return Promise.resolve();
    }
    if (instant || reduced) {
      anime.set(phones, {
        translateY: on ? 0 : -86,
        rotate: 0,
        opacity: on ? 1 : 0.9,
        scale: on ? 1 : 0.92
      });
      setMicRotate(0, true);
      return Promise.resolve();
    }
    if (on) {
      anime.set(phones, { translateY: -86, rotate: -10, opacity: 1, scale: 1 });
      setMicRotate(-34, true);
      var drop = anime({
        targets: phones,
        translateY: [
          { value: 8, duration: 380, easing: "easeInCubic" },
          { value: 0, duration: 420, easing: "easeOutElastic(1, 0.55)" }
        ],
        rotate: [
          { value: 0, duration: 380, easing: "easeInCubic" }
        ]
      }).finished;
      anime({
        targets: head,
        scaleY: [1, 0.88, 1.07, 1],
        scaleX: [1, 1.1, 0.96, 1],
        duration: 560,
        delay: 360,
        easing: "easeOutQuad"
      });
      anime({
        targets: [cupL, cupR],
        scale: [1, 1.1, 1],
        duration: 320,
        delay: 360,
        easing: "easeOutBack(1.7)"
      });
      setMicRotate(0, false, 420);
      return drop;
    }
    return anime({
      targets: phones,
      translateY: -86,
      rotate: 8,
      scale: 0.92,
      duration: 480,
      easing: "easeOutBack(1.4)"
    }).finished;
  }

  function toggleHeadphones() {
    activity();
    var next = !state.phonesOn;
    setHeadphones(next, false);
    bubble(next ? "Klik. Zit ’ie." : "Even afzetten.");
    smileOn(next);
    if (next) setTimeout(function () { smileOn(false); }, 900);
  }

  function tapReact() {
    activity();
    smileOn(true);
    bounce();
    blink(1);
    if (Math.random() < 0.7) {
      bubble(TAP_LINES[Math.floor(Math.random() * TAP_LINES.length)]);
    }
    setTimeout(function () { smileOn(false); }, 700);
  }

  function startThinking() {
    state.thinking = true;
    activity();
    setLook(0.15, 0.95, 280);
    if (reduced || typeof anime === "undefined") return;
    anime({
      targets: head,
      rotate: [0, -8, 8, -5, 0],
      duration: 1400,
      easing: "easeInOutQuad"
    });
  }

  function stopThinking() {
    state.thinking = false;
    setLook(0, 0, 320);
    if (typeof anime !== "undefined") {
      anime({ targets: head, rotate: 0, duration: dur(280), easing: "easeOutQuad" });
    }
  }

  var thinkLinesShown = false;
  function onType() {
    activity();
    if (input.value.trim()) {
      if (!state.thinking) startThinking();
      else setLook(0.15, 0.95, 200);
      if (!thinkLinesShown && !state.conversation && !state.dictationMode && !state.listening) {
        bubble(THINK_LINES[Math.floor(Math.random() * THINK_LINES.length)]);
        thinkLinesShown = true;
      }
    } else {
      thinkLinesShown = false;
      if (state.thinking) stopThinking();
    }
  }


  var VERSION = "v9-live";

  /* Gedeelde gespreks-engine (assets/engine.js): één langlevende herkenner. */
  var engine = window.PoppetjeEngine.create({
    state: state,
    storagePrefix: "poppetje",
    voice: "any",
    micLabel: "Praat met het poppetje",
    persona: { whoami: "Ik ben je EJZ-poppetje, met koptelefoon.", hello: "Hoi! Waar kan ik je mee helpen?" },
    els: {
      form: form,
      input: input,
      micBtn: micBtn,
      results: resultsEl,
      voiceHint: voiceHint,
      listenStatus: listenStatus,
      shortcutInput: shortcutInput,
      debugToggle: voiceDebugToggle,
      debugLog: voiceDebugLogEl,
      tapContinue: tapContinue
    },
    hooks: {
      bubble: function (t, who, o) { return bubble(t, who, o); },
      startThinking: function () { smileOn(true); startThinking(); },
      stopThinking: function () { setTimeout(function () { smileOn(false); stopThinking(); }, 300); },
      smile: smileOn,
      onSpeakStart: function () { bobMic(); },
      onListening: function (on) {
        if (on) {
          activity();
          if (!state.phonesOn) setHeadphones(true, false);
          setLook(0, 0.2, 200);
        } else if (!state.conversation) {
          setLook(0, 0, 240);
        }
      },
      onDone: function () { smileOn(true); setTimeout(function () { smileOn(false); }, 600); },
      onPlayful: function () { bounce(); },
      activity: activity
    }
  });
  var continueFromTap = engine.continueFromTap;

  input.addEventListener("input", onType);
  input.addEventListener("focus", function () {
    activity();
    if (input.value.trim()) startThinking();
    else setLook(0.1, 0.85, 240);
  });
  input.addEventListener("blur", function () {
    thinkLinesShown = false;
    if (state.thinking) stopThinking();
    else if (!state.listening) setLook(0, 0, 280);
  });

  function clearHold() {
    if (state.holdTimer) {
      clearTimeout(state.holdTimer);
      state.holdTimer = null;
    }
    state.holdArmed = false;
  }

  stage.addEventListener("pointerdown", function (e) {
    if (state.needsTap) {
      e.preventDefault();
      e.stopPropagation();
      continueFromTap("stage");
      return;
    }
    if (e.target.closest && e.target.closest("input, button, a, form")) return;
    if (state.pointerId !== null) return;
    state.pointerId = e.pointerId;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.moved = false;
    activity();
    lookAtPoint(e.clientX, e.clientY);
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    state.holdTimer = setTimeout(function () {
      state.holdArmed = true;
      toggleHeadphones();
    }, HOLD_MS);
  });

  stage.addEventListener("pointermove", function (e) {
    if (state.pointerId !== e.pointerId) {
      if (state.pointerId === null && e.buttons) return;
      if (state.pointerId === null) {
        lookAtPoint(e.clientX, e.clientY);
      }
      return;
    }
    var dx = e.clientX - state.startX;
    var dy = e.clientY - state.startY;
    if (Math.hypot(dx, dy) > 10) {
      state.moved = true;
      clearHold();
    }
    lookAtPoint(e.clientX, e.clientY);
  });

  /* Eyes also follow a finger that is not a press, e.g. hover on desktop */
  document.addEventListener("pointermove", function (e) {
    if (state.pointerId !== null) return;
    if (e.pointerType === "touch") return;
    lookAtPoint(e.clientX, e.clientY);
  });

  function endPointer(e) {
    if (state.pointerId !== e.pointerId) return;
    var dx = e.clientX - state.startX;
    var dy = e.clientY - state.startY;
    var armed = state.holdArmed;
    clearHold();
    state.pointerId = null;
    if (armed) return;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) {
      activity();
      turnHead(dx > 0 ? 1 : -1);
      return;
    }
    if (!state.moved) tapReact();
  }

  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", function (e) {
    if (state.pointerId !== e.pointerId) return;
    clearHold();
    state.pointerId = null;
  });

  stage.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  /* Device orientation (iOS needs a permission button). */
  function onOrient(e) {
    if (!state.tiltEnabled) return;
    var g = typeof e.gamma === "number" ? e.gamma : 0;
    var b = typeof e.beta === "number" ? e.beta : 45;
    state.tiltX = clamp(g, -30, 30) / 30;
    state.tiltY = clamp(b - 45, -30, 30) / 30;
    applyMascotTransform();
    var eyesFromTilt = Math.abs(state.tiltX) + Math.abs(state.tiltY) > 0.05;
    if (eyesFromTilt && state.pointerId === null && !state.thinking) {
      setLook(state.tiltX * 0.8, state.tiltY * 0.6, 80);
    }
  }

  function enableTilt() {
    window.addEventListener("deviceorientation", onOrient, true);
    state.tiltEnabled = true;
    tiltBtn.hidden = true;
    bubble("Kantelen staat aan.");
    activity();
  }

  function setupTiltButton() {
    var needs =
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function";
    if (needs) {
      tiltBtn.hidden = false;
      tiltBtn.addEventListener("click", function () {
        DeviceOrientationEvent.requestPermission()
          .then(function (res) {
            if (res === "granted") enableTilt();
            else bubble("Geen toestemming voor kantelen.");
          })
          .catch(function () {
            bubble("Kantelen lukte niet.");
          });
      });
    } else if (typeof DeviceOrientationEvent !== "undefined" && /Mobi|iPhone|Android/i.test(navigator.userAgent)) {
      enableTilt();
      tiltBtn.hidden = true;
    }
  }

  /* Idle after 5s of no interaction. */
  var idleAnims = [
    function () { return blink(2); },
    function () {
      setLook(-0.8, 0.05, 400);
      return new Promise(function (r) {
        setTimeout(function () {
          setLook(0.8, 0.1, 400);
          setTimeout(function () { setLook(0, 0, 400); r(); }, 700);
        }, 600);
      });
    },
    function () {
      bubble(IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)]);
      smileOn(true);
      return bounce().then(function () { smileOn(false); });
    },
    function () {
      if (!state.phonesOn || reduced) return blink(1);
      return anime({
        targets: phones,
        rotate: [0, -6, 6, 0],
        duration: 700,
        easing: "easeInOutQuad"
      }).finished;
    }
  ];

  var idleRunning = false;
  setInterval(function () {
    if (reduced || idleRunning || state.thinking || state.listening || state.conversation || state.speaking || state.pointerId !== null) return;
    if (now() - state.lastActivity < IDLE_MS) return;
    idleRunning = true;
    var fn = idleAnims[Math.floor(Math.random() * idleAnims.length)];
    Promise.resolve(fn()).catch(function () {}).then(function () {
      idleRunning = false;
      state.lastActivity = now();
    });
  }, 400);

  /* Keyboard: keep mascot visible above the iOS keyboard. */
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () {
      var kb = window.innerHeight - window.visualViewport.height;
      document.querySelector(".app").style.transform =
        kb > 80 ? "translateY(" + (-Math.min(kb * 0.28, 90)) + "px)" : "";
    });
  }

  /* Icon capture helper (?icon=1 or ?icon=maskable). */
  var params = new URLSearchParams(location.search);
  if (params.has("icon")) {
    document.body.classList.add("icon-mode");
    if (params.get("icon") === "maskable") document.body.classList.add("maskable");
  }
  if (params.has("closeup")) {
    document.body.classList.add("closeup-mode");
  }

  /* Public hooks for screenshots / checks. */
  window.__poppetje = {
    version: VERSION,
    engine: engine,
    setHeadphones: setHeadphones,
    bounce: bounce,
    blink: blink,
    bubble: bubble,
    turn: turnHead,
    look: setLook,
    smile: smileOn,
    startThinking: startThinking,
    stopThinking: stopThinking,
    activity: activity,
    wait: wait,
    state: state,
    handleQuery: engine.handleQuery,
    submitUtterance: engine.submitTurn,
    startConversation: engine.startConversation,
    endConversation: engine.endConversation,
    tryArithmetic: engine.tryArithmetic,
    classifyQuery: engine.classifyQuery,
    speak: engine.speak,
    continueFromTap: engine.continueFromTap,
    showTapToContinue: engine.showTap
  };

  function greet() {
    if (params.has("icon") || params.has("shot") || params.has("closeup")) return;
    setTimeout(function () {
      bubble(GREET[0]);
      smileOn(true);
      setTimeout(function () { smileOn(false); }, 900);
    }, reduced ? 0 : 280);
  }

  setupTiltButton();
  applyMascotTransform();
  greet();

  if (!params.has("icon") && !params.has("shot") && !params.has("closeup") && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  }
})();
