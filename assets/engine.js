/* EJZ gespreks-engine — gedeeld door het poppetje en Franka.
   Eén langlevende spraakherkenner (continuous + interimResults), gestart met de eerste tik.
   Elk afgerond stuk spraak is één beurt. Terwijl de app zelf praat (plus 400 ms) worden
   resultaten genegeerd, zodat hij zichzelf niet hoort. Offline, geen CDN, geen sleutels. */
(function () {
  "use strict";

  var ENGINE_VERSION = "v10";
  var JOKES = [
    "Waarom hebben wastafels geen geheimen? Omdat ze alles laten weglopen.",
    "Wat zei de stoel tegen de tafel? Blijf zitten, ik sta er wel.",
    "Ik ken maar korte moppen. De lange lopen me altijd uit de… mop.",
    "Waarom nam de loodgieter een liniaal mee? Om de bocht een beetje recht te zetten."
  ];
  var UNITS = { nul: 0, zero: 0, een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9 };
  var TEENS = { tien: 10, elf: 11, twaalf: 12, dertien: 13, veertien: 14, vijftien: 15, zestien: 16, zeventien: 17, achttien: 18, negentien: 19 };
  var TENS = { twintig: 20, dertig: 30, veertig: 40, vijftig: 50, zestig: 60, zeventig: 70, tachtig: 80, negentig: 90 };

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
    q = q.replace(/^(wie (is|was|zijn|waren)|wat (is|was|zijn|waren|betekent)( een| de| het)?|waar (is|ligt|lag|woont)|vertel (me |eens )?(iets )?over|informatie over|info over|leg uit( wat)?)\s+/i, "");
    q = q.replace(/[?!.]+$/, "");
    return q.trim() || String(raw || "").trim();
  }

  function isSpotifyIntent(t) {
    return /\b(zet spotify aan|spotify aan|open spotify|start spotify|start spotify op|zet spotify op|speel (wat |eens )?muziek|zet (de )?muziek aan|muziek aan|speel spotify|spotify spelen)\b/.test(t) ||
      t === "spotify" || t === "muziek";
  }

  var GREET_RE = /^(he+y*|hé+|hee+|hey+|hoi+|hallo+|hai|hi|yo|joe|dag|daag|goedemorgen|goeiemorgen|goedemiddag|goeiemiddag|goedenavond|goeienavond|goeiedag|goedendag|morgen|middag|avond)(\s|$)/;
  var LOOKUP_RE = /^(zoek|zoek op|google|wikipedia|wie (is|was|zijn|waren)|wat (is|was|zijn|waren|betekent|weet je over)|waar (is|ligt|lag|woont|komt)|wanneer|waarom|hoe (werkt|maak|kan|moet|heet|groot|oud|lang|ver|hoog|zwaar)|welke|hoeveel|vertel (me |eens )?(iets )?over|informatie over|info over|leg uit)\b/;

  function classifyQuery(raw, persona) {
    persona = persona || {};
    var t = normalizeText(raw).replace(/[éè]/g, "e");
    if (!t) return { type: "empty" };
    var name = (persona.name || "").toLowerCase();
    var words = t.split(" ");
    var stripped = name ? t.replace(new RegExp("\\b" + name + "\\b", "g"), "").replace(/\s+/g, " ").trim() : t;
    if (/\b(hoe heet je|wie ben jij|wie ben je|wat is je naam)\b/.test(t)) {
      return { type: "chat", text: persona.whoami || "Ik ben je EJZ-poppetje.", playful: true };
    }
    if (/\b(hoe gaat het( met je| met jou)?|alles goed|hoe is het)\b/.test(t)) {
      return { type: "chat", text: persona.howAreYou || "Prima, dank je! En met jou?", playful: true };
    }
    if (/^(dank je|dankjewel|dank je wel|bedankt|thanks|top|super|mooi zo|lief|leuk)(\s|$)/.test(t)) {
      return { type: "chat", text: persona.thanks || "Graag gedaan!", playful: true };
    }
    if (/^(doei|dag dag|tot later|tot straks|welterusten|slaap lekker|fijne avond)(\s|$)/.test(t)) {
      return { type: "chat", text: persona.bye || "Tot zo! Tik op de microfoon als je me weer nodig hebt.", playful: true };
    }
    /* Begroeting, met of zonder naam: nooit zoeken. */
    if ((GREET_RE.test(t) && words.length <= 5 && !LOOKUP_RE.test(t.replace(GREET_RE, "").trim())) || (name && !stripped)) {
      return { type: "chat", text: persona.hello || "Hoi Ernst! Wat kan ik voor je doen?", playful: true };
    }
    if (name && GREET_RE.test(t)) {
      t = t.replace(GREET_RE, "").replace(new RegExp("^" + name + "\\b"), "").trim();
      raw = t;
    }
    if (/\b(hoe laat is het|hoe laat is ie|hoe laat|wat is de tijd|hoe laat is het nu)\b/.test(t) || t === "tijd") {
      return { type: "chat", text: timeAnswer() };
    }
    if (/\b(welke datum is het|welke dag is het|wat is de datum|welke datum|welke dag|wat voor dag)\b/.test(t) || t === "datum") {
      return { type: "chat", text: dateAnswer() };
    }
    if (/\b(vertel (eens )?(een )?mop|een mopje|een grapje|een grap|maak me aan het lachen)\b/.test(t) || t === "mop" || t === "grapje" || t === "grap") {
      return { type: "chat", text: JOKES[Math.floor(Math.random() * JOKES.length)], playful: true };
    }
    if (isSpotifyIntent(t)) return { type: "spotify" };
    var math = tryArithmetic(raw);
    if (math) return math;
    if (LOOKUP_RE.test(t) || /\?\s*$/.test(String(raw || "")) || t.split(" ").length >= 3) {
      return { type: "search", query: extractSearchQuery(raw) };
    }
    return { type: "chat", text: persona.unknown || "Vertel, wat wil je weten? Vraag bijvoorbeeld: wie is, wat is, of zoek gevolgd door een onderwerp." };
  }

  function normalizeTurnText(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  /* Haal uit de volledige transcriptie alleen het nieuwe stuk na wat al verwerkt is. */
  function diffTranscript(parts, consumedText, consumedIndex) {
    var full = normalizeTurnText(parts.join(" "));
    if (!full) return "";
    var c = normalizeTurnText(consumedText);
    if (!c) return full;
    var lf = full.toLowerCase();
    var lc = c.toLowerCase();
    if (lf.indexOf(lc) === 0) return normalizeTurnText(full.slice(c.length));
    if (parts.length > consumedIndex && consumedIndex > 0) {
      return normalizeTurnText(parts.slice(consumedIndex).join(" "));
    }
    /* iOS herschrijft soms eerdere woorden: neem de woorden na het aantal verwerkte woorden. */
    var fw = full.split(" ");
    var cw = c.split(" ");
    if (fw.length > cw.length) return fw.slice(cw.length).join(" ");
    return "";
  }

  function pickVoice(prefer) {
    if (!window.speechSynthesis) return null;
    var voices = speechSynthesis.getVoices() || [];
    var nl = voices.filter(function (v) { return (v.lang || "").toLowerCase().replace("_", "-").indexOf("nl") === 0; });
    if (!nl.length) return null;
    if (prefer === "female") {
      var FEMALE = /(claire|fleur|ellen|lotte|femke|anna|sanne|eva|colette|google nederlands|female|vrouw)/i;
      var nlnl = nl.filter(function (v) { return /nl-nl/i.test((v.lang || "").replace("_", "-")); });
      var hit = nlnl.filter(function (v) { return FEMALE.test(v.name || ""); })[0] ||
        nl.filter(function (v) { return FEMALE.test(v.name || ""); })[0];
      if (hit) return hit;
      var notMale = nlnl.filter(function (v) { return !/(xander|male|man\b)/i.test(v.name || ""); })[0];
      return notMale || nlnl[0] || nl[0];
    }
    var nlnl2 = nl.filter(function (v) { return /nl-nl/i.test((v.lang || "").replace("_", "-")); });
    return nlnl2[0] || nl[0];
  }
  if (window.speechSynthesis) {
    try {
      speechSynthesis.getVoices();
      if (typeof speechSynthesis.addEventListener === "function") {
        speechSynthesis.addEventListener("voiceschanged", function () { speechSynthesis.getVoices(); });
      }
    } catch (err) {}
  }

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

  function noop() {}

  function create(opts) {
    opts = opts || {};
    var els = opts.els || {};
    var hooks = opts.hooks || {};
    var state = opts.state || {};
    var form = els.form, input = els.input, micBtn = els.micBtn, resultsEl = els.results;
    var voiceHint = els.voiceHint, listenStatus = els.listenStatus, shortcutInput = els.shortcutInput;
    var debugToggle = els.debugToggle, debugLogEl = els.debugLog, tapContinue = els.tapContinue;
    var speakToggle = els.speakToggle, chatEl = els.chat;
    var prefix = opts.storagePrefix || "poppetje";
    var SHORTCUT_KEY = prefix + "-shortcut-name";
    var DEBUG_KEY = prefix + "-voice-debug";
    var SILENCE_MS = opts.silenceMs || 1000;
    var MUTE_AFTER_TTS_MS = 400;
    var START_WATCH_MS = 2500;
    var MAX_QUICK_RESTARTS = 4;
    var LIVE_GRACE_MS = 2500;   /* na het praten: binnen 2,5 s echt luisteren, anders de tik-laag */
    var DEAF_MS = 6000;         /* iOS kan na het praten doof worden zonder onend */
    var MIN_THINK_MS = 700;
    var micLabel = opts.micLabel || "Praat met mij";
    var voicePref = opts.voice || "any";

    function safe(fn, name) {
      return function () {
        try { return (fn || noop).apply(null, arguments); }
        catch (err) { try { log("hook-fout", name + ": " + (err && err.message)); } catch (e2) {} return null; }
      };
    }
    var H = {};
    ["bubble", "startThinking", "stopThinking", "smile", "onSpeakStart", "onSpeakEnd", "onListening",
     "onDone", "onError", "onPlayful", "activity", "onChatChange"].forEach(function (k) { H[k] = safe(hooks[k], k); });

    state.conversation = false;
    state.listening = false;
    state.speaking = false;
    state.busy = false;
    state.needsTap = false;
    state.dictationMode = false;
    state.pendingTranscript = "";
    state.muteUntil = 0;
    state.turns = 0;
    state.lastSpeechEnd = 0;
    state.liveSince = 0;

    var rec = null;           /* de ene langlevende herkenner */
    var recLive = false;      /* onstart/onaudiostart gezien */
    var consumedText = "";
    var consumedIndex = 0;
    var lastParts = [];
    var silenceTimer = null;
    var dictateTimer = null;
    var startWatch = null;
    var restartTimes = [];
    var speechUnlocked = false;
    var lastOpenUrl = "";
    var debugLines = [];

    /* ---------- debuglog ---------- */
    function renderDebug() {
      if (!debugLogEl) return;
      var on = !!(debugToggle && debugToggle.checked);
      debugLogEl.hidden = !on;
      if (on) {
        debugLogEl.textContent = debugLines.join("\n") || "Nog geen spraak-events.";
        try { debugLogEl.scrollTop = debugLogEl.scrollHeight; } catch (err) {}
      }
    }
    function log(event, detail) {
      var t = new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Amsterdam" });
      debugLines.push(t + "  " + event + (detail ? "  " + detail : ""));
      if (debugLines.length > 60) debugLines.shift();
      renderDebug();
    }

    /* ---------- status-UI ---------- */
    function showVoiceHint(text) {
      if (!voiceHint) return;
      voiceHint.textContent = text || "";
      voiceHint.hidden = !text;
    }
    function setListenStatus(text) {
      if (!listenStatus) return;
      listenStatus.textContent = text || "";
      listenStatus.hidden = !text;
    }
    function updateMicBtn() {
      if (!micBtn) return;
      micBtn.setAttribute("aria-pressed", state.conversation ? "true" : "false");
      micBtn.setAttribute("aria-label", state.conversation ? "Stoppen" : "Praten");
      micBtn.title = state.conversation ? "Stoppen" : micLabel;
    }
    function setListening(on) {
      var was = state.listening;
      state.listening = !!on;
      document.body.classList.toggle("listening", !!on);
      updateMicBtn();
      refreshStatus();
      if (was !== state.listening) H.onListening(state.listening);
    }
    function refreshStatus() {
      if (state.needsTap) { setListenStatus(""); return; }
      if (state.busy && state.speaking) { setListenStatus(state.conversation ? "praat… (daarna luister ik weer)" : ""); return; }
      if (state.busy) { setListenStatus("denkt na…"); return; }
      if (state.listening) {
        setListenStatus(state.pendingTranscript ? "luistert… " + state.pendingTranscript : "luistert… zeg het maar");
        return;
      }
      if (state.conversation) { setListenStatus("even geduld…"); return; }
      if (state.dictationMode) { setListenStatus("typ of dicteer je vraag"); return; }
      setListenStatus("");
    }

    /* ---------- spreken ---------- */
    function unlockSpeech() {
      if (speechUnlocked || !window.speechSynthesis) return;
      try {
        var u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        u.lang = "nl-NL";
        speechSynthesis.speak(u);
        speechUnlocked = true;
        log("unlockSpeech");
      } catch (err) { log("unlockSpeech-error", err && err.message); }
    }

    /* iOS: onend vuurt vaak niet, of de utterance wordt opgeruimd. Daarom: globale referentie,
       polling van speechSynthesis.speaking en een waakhond op de geschatte duur. Altijd door. */
    var SPEAK_KEY = prefix + "-hardop";
    function speakAloud() {
      if (speakToggle) return !!speakToggle.checked;
      return true;
    }
    function speak(text) {
      return new Promise(function (resolve) {
        if (!text || !window.speechSynthesis || isShotMode() || !speakAloud()) { resolve(); return; }
        var synth = window.speechSynthesis;
        var u;
        try { u = new SpeechSynthesisUtterance(text); } catch (err) { resolve(); return; }
        u.lang = "nl-NL";
        u.rate = 1;
        var v = pickVoice(voicePref);
        if (v) { u.voice = v; u.lang = v.lang || "nl-NL"; }
        window.__ejzUtterance = u; /* niet laten opruimen */
        var started = Date.now();
        var estimate = 1500 + String(text).length * 70;
        var done = false, poll = null, hard = null, quietPolls = 0;
        var finish = function (why) {
          if (done) return;
          done = true;
          if (poll) clearInterval(poll);
          if (hard) clearTimeout(hard);
          if (why === "waakhond") { try { synth.cancel(); } catch (err) {} }
          state.speaking = false;
          state.muteUntil = Date.now() + MUTE_AFTER_TTS_MS;
          state.lastSpeechEnd = Date.now();
          log("tts-end", why + " na " + (Date.now() - started) + "ms");
          H.onSpeakEnd();
          refreshStatus();
          resolve();
        };
        u.onend = function () { finish("onend"); };
        u.onerror = function (e) { finish("onerror " + ((e && e.error) || "")); };
        state.speaking = true;
        state.muteUntil = Date.now() + 60000;
        refreshStatus();
        H.onSpeakStart(text);
        log("tts-start", ((v && v.name) ? v.name : "standaard") + ", schatting " + estimate + "ms");
        try {
          if (synth.speaking || synth.pending) synth.cancel();
          synth.speak(u);
        } catch (err) { finish("throw"); return; }
        poll = setInterval(function () {
          var t = Date.now() - started;
          var busyNow = false;
          try { busyNow = !!(synth.speaking || synth.pending); } catch (err) {}
          if (t > 700 && !busyNow) {
            quietPolls += 1;
            if (quietPolls >= 2) finish("poll");
          } else quietPolls = 0;
        }, 250);
        hard = setTimeout(function () { finish("waakhond"); }, Math.min(20000, estimate + 2500));
      });
    }

    /* ---------- antwoorden ---------- */
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
      lastOpenUrl = url || "";
      if (!url || isShotMode()) return false;
      var local = location.hostname === "127.0.0.1" || location.hostname === "localhost" || location.protocol === "http:";
      if (local && !/^https?:/i.test(url)) return false;
      try { window.location.href = url; return true; } catch (err) { return false; }
    }
    function makeSpotifyButton() {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "open-spotify";
      btn.textContent = getShortcutName() ? "Start opdracht" : "Open Spotify";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        H.activity();
        var url = spotifyOpenUrl();
        if (!tryOpenUrl(url) && url.indexOf("shortcuts://") !== 0) tryOpenUrl("https://open.spotify.com/");
      });
      return btn;
    }
    function handleSpotify() {
      var text = getShortcutName()
        ? "Ik start je opdracht. Tik op de knop als het niet vanzelf gaat."
        : "Ik open Spotify. Tik op de knop als het niet vanzelf gaat. Met een opdracht in Opdrachten kan de muziek écht starten.";
      H.bubble(text, "bot", { sticky: true, action: makeSpotifyButton() });
      tryOpenUrl(spotifyOpenUrl());
      return speak(text).then(function () { return { type: "spotify", url: lastOpenUrl }; });
    }

    function clearResults() {
      if (!resultsEl) return;
      resultsEl.innerHTML = "";
      resultsEl.hidden = true;
      H.onChatChange();
    }
    function renderResults(items) {
      if (!resultsEl) return;
      resultsEl.innerHTML = "";
      if (!items || !items.length) { resultsEl.hidden = true; return; }
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
      H.onChatChange();
      try { if (chatEl) chatEl.scrollTop = chatEl.scrollHeight; } catch (err) {}
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
      var url = "https://api.duckduckgo.com/?q=" + encodeURIComponent(query) + "&format=json&no_html=1&skip_disambig=1&t=poppetje";
      return fetchJson(url).then(function (data) {
        var items = [];
        if (data && (data.AbstractText || data.Heading) && data.AbstractURL) {
          items.push({ source: "DuckDuckGo", title: data.Heading || query, snippet: stripHtml(data.AbstractText), url: data.AbstractURL });
        }
        ((data && data.RelatedTopics) || []).forEach(function (topic) {
          if (items.length >= 3) return;
          if (topic && topic.Text && topic.FirstURL) {
            items.push({ source: "DuckDuckGo", title: topic.Text.split(" - ")[0], snippet: stripHtml(topic.Text), url: topic.FirstURL });
          }
        });
        return items;
      });
    }
    function searchInApp(query, thinkDone) {
      var q = String(query || "").trim();
      if (!q) return Promise.resolve([]);
      thinkDone = thinkDone || function () { return Promise.resolve(); };
      H.bubble("Ik zoek het voor je.", "bot", { sticky: true });
      return Promise.allSettled([searchWikipedia(q), searchDuckDuckGo(q), thinkDone()])
        .then(function (parts) {
          parts = parts.slice(0, 2);
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
          items = items.slice(0, 4);
          renderResults(items);
          var say = !items.length
            ? "Ik vond niks. Probeer andere woorden."
            : "Ik vond " + items.length + (items.length === 1 ? " resultaat" : " resultaten") + " over " + q + ".";
          H.bubble(say, "bot", { sticky: true });
          return speak(say).then(function () { return { type: "search", query: q, items: items, ok: items.length > 0 }; });
        })
        .catch(function () {
          var miss = "Zoeken lukte even niet. Probeer het zo nog eens.";
          H.bubble(miss, "bot", { sticky: true });
          return speak(miss).then(function () { return { type: "search", query: q, items: [], ok: false }; });
        });
    }

    function handleQuery(raw) {
      var q = String(raw || "").trim();
      if (!q) return Promise.resolve(null);
      H.activity();
      H.startThinking();
      var t0 = Date.now();
      var thinkDone = function () {
        var left = MIN_THINK_MS - (Date.now() - t0);
        return new Promise(function (r) { setTimeout(r, Math.max(0, left)); });
      };
      var kind = classifyQuery(q, opts.persona);
      if (kind.type === "spotify") return thinkDone().then(handleSpotify);
      if (kind.type === "chat") {
        return thinkDone().then(function () {
          if (kind.playful) H.onPlayful();
          H.bubble(kind.text, "bot", { sticky: true });
          return speak(kind.text).then(function () { return kind; });
        });
      }
      return searchInApp(kind.query || q, thinkDone);
    }

    /* ---------- beurten ---------- */
    function clearSilence() { if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; } }
    function clearDictate() { if (dictateTimer) { clearTimeout(dictateTimer); dictateTimer = null; } }

    function submitTurn(raw, source) {
      var q = normalizeTurnText(raw);
      if (!q) return Promise.resolve(null);
      if (state.busy) { log("turn-ignored-busy", q); return Promise.resolve(null); }
      clearSilence();
      clearDictate();
      state.busy = true;
      state.turnStartedAt = Date.now();
      restartTimes = []; /* er kwam iets door: de herkenner is gezond */
      state.pendingTranscript = "";
      state.turns += 1;
      clearDeaf();
      clearResults();
      /* Alles wat de herkenner tot nu toe hoorde is verwerkt. */
      consumedText = normalizeTurnText(lastParts.join(" "));
      consumedIndex = lastParts.length;
      if (input) input.value = "";
      log("turn " + state.turns, (source || "") + ": " + q);
      H.bubble(q, "user", { sticky: true });
      refreshStatus();
      var ok = true;
      return handleQuery(q).then(function (res) {
        if (res && res.ok === false) ok = false;
        return res;
      }).catch(function (err) {
        ok = false;
        log("turn-error", err && err.message);
        return null;
      }).then(function (res) {
        state.busy = false;
        if (input) input.value = "";
        H.stopThinking();
        H.smile(false);
        if (ok) H.onDone(res); else H.onError(res);
        /* Wat tijdens het praten binnenkwam telt niet mee. */
        consumedText = normalizeTurnText(lastParts.join(" "));
        consumedIndex = lastParts.length;
        refreshStatus();
        if (state.conversation) listenAfterSpeech();
        return res;
      });
    }

    function muted() {
      return state.busy || state.speaking || Date.now() < state.muteUntil;
    }

    function onResult(event) {
      var results = event && event.results;
      if (!results) return;
      var parts = [];
      var lastFinal = false;
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var alt = r ? (r[0] || (typeof r.item === "function" ? r.item(0) : null)) : null;
        parts.push(alt && alt.transcript != null ? String(alt.transcript) : "");
        if (i === results.length - 1) lastFinal = !!(r && r.isFinal);
      }
      lastParts = parts;
      markLive("onresult");
      if (muted()) {
        consumedText = normalizeTurnText(parts.join(" "));
        consumedIndex = parts.length;
        log("ignored-while-speaking", normalizeTurnText(parts.join(" ")).slice(-40));
        return;
      }
      var text = diffTranscript(parts, consumedText, consumedIndex);
      log("onresult " + (lastFinal ? "final" : "interim"), text || "(leeg)");
      if (!text) return;
      state.pendingTranscript = text;
      if (input) input.value = text;
      refreshStatus();
      clearSilence();
      if (lastFinal) {
        silenceTimer = setTimeout(function () { silenceTimer = null; flushPending("final"); }, 150);
      } else {
        silenceTimer = setTimeout(function () { silenceTimer = null; flushPending("stilte"); }, SILENCE_MS);
      }
    }

    function flushPending(source) {
      var q = state.pendingTranscript;
      if (!q || muted()) return;
      submitTurn(q, source);
    }

    /* ---------- herkenner ---------- */
    function clearStartWatch() { if (startWatch) { clearTimeout(startWatch); startWatch = null; } }

    var heardAt = 0;
    var deafTimer = null;
    function clearDeaf() { if (deafTimer) { clearTimeout(deafTimer); deafTimer = null; } }
    function markHeard(source) {
      heardAt = Date.now();
      clearDeaf();
    }
    function markLive(source) {
      if (!recLive) { log("live", source); state.liveSince = Date.now(); everLive = true; }
      recLive = true;
      clearStartWatch();
      if (state.needsTap) hideTap();
      if (!state.listening) setListening(true);
    }

    function detach(r) {
      if (!r) return;
      r.onstart = r.onresult = r.onerror = r.onend = r.onspeechend = r.onaudioend = r.onaudiostart = r.onsoundstart = r.onspeechstart = null;
    }

    function killRecognizer() {
      var r = rec;
      rec = null;
      recLive = false;
      clearStartWatch();
      if (!r) return;
      detach(r);
      try { r.abort(); } catch (err) {}
      log("recognizer-stopped");
    }

    function startRecognizer(source, fromGesture) {
      var Ctor = speechRecCtor();
      if (!Ctor) { dictationFallback("unsupported"); return false; }
      if (rec) return true;
      var r;
      try { r = new Ctor(); } catch (err) {
        log("construct-throw", err && err.message);
        dictationFallback("construct");
        return false;
      }
      r.lang = "nl-NL";
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onstart = function () { markLive("onstart"); };
      r.onaudiostart = function () { markLive("onaudiostart"); };
      r.onsoundstart = function () { log("onsoundstart"); markHeard("sound"); };
      r.onspeechstart = function () { log("onspeechstart"); markHeard("speech"); };
      r.onresult = function (ev) { markHeard("result"); onResult(ev); };
      r.onspeechend = function () { log("onspeechend"); };
      r.onaudioend = function () { log("onaudioend"); };
      r.onerror = function (ev) {
        var code = (ev && ev.error) || "error";
        log("onerror", code);
        if (code === "aborted" || code === "no-speech") return; /* onend volgt; we herstarten daar */
        if (code === "not-allowed" || code === "service-not-allowed") {
          r.__fatal = code;
          return;
        }
        if (code === "audio-capture" || code === "network" || code === "language-not-supported") {
          r.__fatal = code;
        }
      };
      r.onend = function () {
        log("onend", r.__fatal || "");
        if (rec !== r) return;
        rec = null;
        recLive = false;
        detach(r);
        if (!state.conversation) { setListening(false); return; }
        /* Eventueel half gehoorde zin nog afmaken. */
        if (state.pendingTranscript && !muted()) { clearSilence(); submitTurn(state.pendingTranscript, "onend"); }
        consumedText = "";
        consumedIndex = 0;
        lastParts = [];
        if (r.__fatal === "not-allowed" || r.__fatal === "service-not-allowed") { showTap(r.__fatal); return; }
        if (r.__fatal) { dictationFallback(r.__fatal); return; }
        if (state.busy) { log("onend-tijdens-beurt", "herstart na het antwoord"); return; }
        ensureListening("onend");
      };
      try {
        r.start();
      } catch (err) {
        var msg = ((err && err.name) || "") + " " + ((err && err.message) || "");
        log("start-throw", msg.trim());
        detach(r);
        if (state.conversation) showTap("start-throw");
        else dictationFallback("start");
        return false;
      }
      rec = r;
      recLive = false;
      /* nieuwe sessie: transcript begint weer bij nul */
      consumedText = "";
      consumedIndex = 0;
      lastParts = [];
      log("start()", source + (fromGesture ? " (tik)" : ""));
      clearStartWatch();
      var watchMs = everLive ? START_WATCH_MS : 10000;
      startWatch = setTimeout(function () {
        startWatch = null;
        if (rec === r && !recLive) {
          log("start-silent", watchMs + "ms");
          killRecognizer();
          if (state.conversation) showTap("stil");
        }
      }, watchMs);
      return true;
    }

    /* Na het praten: iOS laat de oude herkenner vaak doof achter (geen onend, geen resultaten).
       Daarom een verse herkenner, en als die niets hoort binnen DEAF_MS: de tik-laag. */
    function listenAfterSpeech() {
      if (!state.conversation || state.needsTap) return;
      var spoke = state.lastSpeechEnd && Date.now() - state.lastSpeechEnd < 3000;
      if (spoke && rec) {
        log("verse-herkenner", "na praten");
        killRecognizer();
        setTimeout(function () {
          if (!state.conversation || state.busy || state.needsTap) return;
          ensureListening("na-praten", true);
          armDeaf();
        }, 300);
        return;
      }
      ensureListening("after-turn");
      if (spoke) armDeaf();
    }
    function armDeaf() {
      clearDeaf();
      var since = Date.now();
      deafTimer = setTimeout(function () {
        deafTimer = null;
        if (!state.conversation || state.busy || state.needsTap) return;
        if (heardAt > since) return;
        if (state.pendingTranscript) return;
        log("doof-na-praten", DEAF_MS + "ms zonder geluid");
        showTap("doof");
      }, DEAF_MS);
    }

    /* Zorg dat er geluisterd wordt: direct herstarten, en na te veel snelle herstarts de tik-laag. */
    function ensureListening(source, planned) {
      if (!state.conversation || state.needsTap) return;
      if (rec) { refreshStatus(); return; }
      if (planned) { log("auto-restart", source); startRecognizer(source, false); refreshStatus(); return; }
      var t = Date.now();
      restartTimes = restartTimes.filter(function (x) { return t - x < 10000; });
      if (restartTimes.length >= MAX_QUICK_RESTARTS) { showTap("te-vaak-gestopt"); return; }
      restartTimes.push(t);
      log("auto-restart", source);
      startRecognizer(source, false);
      refreshStatus();
    }

    var notLiveSince = 0;
    var everLive = false;
    setInterval(function () {
      var now = Date.now();
      if (state.busy && state.turnStartedAt && now - state.turnStartedAt > 30000) {
        log("waakhond", "beurt hing >30s");
        state.busy = false;
        state.speaking = false;
        try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (err) {}
        H.stopThinking();
        refreshStatus();
      }
      var live = !!(rec && recLive);
      if (!state.conversation || state.needsTap || state.busy || state.speaking || live || now < state.muteUntil) {
        notLiveSince = 0;
        return;
      }
      if (!notLiveSince) notLiveSince = now;
      if (now - notLiveSince > (everLive ? LIVE_GRACE_MS : 10000)) {
        notLiveSince = 0;
        log("waakhond", "luistert niet echt");
        showTap("niet-live");
      }
      refreshStatus();
    }, 500);

    function hideTap() {
      state.needsTap = false;
      if (tapContinue) tapContinue.hidden = true;
      document.body.classList.remove("needs-tap");
      refreshStatus();
    }
    function showTap(reason) {
      killRecognizer();
      clearDeaf();
      state.needsTap = true;
      setListening(false);
      showVoiceHint("");
      if (tapContinue) tapContinue.hidden = false;
      document.body.classList.add("needs-tap");
      log("tap-to-continue", reason || "");
      refreshStatus();
    }
    function continueFromTap(source) {
      if (!state.needsTap) return;
      log("tap-continue", source || "tik");
      hideTap();
      unlockSpeech();
      if (!state.speaking && !state.busy) state.muteUntil = 0; /* bewuste tik: meteen luisteren */
      try { if (window.speechSynthesis && !state.speaking) window.speechSynthesis.cancel(); } catch (err) {}
      killRecognizer();
      restartTimes = [];
      H.activity();
      startRecognizer("tik-laag", true);
      refreshStatus();
    }

    function errorMessage(code) {
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
        return "Ik krijg geen toegang tot de microfoon. Typ je vraag, of tik in het vak en gebruik het microfoontje van het toetsenbord.";
      }
      if (code === "network") return "De spraakherkenning heeft even geen netwerk. Typ of dicteer je vraag via het toetsenbord.";
      if (code === "unsupported" || code === "construct" || code === "start") {
        return isStandalone()
          ? "Spraak via de knop werkt hier niet. Tik in het vak en gebruik het microfoontje van het toetsenbord; na een korte stilte antwoord ik vanzelf."
          : "Spraakherkenning is hier niet beschikbaar. Tik in het vak en gebruik het microfoontje van het toetsenbord; na een korte stilte antwoord ik vanzelf.";
      }
      return "Spraakherkenning gaf een fout (" + code + "). Typ of dicteer je vraag via het toetsenbord.";
    }

    function dictationFallback(reason) {
      killRecognizer();
      state.conversation = false;
      state.dictationMode = true;
      setListening(false);
      updateMicBtn();
      showVoiceHint(errorMessage(reason || "unsupported"));
      log("dictationFallback", reason || "");
      refreshStatus();
      try { if (input) input.focus(); } catch (err) {}
    }

    function startConversation() {
      state.conversation = true;
      state.dictationMode = false;
      state.pendingTranscript = "";
      consumedText = "";
      consumedIndex = 0;
      lastParts = [];
      restartTimes = [];
      hideTap();
      showVoiceHint("");
      updateMicBtn();
      unlockSpeech();
      log("startConversation", ENGINE_VERSION);
      startRecognizer("mic", true);
      refreshStatus();
    }

    function endConversation() {
      state.conversation = false;
      state.dictationMode = false;
      state.pendingTranscript = "";
      clearSilence();
      clearDictate();
      hideTap();
      killRecognizer();
      setListening(false);
      showVoiceHint("");
      updateMicBtn();
      log("endConversation");
      refreshStatus();
    }

    function toggleMic() {
      if (state.needsTap) { continueFromTap("mic"); return; }
      if (state.conversation) { endConversation(); return; }
      startConversation();
    }

    /* ---------- typen / dicteren ---------- */
    function scheduleDictationSubmit() {
      clearDictate();
      if (!input || !input.value.trim() || state.busy) return;
      if (rec && recLive) return; /* de herkenner vult het veld zelf */
      if (document.activeElement !== input) return;
      dictateTimer = setTimeout(function () {
        dictateTimer = null;
        if (state.busy || document.activeElement !== input) return;
        if (!(state.conversation || state.dictationMode)) return;
        var q = input.value.trim();
        if (q) submitTurn(q, "dicteren");
      }, 1200);
    }

    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var q = input ? input.value.trim() : "";
        if (!q) return;
        unlockSpeech();
        submitTurn(q, "typen");
      });
    }
    if (input) input.addEventListener("input", scheduleDictationSubmit);
    if (micBtn) {
      micBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        H.activity();
        toggleMic();
      });
    }
    if (tapContinue) {
      tapContinue.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        continueFromTap("knop");
      });
    }
    if (shortcutInput) {
      try {
        var savedName = window.localStorage.getItem(SHORTCUT_KEY);
        if (savedName) shortcutInput.value = savedName;
      } catch (err) {}
      var save = function () { try { window.localStorage.setItem(SHORTCUT_KEY, shortcutInput.value.trim()); } catch (err) {} };
      shortcutInput.addEventListener("change", save);
      shortcutInput.addEventListener("blur", save);
    }
    if (speakToggle) {
      try { var sv = window.localStorage.getItem(SPEAK_KEY); if (sv !== null) speakToggle.checked = sv === "1"; } catch (err) {}
      speakToggle.addEventListener("change", function () {
        try { window.localStorage.setItem(SPEAK_KEY, speakToggle.checked ? "1" : "0"); } catch (err) {}
        log("hardop", speakToggle.checked ? "aan" : "uit");
      });
    }
    if (debugToggle) {
      try { debugToggle.checked = window.localStorage.getItem(DEBUG_KEY) === "1"; } catch (err) {}
      renderDebug();
      debugToggle.addEventListener("change", function () {
        try { window.localStorage.setItem(DEBUG_KEY, debugToggle.checked ? "1" : "0"); } catch (err) {}
        renderDebug();
      });
    }
    document.addEventListener("visibilitychange", function () {
      log("visibility", document.visibilityState);
      if (document.visibilityState === "visible" && state.conversation && !rec && !state.needsTap) showTap("terug-in-app");
    });

    return {
      version: ENGINE_VERSION,
      state: state,
      speak: speak,
      submitTurn: submitTurn,
      handleQuery: handleQuery,
      classifyQuery: function (q) { return classifyQuery(q, opts.persona); },
      tryArithmetic: tryArithmetic,
      startConversation: startConversation,
      endConversation: endConversation,
      toggleMic: toggleMic,
      continueFromTap: continueFromTap,
      showTap: showTap,
      log: log,
      getShortcutName: getShortcutName,
      lastOpenUrl: function () { return lastOpenUrl; },
      diffTranscript: diffTranscript,
      debugLines: function () { return debugLines.slice(); },
      recognizerLive: function () { return !!(rec && recLive); }
    };
  }

  window.PoppetjeEngine = { create: create, version: ENGINE_VERSION, diffTranscript: diffTranscript, tryArithmetic: tryArithmetic, classifyQuery: classifyQuery };
})();
