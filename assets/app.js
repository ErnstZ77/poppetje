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
  var SHORTCUT_KEY = "poppetje-shortcut-name";
  var DEBUG_KEY = "poppetje-voice-debug";
  var SILENCE_MS = 1000;
  var NO_RESULT_MS = 8000;
  var RESUME_AFTER_TTS_MS = 400;
  var STOP_WAIT_MS = 300;

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
  var voiceDebugLines = [];

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
    scheduleDictationSubmit();
  }


  var VERSION = "v8-restart";
  var JOKES = [
    "Waarom hebben wastafels geen geheimen? Omdat ze alles laten weglopen.",
    "Wat zei de stoel tegen de tafel? Blijf zitten, ik sta er wel.",
    "Ik ken maar korte moppen. De lange lopen me altijd uit de… mop.",
    "Waarom nam de loodgieter een liniaal mee? Om de bocht een beetje recht te zetten."
  ];
  var UNITS = { nul: 0, zero: 0, een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9 };
  var TEENS = { tien: 10, elf: 11, twaalf: 12, dertien: 13, veertien: 14, vijftien: 15, zestien: 16, zeventien: 17, achttien: 18, negentien: 19 };
  var TENS = { twintig: 20, dertig: 30, veertig: 40, vijftig: 50, zestig: 60, zeventig: 70, tachtig: 80, negentig: 90 };

  function isStandalone() {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  }

  function isShotMode() {
    var q = new URLSearchParams(location.search);
    return q.has("shot") || q.has("closeup") || q.has("icon");
  }

  function speechRecCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function pickNlVoice() {
    if (!window.speechSynthesis) return null;
    var voices = speechSynthesis.getVoices() || [];
    var i;
    for (i = 0; i < voices.length; i++) {
      if ((voices[i].lang || "").toLowerCase().indexOf("nl") === 0) return voices[i];
    }
    return null;
  }
  if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    if (typeof speechSynthesis.addEventListener === "function") {
      speechSynthesis.addEventListener("voiceschanged", function () { pickNlVoice(); });
    }
  }

  function unlockSpeech() {
    if (state.speechUnlocked || !window.speechSynthesis) return;
    try {
      var u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      u.rate = 1;
      u.lang = "nl-NL";
      speechSynthesis.speak(u);
      state.speechUnlocked = true;
      voiceLog("unlockSpeech");
    } catch (err) {
      voiceLog("unlockSpeech-error", err && err.message);
    }
  }

  function speak(text) {
    return stopRecognitionFully().then(function () {
    return new Promise(function (resolve) {
      if (!text || !window.speechSynthesis || isShotMode()) {
        resolve();
        return;
      }
      try { speechSynthesis.cancel(); } catch (err) {}
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "nl-NL";
      u.rate = 1;
      var voice = pickNlVoice();
      if (voice) u.voice = voice;
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        state.speaking = false;
        resolve();
      };
      u.onend = finish;
      u.onerror = finish;
      state.speaking = true;
      try { speechSynthesis.speak(u); } catch (err) { finish(); return; }
      bobMic();
      setTimeout(finish, Math.min(12000, 1200 + String(text).length * 80));
    });
    });
  }

  function stripHtml(s) {
    return String(s || "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeText(s) {
    return String(s || "").toLowerCase().replace(/[?!.,]/g, " ").replace(/\s+/g, " ").trim();
  }

  function normalizeWord(w) {
    return String(w || "").toLowerCase().replace(/ë/g, "e").replace(/é/g, "e").replace(/ï/g, "i");
  }

  function timeAnswer() {
    var tm = new Date().toLocaleTimeString("nl-NL", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Europe/Amsterdam"
    });
    return "Het is " + tm + ".";
  }

  function dateAnswer() {
    var d = new Date().toLocaleDateString("nl-NL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Amsterdam"
    });
    return "Vandaag is het " + d + ".";
  }

  function parseDutchNumberToken(token) {
    token = normalizeWord(token).replace(/,/g, ".");
    if (!token) return null;
    if (/^\d+(\.\d+)?$/.test(token)) {
      var n = parseFloat(token);
      return isFinite(n) ? n : null;
    }
    if (UNITS[token] != null) return UNITS[token];
    if (TEENS[token] != null) return TEENS[token];
    if (TENS[token] != null) return TENS[token];
    if (token === "honderd") return 100;
    if (token === "duizend") return 1000;
    var m = token.match(/^(.*)duizend(.*)$/);
    if (m) {
      var left = m[1] ? parseDutchNumberToken(m[1]) : 1;
      var right = m[2] ? parseDutchNumberToken(m[2]) : 0;
      if (left == null || right == null) return null;
      return left * 1000 + right;
    }
    m = token.match(/^(.*)honderd(.*)$/);
    if (m) {
      left = m[1] ? parseDutchNumberToken(m[1]) : 1;
      right = m[2] ? parseDutchNumberToken(m[2]) : 0;
      if (left == null || right == null) return null;
      return left * 100 + right;
    }
    m = token.match(/^(een|twee|drie|vier|vijf|zes|zeven|acht|negen)en(twintig|dertig|veertig|vijftig|zestig|zeventig|tachtig|negentig)$/);
    if (m) return UNITS[m[1]] + TENS[m[2]];
    return null;
  }

  function tryArithmetic(raw) {
    var src = normalizeWord(raw);
    if (!src) return null;
    src = src.replace(/[?!]+/g, " ");
    src = src.replace(/^(nou|eens|maar|zeg|eh)\s+/g, "");
    src = src.replace(/hoeveel is het|hoeveel is|hoeveel is dat|wat is de uitkomst van|wat is|reken uit|bereken|reken/g, " ");
    src = src.replace(/gedeeld door|delen door|gedeelde door/g, " / ");
    src = src.replace(/procent van|% van/g, " %van ");
    src = src.replace(/procent/g, " % ");
    src = src.replace(/(\d)\s*[x×]\s*(\d)/g, "$1 * $2");
    src = src.replace(/\s+[x×]\s+/g, " * ");
    src = src.replace(/keer|maal/g, " * ");
    src = src.replace(/plus/g, " + ");
    src = src.replace(/\bminus\b|\bmin\b/g, " - ");
    src = src.replace(/[×]/g, " * ");
    src = src.trim();
    if (!src) return null;
    if (!/[+\-*/]|%van|%/.test(src)) return null;

    var tokens = [];
    var i = 0;
    var s = src.replace(/\s+/g, " ").trim();
    while (i < s.length) {
      if (s[i] === " ") { i++; continue; }
      if (s.slice(i, i + 4) === "%van") { tokens.push("%van"); i += 4; continue; }
      if ("+-*/%".indexOf(s[i]) !== -1) { tokens.push(s[i]); i++; continue; }
      var rest = s.slice(i);
      var m = rest.match(/^\d+(?:\.\d+)?/);
      if (m) {
        tokens.push(parseFloat(m[0]));
        i += m[0].length;
        continue;
      }
      m = rest.match(/^[a-z]+/);
      if (m) {
        var num = parseDutchNumberToken(m[0]);
        if (num == null) return null;
        tokens.push(num);
        i += m[0].length;
        continue;
      }
      return null;
    }
    if (tokens.length < 3) return null;
    var hasOp = tokens.some(function (tok) { return typeof tok === "string"; });
    var hasNum = tokens.some(function (tok) { return typeof tok === "number"; });
    if (!hasOp || !hasNum) return null;

    function apply(seq, ops, fn) {
      var out = [];
      var j = 0;
      while (j < seq.length) {
        if (typeof seq[j] === "string" && ops.indexOf(seq[j]) !== -1 && out.length && j + 1 < seq.length && typeof out[out.length - 1] === "number" && typeof seq[j + 1] === "number") {
          var a = out.pop();
          var b = seq[j + 1];
          var r = fn(seq[j], a, b);
          if (r == null || !isFinite(r)) return null;
          out.push(r);
          j += 2;
        } else {
          out.push(seq[j]);
          j++;
        }
      }
      return out;
    }

    var seq = tokens;
    seq = apply(seq, ["%van"], function (op, a, b) { return (a / 100) * b; });
    if (!seq) return null;
    seq = apply(seq, ["%"], function (op, a, b) { return (a / 100) * b; });
    if (!seq) return null;
    seq = apply(seq, ["*", "/"], function (op, a, b) {
      if (op === "/") {
        if (b === 0) return null;
        return a / b;
      }
      return a * b;
    });
    if (!seq) return null;
    seq = apply(seq, ["+", "-"], function (op, a, b) { return op === "+" ? a + b : a - b; });
    if (!seq || seq.length !== 1 || typeof seq[0] !== "number" || !isFinite(seq[0])) return null;
    var val = seq[0];
    var shown = Math.abs(val - Math.round(val)) < 1e-10 ? String(Math.round(val)) : String(Math.round(val * 1000) / 1000).replace(".", ",");
    return { type: "chat", text: "Dat is " + shown + ".", value: val };
  }

  function extractSearchQuery(raw) {
    var q = String(raw || "").trim();
    q = q.replace(/^(ik ben (er )?op zoek naar|ik zoek naar|ik zoek|zoek eens naar|zoek naar|zoek maar|zoek|search for|search)\s+/i, "");
    return q.trim() || String(raw || "").trim();
  }

  function isSpotifyIntent(t) {
    return /\b(zet spotify aan|spotify aan|open spotify|start spotify|start spotify op|zet spotify op|speel (wat |eens )?muziek|zet (de )?muziek aan|muziek aan|speel spotify|spotify spelen)\b/.test(t) ||
      t === "spotify" || t === "muziek";
  }

  function getShortcutName() {
    if (shortcutInput && shortcutInput.value.trim()) return shortcutInput.value.trim();
    try {
      var saved = window.localStorage.getItem(SHORTCUT_KEY);
      if (saved) return saved.trim();
    } catch (err) {}
    return "";
  }

  function spotifyOpenUrl() {
    var name = getShortcutName();
    if (name) return "shortcuts://run-shortcut?name=" + encodeURIComponent(name);
    return "spotify:";
  }

  function tryOpenUrl(url) {
    state.lastOpenUrl = url || "";
    if (!url || isShotMode()) return false;
    var local = location.hostname === "127.0.0.1" || location.hostname === "localhost" || location.protocol === "http:";
    if (local && !/^https?:/i.test(url)) return false;
    try {
      window.location.href = url;
      return true;
    } catch (err) {
      return false;
    }
  }

  function makeSpotifyButton() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "open-spotify";
    btn.textContent = getShortcutName() ? "Start opdracht" : "Open Spotify";
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      activity();
      var url = spotifyOpenUrl();
      if (!tryOpenUrl(url) && url.indexOf("shortcuts://") !== 0) {
        tryOpenUrl("https://open.spotify.com/");
      }
    });
    return btn;
  }

  function handleSpotify() {
    var name = getShortcutName();
    var text = name
      ? "Ik start je opdracht. Tik op de knop als het niet vanzelf gaat."
      : "Ik open Spotify. Tik op de knop als het niet vanzelf gaat. Met een opdracht in Opdrachten kan de muziek écht starten.";
    bubble(text, "bot", { sticky: true, action: makeSpotifyButton() });
    tryOpenUrl(spotifyOpenUrl());
    return speak(text).then(function () {
      return { type: "spotify", url: state.lastOpenUrl };
    });
  }

  function classifyQuery(raw) {
    var t = normalizeText(raw);
    if (!t) return { type: "empty" };
    if (/^(hoi|hallo|hey|hai|hi|goedemorgen|goedemiddag|goedenavond|goeiedag|goedendag)(\s|$)/.test(t)) {
      return { type: "chat", text: "Hoi! Waar kan ik je mee helpen?" };
    }
    if (/\b(hoe laat is het|hoe laat is ie|hoe laat|wat is de tijd|hoe laat is het nu)\b/.test(t) || t === "tijd") {
      return { type: "chat", text: timeAnswer() };
    }
    if (/\b(welke datum is het|welke dag is het|wat is de datum|welke datum|welke dag|wat voor dag)\b/.test(t) || t === "datum") {
      return { type: "chat", text: dateAnswer() };
    }
    if (/\b(vertel (eens )?(een )?mop|een mopje|een grapje|een grap|maak me aan het lachen)\b/.test(t) || t === "mop" || t === "grapje" || t === "grap") {
      return { type: "chat", text: JOKES[Math.floor(Math.random() * JOKES.length)] };
    }
    if (isSpotifyIntent(t)) return { type: "spotify" };
    var math = tryArithmetic(raw);
    if (math) return math;
    return { type: "search", query: extractSearchQuery(raw) };
  }

  function clearResults() {
    if (!resultsEl) return;
    resultsEl.innerHTML = "";
    resultsEl.hidden = true;
  }

  function renderResults(items) {
    if (!resultsEl) return;
    resultsEl.innerHTML = "";
    if (!items || !items.length) {
      resultsEl.hidden = true;
      return;
    }
    items.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "result-card";
      var a = document.createElement("a");
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      var src = document.createElement("span");
      src.className = "result-src";
      src.textContent = item.source;
      var h = document.createElement("h3");
      h.textContent = item.title;
      a.appendChild(src);
      a.appendChild(h);
      if (item.snippet) {
        var p = document.createElement("p");
        p.textContent = item.snippet;
        a.appendChild(p);
      }
      card.appendChild(a);
      resultsEl.appendChild(card);
    });
    resultsEl.hidden = false;
  }

  function fetchJson(url, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 7000);
    return fetch(url, { signal: ctrl ? ctrl.signal : undefined, headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok && res.status !== 202) throw new Error("http " + res.status);
        return res.json();
      })
      .finally(function () { clearTimeout(timer); });
  }

  function searchWikipedia(query) {
    var url = "https://nl.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
      encodeURIComponent(query) + "&srlimit=4&utf8=1&format=json&origin=*&srprop=snippet";
    return fetchJson(url).then(function (data) {
      var hits = (((data || {}).query) || {}).search || [];
      return hits.map(function (hit) {
        return {
          source: "Wikipedia",
          title: hit.title,
          snippet: stripHtml(hit.snippet),
          url: "https://nl.wikipedia.org/wiki/" + encodeURIComponent(hit.title).replace(/%20/g, "_")
        };
      });
    });
  }

  function searchDuckDuckGo(query) {
    var url = "https://api.duckduckgo.com/?q=" + encodeURIComponent(query) +
      "&format=json&no_html=1&skip_disambig=1&t=poppetje";
    return fetchJson(url).then(function (data) {
      var items = [];
      if (data && (data.AbstractText || data.Heading) && data.AbstractURL) {
        items.push({
          source: "DuckDuckGo",
          title: data.Heading || query,
          snippet: stripHtml(data.AbstractText),
          url: data.AbstractURL
        });
      }
      var related = (data && data.RelatedTopics) || [];
      related.forEach(function (topic) {
        if (items.length >= 3) return;
        if (topic && topic.Text && topic.FirstURL) {
          items.push({
            source: "DuckDuckGo",
            title: topic.Text.split(" - ")[0],
            snippet: stripHtml(topic.Text),
            url: topic.FirstURL
          });
        }
      });
      return items;
    });
  }

  function searchInApp(query) {
    var q = String(query || "").trim();
    if (!q) return Promise.resolve([]);
    startThinking();
    bubble("Ik zoek het voor je.", "bot", { sticky: true });
    return Promise.allSettled([searchWikipedia(q), searchDuckDuckGo(q)])
      .then(function (parts) {
        var items = [];
        var seen = {};
        parts.forEach(function (part) {
          if (part.status !== "fulfilled" || !part.value) return;
          part.value.forEach(function (item) {
            var key = (item.url || item.title).toLowerCase();
            if (seen[key]) return;
            seen[key] = true;
            items.push(item);
          });
        });
        renderResults(items);
        var say = !items.length
          ? "Ik vond niks. Probeer andere woorden."
          : "Ik vond " + items.length + (items.length === 1 ? " resultaat" : " resultaten") + " over " + q + ".";
        bubble(say, "bot", { sticky: true });
        return speak(say).then(function () { return items; });
      })
      .catch(function () {
        var miss = "Zoeken lukte even niet. Probeer het zo nog eens.";
        bubble(miss, "bot", { sticky: true });
        return speak(miss).then(function () { return []; });
      })
      .finally(function () {
        stopThinking();
        smileOn(false);
      });
  }

  function handleQuery(raw, fromVoice) {
    var q = String(raw || "").trim();
    if (!q) return Promise.resolve();
    activity();
    smileOn(true);
    var kind = classifyQuery(q);
    if (kind.type === "spotify") {
      return handleSpotify().then(function (res) {
        setTimeout(function () { smileOn(false); stopThinking(); }, 700);
        return res;
      });
    }
    if (kind.type === "chat") {
      clearResults();
      bubble(kind.text, "bot", { sticky: true });
      return speak(kind.text).then(function () {
        setTimeout(function () { smileOn(false); stopThinking(); }, 400);
        return kind;
      });
    }
    return searchInApp(kind.query || q).then(function (items) {
      return { type: "search", query: kind.query || q, items: items };
    });
  }

  function showVoiceHint(text) {
    if (!voiceHint) return;
    voiceHint.textContent = text;
    voiceHint.hidden = !text;
  }

  function setListenStatus(text) {
    if (!listenStatus) return;
    listenStatus.textContent = text || "luistert…";
    listenStatus.hidden = !text;
  }

  function renderVoiceDebug() {
    if (!voiceDebugLogEl) return;
    var on = !!(voiceDebugToggle && voiceDebugToggle.checked);
    voiceDebugLogEl.hidden = !on;
    if (on) {
      voiceDebugLogEl.textContent = voiceDebugLines.join("\n") || "Nog geen spraak-events.";
      try { voiceDebugLogEl.scrollTop = voiceDebugLogEl.scrollHeight; } catch (err) {}
    }
  }

  function voiceLog(event, detail) {
    var time = new Date().toLocaleTimeString("nl-NL", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Europe/Amsterdam"
    });
    var line = time + "  " + event + (detail ? "  " + detail : "");
    voiceDebugLines.push(line);
    if (voiceDebugLines.length > 40) voiceDebugLines.shift();
    renderVoiceDebug();
  }

  function readTranscript(event) {
    var text = "";
    var finalText = "";
    var results = event && event.results;
    if (!results) return { text: "", finalText: "", hasFinal: false };
    var len = results.length;
    var i;
    for (i = 0; i < len; i++) {
      var res = results[i];
      var alt = null;
      if (res) {
        alt = res[0] || (typeof res.item === "function" ? res.item(0) : null);
      }
      var piece = alt && alt.transcript != null ? String(alt.transcript) : "";
      text += piece;
      if (res && res.isFinal) finalText += piece;
    }
    text = text.trim();
    finalText = finalText.trim();
    return { text: text, finalText: finalText, hasFinal: !!finalText };
  }

  function showHeard(text) {
    if (text) {
      input.value = text;
      setListenStatus("luistert… " + text);
    } else if (state.listening || state.conversation) {
      setListenStatus("luistert…");
    }
  }

  function clearSilenceTimer() {
    if (state.silenceTimer) {
      clearTimeout(state.silenceTimer);
      state.silenceTimer = null;
    }
  }

  function clearDictateTimer() {
    if (state.dictateTimer) {
      clearTimeout(state.dictateTimer);
      state.dictateTimer = null;
    }
  }

  function clearNoResultTimer() {
    if (state.noResultTimer) {
      clearTimeout(state.noResultTimer);
      state.noResultTimer = null;
    }
  }

  function clearStartWatch() {
    if (state.startWatchTimer) {
      clearTimeout(state.startWatchTimer);
      state.startWatchTimer = null;
    }
  }

  function armNoResultTimer() {
    clearNoResultTimer();
    state.gotResult = false;
    state.noResultTimer = setTimeout(function () {
      state.noResultTimer = null;
      if (state.submitLock) return;
      if (state.pendingTranscript) {
        voiceLog("no-result-timeout", "submit pending");
        submitUtterance(state.pendingTranscript);
        return;
      }
      voiceLog("no-result-timeout", "empty");
      heardNothing();
    }, NO_RESULT_MS);
  }

  function heardNothing() {
    clearSilenceTimer();
    clearNoResultTimer();
    stopRecognitionOnly();
    setListening(false);
    var msg = "Ik hoorde niets, tik nog eens op de microfoon of gebruik het toetsenbord-microfoontje.";
    showVoiceHint(msg);
    bubble(msg, "bot", { sticky: true });
    setListenStatus("");
    state.dictationMode = true;
    try { input.focus(); } catch (err) {}
  }

  function errorMessage(code) {
    if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
      return "Geen toegang tot de microfoon. Tik in het zoekveld en daarna op het microfoontje op het toetsenbord.";
    }
    if (code === "no-speech") {
      return "Ik hoorde niets, tik nog eens op de microfoon of gebruik het toetsenbord-microfoontje.";
    }
    if (code === "network") {
      return "De spraakherkenning heeft even geen netwerk. Probeer het opnieuw of dicteer via het toetsenbord.";
    }
    if (code === "unsupported" || code === "construct" || code === "start") {
      return isStandalone()
        ? "In de app op je beginscherm werkt de microfoonknop vaak niet. Tik in het zoekveld en daarna op het microfoontje op het toetsenbord. Na een korte stilte antwoord ik vanzelf."
        : "Spraakherkenning is hier niet beschikbaar. Tik in het zoekveld en daarna op het microfoontje op het toetsenbord. Na een korte stilte antwoord ik vanzelf.";
    }
    return "Spraakherkenning gaf een fout (" + code + "). Tik nog eens op de microfoon of dicteer via het toetsenbord.";
  }

  function setListening(on) {
    state.listening = !!on;
    document.body.classList.toggle("listening", !!on);
    if (micBtn) {
      micBtn.setAttribute("aria-pressed", on || state.conversation ? "true" : "false");
      micBtn.setAttribute("aria-label", state.conversation ? "Stoppen" : "Praten");
      micBtn.title = state.conversation ? "Stoppen" : "Praat met het poppetje";
    }
    if (on) {
      activity();
      if (!state.phonesOn) setHeadphones(true, false);
      setLook(0, 0.2, 200);
      if (state.pendingTranscript) showHeard(state.pendingTranscript);
      else setListenStatus("luistert…");
    } else {
      if (!state.conversation) setLook(0, 0, 240);
      if (state.dictationMode && !state.speaking) setListenStatus("zeg het maar…");
      else setListenStatus("");
    }
  }

  function detachRecognition(rec) {
    if (!rec) return;
    rec.onstart = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    rec.onspeechend = null;
    rec.onaudioend = null;
    rec.onaudiostart = null;
    rec.onsoundstart = null;
    rec.onspeechstart = null;
  }

  function stopRecognitionFully() {
    return new Promise(function (resolve) {
      var rec = state.recognition;
      state.recognition = null;
      clearStartWatch();
      if (!rec) {
        voiceLog("stopRecognition", "already-idle");
        resolve();
        return;
      }
      var done = false;
      var finish = function (why) {
        if (done) return;
        done = true;
        detachRecognition(rec);
        voiceLog("stopRecognition", why);
        resolve();
      };
      rec.onstart = null;
      rec.onresult = null;
      rec.onspeechend = null;
      rec.onaudioend = null;
      rec.onaudiostart = null;
      rec.onsoundstart = null;
      rec.onspeechstart = null;
      rec.onerror = function (ev) {
        var err = ev && ev.error;
        voiceLog("stopRecognition-error", err || "");
      };
      rec.onend = function () { finish("onend"); };
      try {
        rec.abort();
        voiceLog("abort()");
      } catch (err) {
        voiceLog("abort-throw", err && err.message);
        finish("abort-throw");
        return;
      }
      setTimeout(function () { finish("timeout-300"); }, STOP_WAIT_MS);
    });
  }

  function stopRecognitionOnly() {
    stopRecognitionFully();
  }

  function hideTapToContinue() {
    state.needsTap = false;
    if (tapContinue) tapContinue.hidden = true;
    document.body.classList.remove("needs-tap");
  }

  function showTapToContinue(reason) {
    state.needsTap = true;
    state.starting = false;
    clearStartWatch();
    setListening(false);
    setListenStatus("");
    showVoiceHint("");
    if (tapContinue) tapContinue.hidden = false;
    document.body.classList.add("needs-tap");
    voiceLog("tap-to-continue", reason || "");
  }

  function continueFromTap(source) {
    if (!state.conversation && !state.needsTap) return;
    voiceLog("tap-continue", source || "tap");
    hideTapToContinue();
    unlockSpeech();
    activity();
    startRecognition(false);
  }

  function stopListening() {
    clearSilenceTimer();
    clearNoResultTimer();
    clearStartWatch();
    stopRecognitionFully();
    setListening(false);
  }

  function endConversation() {
    state.conversation = false;
    state.dictationMode = false;
    state.pendingTranscript = "";
    state.starting = false;
    hideTapToContinue();
    clearSilenceTimer();
    clearDictateTimer();
    clearNoResultTimer();
    clearStartWatch();
    stopRecognitionFully();
    setListening(false);
    setListenStatus("");
    showVoiceHint("");
    if (micBtn) {
      micBtn.setAttribute("aria-pressed", "false");
      micBtn.setAttribute("aria-label", "Praten");
      micBtn.title = "Praat met het poppetje";
    }
    voiceLog("endConversation");
  }

  function dictationFallback(reason) {
    clearStartWatch();
    clearNoResultTimer();
    stopRecognitionFully();
    setListening(false);
    state.dictationMode = true;
    var msg = errorMessage(reason || "unsupported");
    showVoiceHint(msg);
    setListenStatus("zeg het maar…");
    voiceLog("dictationFallback", reason || "");
    try { input.focus(); } catch (err) {}
  }

  function submitUtterance(raw) {
    var q = String(raw || state.pendingTranscript || input.value || "").trim();
    if (!q || state.submitLock) return Promise.resolve();
    state.submitLock = true;
    clearSilenceTimer();
    clearDictateTimer();
    clearNoResultTimer();
    clearStartWatch();
    state.pendingTranscript = "";
    thinkLinesShown = false;
    bubble(q, "user", { sticky: true });
    input.value = "";
    voiceLog("submit", q);
    setListening(false);
    return stopRecognitionFully().then(function () {
      return handleQuery(q, true);
    }).then(function (res) {
      input.value = "";
      return res;
    }).catch(function (err) {
      voiceLog("submit-error", err && err.message);
      return null;
    }).then(function (res) {
      state.submitLock = false;
      input.value = "";
      if (state.conversation && speechRecCtor()) {
        voiceLog("resume-scheduled", "after-tts+" + RESUME_AFTER_TTS_MS);
        setTimeout(function () { resumeListening(); }, RESUME_AFTER_TTS_MS);
      } else if (state.conversation || state.dictationMode) {
        state.dictationMode = true;
        setListenStatus("zeg het maar…");
        try { input.focus(); } catch (err) {}
      }
      return res;
    });
  }

  function scheduleVoiceSubmit(text) {
    state.pendingTranscript = text;
    clearSilenceTimer();
    state.silenceTimer = setTimeout(function () {
      state.silenceTimer = null;
      if (state.submitLock) return;
      var q = state.pendingTranscript || input.value.trim();
      if (q) submitUtterance(q);
    }, SILENCE_MS);
  }

  function noteTranscript(text, hasFinal) {
    if (text) {
      state.pendingTranscript = text;
      state.lastTranscriptAt = Date.now();
      showHeard(text);
    }
    if (hasFinal && text) {
      voiceLog("final", text);
      clearSilenceTimer();
      submitUtterance(text);
      return;
    }
    if (text) scheduleVoiceSubmit(text);
  }

  function submitIfPending(source) {
    voiceLog(source);
    if (state.submitLock) return;
    var q = state.pendingTranscript || input.value.trim();
    if (q) {
      clearSilenceTimer();
      submitUtterance(q);
    }
  }

  function scheduleDictationSubmit() {
    if (!(state.conversation || state.dictationMode)) return;
    if (state.listening && state.recognition) return;
    if (state.submitLock) return;
    if (document.activeElement !== input) return;
    clearDictateTimer();
    if (!input.value.trim()) return;
    state.dictateTimer = setTimeout(function () {
      state.dictateTimer = null;
      if (!(state.conversation || state.dictationMode) || state.submitLock) return;
      if (document.activeElement !== input) return;
      var q = input.value.trim();
      if (q) submitUtterance(q);
    }, 1200);
  }

  function markLive(source) {
    voiceLog(source);
    state.gotAudio = true;
    clearStartWatch();
    if (!state.listening) setListening(true);
    if (!state.noResultTimer && !state.gotResult) armNoResultTimer();
  }

  function resumeListening() {
    if (!state.conversation || state.submitLock || state.speaking || state.needsTap) return;
    if (!speechRecCtor()) {
      dictationFallback("unsupported");
      return;
    }
    voiceLog("resumeListening");
    startRecognition(true, 1);
  }

  function bindRecognition(rec) {
    rec.lang = "nl-NL";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onstart = function () { markLive("onstart"); };
    rec.onaudiostart = function () { markLive("onaudiostart"); };
    rec.onsoundstart = function () { markLive("onsoundstart"); };
    rec.onspeechstart = function () { markLive("onspeechstart"); };
    rec.onresult = function (event) {
      var got = readTranscript(event);
      state.gotResult = true;
      clearNoResultTimer();
      markLive("onresult " + (got.hasFinal ? "final " : "interim ") + (got.text || "(leeg)"));
      noteTranscript(got.text || got.finalText, got.hasFinal);
    };
    rec.onspeechend = function () {
      voiceLog("onspeechend");
      if (state.pendingTranscript) scheduleVoiceSubmit(state.pendingTranscript);
    };
    rec.onaudioend = function () {
      voiceLog("onaudioend");
      if (state.pendingTranscript) scheduleVoiceSubmit(state.pendingTranscript);
    };
    rec.onerror = function (event) {
      var err = (event && event.error) || "error";
      voiceLog("onerror", err);
      if (err === "aborted") return;
      if (state.submitLock) return;
      if (err === "no-speech") {
        if (state.pendingTranscript) {
          submitUtterance(state.pendingTranscript);
          return;
        }
        heardNothing();
        return;
      }
      if (err === "not-allowed" || err === "service-not-allowed") {
        if (state.conversation) {
          showTapToContinue(err);
          return;
        }
      }
      dictationFallback(err);
    };
    rec.onend = function () {
      voiceLog("onend");
      if (state.recognition === rec) state.recognition = null;
      clearStartWatch();
      if (state.submitLock || state.starting) return;
      if (state.pendingTranscript) {
        submitIfPending("onend-submit");
        return;
      }
      if (state.conversation && !state.silenceTimer && !state.speaking && !state.dictationMode && !state.needsTap) {
        voiceLog("onend-restart");
        setTimeout(function () {
          if (state.conversation && !state.recognition && !state.submitLock && !state.speaking && !state.needsTap) {
            resumeListening();
          }
        }, RESUME_AFTER_TTS_MS);
      }
    };
  }

  function startRecognition(isResume, attempt) {
    attempt = attempt || 1;
    var Ctor = speechRecCtor();
    if (!Ctor) {
      dictationFallback("unsupported");
      return;
    }
    if (state.submitLock || state.speaking) {
      voiceLog("startRecognition", "deferred");
      return;
    }
    if (state.starting) {
      voiceLog("startRecognition", "already-starting");
      return;
    }
    state.starting = true;
    hideTapToContinue();
    showVoiceHint("");
    state.pendingTranscript = "";
    state.gotResult = false;
    state.gotAudio = false;

    var begin = function () {
      if (state.submitLock || state.speaking || !state.conversation && isResume) {
        state.starting = false;
        return;
      }
      var rec;
      try {
        rec = new Ctor();
      } catch (err) {
        state.starting = false;
        voiceLog("construct-throw", err && err.message);
        dictationFallback("construct");
        return;
      }
      bindRecognition(rec);
      state.recognition = rec;
      voiceLog("new-instance", "attempt=" + attempt);
      try {
        rec.start();
        state.starting = false;
        voiceLog("start()", "attempt=" + attempt);
      } catch (err) {
        var msg = ((err && (err.name || "")) + " " + (err && err.message || "")).trim();
        voiceLog("start-throw", msg || "start");
        state.recognition = null;
        detachRecognition(rec);
        if (/InvalidState/i.test(msg) && attempt < 2) {
          voiceLog("retry-after-busy");
          setTimeout(function () {
            state.starting = false;
            if (!state.conversation || state.submitLock || state.speaking) return;
            startRecognition(isResume, attempt + 1);
          }, STOP_WAIT_MS);
          return;
        }
        state.starting = false;
        if (isResume && state.conversation) {
          showTapToContinue(msg || "start-throw");
          return;
        }
        dictationFallback("start");
      }
    };

    if (state.recognition) {
      voiceLog("startRecognition", "wait-for-old");
      stopRecognitionFully().then(function () {
        begin();
      });
      return;
    }
    begin();
  }

  function startConversation() {
    state.conversation = true;
    state.dictationMode = false;
    state.pendingTranscript = "";
    hideTapToContinue();
    showVoiceHint("");
    if (micBtn) {
      micBtn.setAttribute("aria-pressed", "true");
      micBtn.setAttribute("aria-label", "Stoppen");
    }
    voiceLog("startConversation");
    startRecognition(false, 1);
  }

  function startListening() {
    if (state.needsTap) {
      continueFromTap("mic");
      return;
    }
    if (state.conversation || state.listening) {
      endConversation();
      return;
    }
    startConversation();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    e.stopPropagation();
    var q = input.value.trim();
    if (!q) return;
    submitUtterance(q);
  });

  if (micBtn) {
    micBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      activity();
      unlockSpeech();
      startListening();
    });
  }

  if (tapContinue) {
    tapContinue.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      continueFromTap("button");
    });
  }

  if (shortcutInput) {
    try {
      var savedName = window.localStorage.getItem(SHORTCUT_KEY);
      if (savedName) shortcutInput.value = savedName;
    } catch (err) {}
    shortcutInput.addEventListener("change", function () {
      try { window.localStorage.setItem(SHORTCUT_KEY, shortcutInput.value.trim()); } catch (err) {}
    });
    shortcutInput.addEventListener("blur", function () {
      try { window.localStorage.setItem(SHORTCUT_KEY, shortcutInput.value.trim()); } catch (err) {}
    });
  }

  if (voiceDebugToggle) {
    try {
      voiceDebugToggle.checked = window.localStorage.getItem(DEBUG_KEY) === "1";
    } catch (err) {}
    renderVoiceDebug();
    voiceDebugToggle.addEventListener("change", function () {
      try { window.localStorage.setItem(DEBUG_KEY, voiceDebugToggle.checked ? "1" : "0"); } catch (err) {}
      renderVoiceDebug();
    });
  }

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
    handleQuery: handleQuery,
    searchInApp: searchInApp,
    startListening: startListening,
    stopListening: stopListening,
    startConversation: startConversation,
    endConversation: endConversation,
    submitUtterance: submitUtterance,
    tryArithmetic: tryArithmetic,
    speak: speak,
    classifyQuery: classifyQuery,
    getShortcutName: getShortcutName,
    tryOpenUrl: tryOpenUrl,
    voiceLog: voiceLog,
    readTranscript: readTranscript,
    stopRecognitionFully: stopRecognitionFully,
    showTapToContinue: showTapToContinue,
    continueFromTap: continueFromTap
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
