/* Franka — grafietgezicht met standen, op dezelfde gespreks-engine als het poppetje.
   Regels van Franka: rust = kalm, licht ondeugende glimlach, directe blik, af en toe knipperen;
   hand bij de kin alleen tijdens nadenken; opgetrokken wenkbrauw subtiel bij speelse reacties;
   geen nagemaakte praatmond; knikken bij klaar, nee-schudden bij een fout. */
(function () {
  "use strict";

  var VERSION = "v10";
  var canvas = document.getElementById("face");
  var ctx = canvas.getContext("2d");
  var faceWrap = document.getElementById("face-wrap");
  var stage = document.getElementById("stage");
  var bubbles = document.getElementById("bubbles");
  var chat = document.getElementById("chat");
  var resultsEl = document.getElementById("results");
  var input = document.getElementById("q");
  var CW = 192, CH = 208;
  var BLINK_MS = 65; /* korte, natuurlijke knipper (frames 1-4 van idle) */
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var params = new URLSearchParams(location.search);

  var state = { lastActivity: Date.now() };
  var atlas = null;
  var sheet = new Image();
  var ready = false;

  /* Standen: rust | denken | speels | klaar | nee. Luisteren en praten tonen het rustgezicht. */
  var face = {
    mode: "rust",
    oneShot: null,        /* { anim, frame, until, then } */
    blinkAt: Date.now() + 2500,
    blink: null,
    lookDeg: null,
    lookUntil: 0,
    thinkFrame: 0,
    thinkUntil: 0,
    lastKey: ""
  };

  function anim(name) { return atlas && atlas.animations[name]; }

  function draw(row, col) {
    var key = row + ":" + col;
    if (key === face.lastKey) return;
    face.lastKey = key;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sheet, col * CW, row * CH, CW, CH, 0, 0, canvas.width, canvas.height);
  }

  function drawLook(deg) {
    var best = atlas.look_directions[0], bestDiff = 999;
    atlas.look_directions.forEach(function (d) {
      var diff = Math.abs(d.degrees - deg);
      if (diff > 180) diff = 360 - diff;
      if (diff < bestDiff) { bestDiff = diff; best = d; }
    });
    draw(best.row, best.column);
  }

  function playOnce(name, then) {
    var a = anim(name);
    if (!a) return;
    face.blink = null;
    var slow = (name === "review" || name === "failed") ? 1.35 : 1;
    face.oneShot = { name: name, frame: 0, slow: slow, until: performance.now() + (reduced ? 600 : a.durations_ms[0] * slow), then: then || null };
  }

  function setMode(mode) {
    if (face.mode === mode) return;
    face.mode = mode;
    face.thinkFrame = 0;
    face.thinkUntil = 0;
    document.body.setAttribute("data-franka", mode);
  }

  function render(now) {
    if (!ready) return;
    var a;
    /* 1. Eenmalige animatie (knik, nee, wenkbrauw) */
    if (face.oneShot) {
      var os = face.oneShot;
      a = anim(os.name);
      if (now >= os.until) {
        if (reduced) { os.frame = a.frames; }
        else {
          os.frame += 1;
          if (os.frame < a.frames) os.until = now + a.durations_ms[os.frame] * (os.slow || 1);
        }
      }
      if (os.frame >= a.frames) {
        face.oneShot = null;
        if (os.then) os.then();
      } else {
        draw(a.row, reduced ? Math.min(1, a.frames - 1) : os.frame);
        return;
      }
    }
    /* 2. Nadenken: hand bij de kin (loop) */
    if (face.mode === "denken") {
      a = anim("running");
      if (reduced) { draw(a.row, 0); return; }
      if (now >= face.thinkUntil) {
        face.thinkFrame = (face.thinkFrame + 1) % a.frames;
        face.thinkUntil = now + a.durations_ms[face.thinkFrame] * 1.6;
      }
      draw(a.row, face.thinkFrame);
      return;
    }
    /* 3. Rust: directe blik, af en toe knipperen, ogen volgen je vinger even */
    a = anim("idle");
    var t = Date.now();
    if (face.lookDeg != null && t < face.lookUntil) { drawLook(face.lookDeg); return; }
    if (!face.blink && t >= face.blinkAt && !reduced) {
      face.blink = { frame: 1, until: now + BLINK_MS };
    }
    if (face.blink) {
      if (now >= face.blink.until) {
        face.blink.frame += 1;
        if (face.blink.frame >= a.frames - 1) {
          face.blink = null;
          face.blinkAt = Date.now() + 3500 + Math.random() * 3500;
          draw(a.row, 0);
          return;
        }
        face.blink.until = now + BLINK_MS;
      }
      draw(a.row, face.blink.frame);
      return;
    }
    draw(a.row, 0);
  }

  function loop(now) {
    render(now || performance.now());
    requestAnimationFrame(loop);
  }

  function lookAt(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var dx = clientX - (r.left + r.width / 2);
    var dy = clientY - (r.top + r.height * 0.45);
    if (Math.hypot(dx, dy) < 24) { face.lookDeg = null; return; }
    var deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    face.lookDeg = deg;
    face.lookUntil = Date.now() + 900;
  }

  /* ---------- tekstballonnen ---------- */
  function avatar() {
    var el = document.createElement("span");
    el.className = "bubble-avatar franka-avatar";
    el.setAttribute("aria-hidden", "true");
    /* rustgezicht, uitgesneden */
    var s = 36 / 160;
    el.style.backgroundImage = "url(assets/franka-sprites.webp)";
    el.style.backgroundSize = (1536 * s) + "px auto";
    el.style.backgroundPosition = (-18 * s + (36 - 156 * s) / 2) + "px " + (-30 * s) + "px";
    return el;
  }

  function bubble(text, who, opts) {
    if (!text) return null;
    who = who || "bot";
    opts = opts || {};
    var row = document.createElement("div");
    row.className = "bubble-row " + (who === "user" ? "user" : "bot");
    if (opts.action) row.classList.add("has-action");
    if (who !== "user") row.appendChild(avatar());
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
    if (!reduced && el.animate) {
      el.animate([{ opacity: 0, transform: "translateY(12px) scale(0.92)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.9,.3,1.2)" });
    }
    while (bubbles.children.length > 12) bubbles.removeChild(bubbles.firstChild);
    updateChatting();
    return row;
  }

  function updateChatting() {
    var on = bubbles.querySelectorAll(".bubble-row.user").length > 0 || !resultsEl.hidden;
    document.body.classList.toggle("chatting", on);
    requestAnimationFrame(function () { try { chat.scrollTop = chat.scrollHeight; } catch (err) {} });
  }

  function cssOnce(cls) {
    if (reduced) return;
    faceWrap.classList.remove(cls);
    void faceWrap.offsetWidth;
    faceWrap.classList.add(cls);
    setTimeout(function () { faceWrap.classList.remove(cls); }, 1000);
  }

  /* ---------- engine ---------- */
  var engine = window.PoppetjeEngine.create({
    state: state,
    storagePrefix: "poppetje",
    voice: "female",
    micLabel: "Praat met Franka",
    persona: {
      name: "franka",
      hello: "Hoi Ernst! Wat kan ik voor je doen?",
      whoami: "Ik ben Franka. Ik denk graag met je mee.",
      howAreYou: "Goed hoor, en met jou?",
      thanks: "Graag gedaan."
    },
    els: {
      form: document.getElementById("search-form"),
      input: input,
      micBtn: document.getElementById("mic-btn"),
      results: document.getElementById("results"),
      voiceHint: document.getElementById("voice-hint"),
      listenStatus: document.getElementById("listen-status"),
      shortcutInput: document.getElementById("shortcut-name"),
      debugToggle: document.getElementById("voice-debug"),
      debugLog: document.getElementById("voice-debug-log"),
      tapContinue: document.getElementById("tap-continue"),
      speakToggle: document.getElementById("speak-aloud"),
      chat: chat
    },
    hooks: {
      bubble: bubble,
      startThinking: function () { setMode("denken"); },
      stopThinking: function () { setMode("rust"); },
      onSpeakStart: function () {
        /* geen praatmond: rustgezicht, alleen een zachte ring */
        setMode("rust");
        document.body.classList.add("speaking");
      },
      onSpeakEnd: function () { document.body.classList.remove("speaking"); },
      onPlayful: function () { playOnce("waiting"); },
      onDone: function () { setMode("rust"); playOnce("review"); cssOnce("nod"); },
      onError: function () { setMode("rust"); playOnce("failed"); cssOnce("shake"); },
      onChatChange: updateChatting,
      activity: function () { state.lastActivity = Date.now(); }
    }
  });

  /* Opgetrokken wenkbrauw, subtiel, bij het begin van typen. */
  var typedBefore = false;
  input.addEventListener("input", function () {
    var has = !!input.value.trim();
    if (has && !typedBefore && !state.listening && !state.busy) playOnce("waiting");
    typedBefore = has;
  });

  stage.addEventListener("pointerdown", function (e) {
    if (state.needsTap) { e.preventDefault(); engine.continueFromTap("scherm"); return; }
    lookAt(e.clientX, e.clientY);
  });
  document.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch" && !e.buttons) return;
    lookAt(e.clientX, e.clientY);
  });
  faceWrap.addEventListener("click", function () {
    if (state.busy || state.listening) return;
    playOnce("waiting");
  });

  if (params.has("icon")) document.body.classList.add("icon-mode");

  window.__franka = {
    version: VERSION,
    engine: engine,
    state: state,
    face: face,
    setMode: setMode,
    playOnce: playOnce,
    lookAt: lookAt,
    bubble: bubble
  };

  fetch("assets/franka-atlas.json").then(function (r) { return r.json(); }).then(function (data) {
    atlas = data;
    sheet.onload = function () {
      ready = true;
      document.body.classList.add("franka-ready");
      requestAnimationFrame(loop);
      if (!params.has("icon") && !params.has("shot")) {
        setTimeout(function () { bubble("Hoi, ik ben Franka. Tik op de microfoon en praat gewoon door."); }, reduced ? 0 : 350);
      }
    };
    sheet.src = "assets/" + data.image;
  }).catch(function () {
    bubble("Mijn gezicht laadt even niet. Herlaad de pagina.");
  });

  if (!params.has("icon") && !params.has("shot") && "serviceWorker" in navigator &&
      (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(function () {});
  }
})();
