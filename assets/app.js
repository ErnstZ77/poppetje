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
  var tiltBtn = document.getElementById("tilt-btn");

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
    recognition: null
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

  function bubble(text) {
    if (!text) return;
    var row = document.createElement("div");
    row.className = "bubble-row";
    row.innerHTML = AVATAR;
    var el = document.createElement("div");
    el.className = "bubble";
    el.textContent = text;
    row.appendChild(el);
    bubbles.appendChild(row);
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
      setTimeout(function () {
        if (!el.parentNode) return;
        anime({
          targets: el,
          opacity: 0,
          translateY: -10,
          duration: 280,
          easing: "easeInQuad",
          complete: function () { row.remove(); }
        });
      }, 2200);
    } else {
      el.style.opacity = "1";
      setTimeout(function () { row.remove(); }, reduced ? 1800 : 2400);
    }
    while (bubbles.children.length > 2) bubbles.removeChild(bubbles.firstChild);
    bobMic();
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
      if (!thinkLinesShown) {
        bubble(THINK_LINES[Math.floor(Math.random() * THINK_LINES.length)]);
        thinkLinesShown = true;
      }
    } else {
      thinkLinesShown = false;
      if (state.thinking) stopThinking();
    }
  }


  var VERSION = "v5-search-voice";
  var JOKES = [
    "Waarom hebben wastafels geen geheimen? Omdat ze alles laten weglopen.",
    "Wat zei de stoel tegen de tafel? Blijf zitten, ik sta er wel.",
    "Ik ken maar korte moppen. De lange lopen me altijd uit de… mop.",
    "Waarom nam de loodgieter een liniaal mee? Om de bocht een beetje recht te zetten."
  ];

  function isStandalone() {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
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

  function speak(text) {
    if (!text || !window.speechSynthesis) return;
    var q = new URLSearchParams(location.search);
    if (q.has("shot") || q.has("closeup") || q.has("icon")) return;
    try { speechSynthesis.cancel(); } catch (err) {}
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "nl-NL";
    u.rate = 1;
    var voice = pickNlVoice();
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
    bobMic();
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

  function timeAnswer() {
    var t = new Date().toLocaleTimeString("nl-NL", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Europe/Amsterdam"
    });
    return "Het is " + t + ".";
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

  function extractSearchQuery(raw) {
    var q = String(raw || "").trim();
    q = q.replace(/^(ik ben (er )?op zoek naar|ik zoek naar|ik zoek|zoek eens naar|zoek naar|zoek maar|zoek|search for|search)\s+/i, "");
    return q.trim() || String(raw || "").trim();
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
    bubble("Ik zoek het voor je.");
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
        if (!items.length) {
          var miss = "Ik vond niks. Probeer andere woorden.";
          bubble(miss);
          speak(miss);
        } else {
          var say = "Ik vond " + items.length + (items.length === 1 ? " resultaat" : " resultaten") +
            " over " + q + ".";
          bubble(say);
          speak(say);
        }
        return items;
      })
      .catch(function () {
        var miss = "Zoeken lukte even niet. Probeer het zo nog eens.";
        bubble(miss);
        speak(miss);
        return [];
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
    input.value = q;
    smileOn(true);
    var kind = classifyQuery(q);
    if (kind.type === "chat") {
      clearResults();
      bubble(kind.text);
      speak(kind.text);
      setTimeout(function () { smileOn(false); stopThinking(); }, 700);
      return Promise.resolve(kind);
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

  function setListening(on) {
    state.listening = !!on;
    document.body.classList.toggle("listening", !!on);
    if (micBtn) micBtn.setAttribute("aria-pressed", on ? "true" : "false");
    if (on) {
      activity();
      if (!state.phonesOn) setHeadphones(true, false);
      setLook(0, 0.2, 200);
    } else {
      setLook(0, 0, 240);
    }
  }

  function stopListening() {
    if (state.recognition) {
      try { state.recognition.abort(); } catch (err) {}
      state.recognition = null;
    }
    setListening(false);
  }

  function dictationFallback(reason) {
    stopListening();
    var msg = isStandalone()
      ? "In de app op je beginscherm werkt de microfoonknop vaak niet. Tik in het zoekveld en daarna op het microfoontje op het toetsenbord."
      : "Spraakherkenning is hier niet beschikbaar. Tik in het zoekveld en daarna op het microfoontje op het toetsenbord.";
    showVoiceHint(msg);
    bubble("Zeg het maar via het toetsenbord.");
    try { input.focus(); } catch (err) {}
  }

  function startListening() {
    var Ctor = speechRecCtor();
    if (!Ctor) {
      dictationFallback("unsupported");
      return;
    }
    if (state.listening) {
      stopListening();
      return;
    }
    showVoiceHint("");
    var rec;
    try {
      rec = new Ctor();
    } catch (err) {
      dictationFallback("construct");
      return;
    }
    rec.lang = "nl-NL";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onstart = function () {
      setListening(true);
      bubble("Ik luister…");
    };
    rec.onresult = function (event) {
      var text = "";
      var finalText = "";
      var i;
      for (i = event.resultIndex; i < event.results.length; i++) {
        var piece = event.results[i][0].transcript;
        text += piece;
        if (event.results[i].isFinal) finalText += piece;
      }
      if (text) input.value = text.trim();
      if (finalText.trim()) {
        stopListening();
        handleQuery(finalText.trim(), true);
      }
    };
    rec.onerror = function (event) {
      var err = (event && event.error) || "error";
      if (err === "aborted" || err === "no-speech") {
        stopListening();
        return;
      }
      dictationFallback(err);
    };
    rec.onend = function () {
      if (state.recognition === rec) setListening(false);
      state.recognition = null;
    };
    state.recognition = rec;
    try {
      rec.start();
    } catch (err) {
      dictationFallback("start");
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    e.stopPropagation();
    var q = input.value.trim();
    if (!q) return;
    handleQuery(q, false);
  });

  if (micBtn) {
    micBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      activity();
      startListening();
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
    else setLook(0, 0, 280);
  });

  function clearHold() {
    if (state.holdTimer) {
      clearTimeout(state.holdTimer);
      state.holdTimer = null;
    }
    state.holdArmed = false;
  }

  stage.addEventListener("pointerdown", function (e) {
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
    if (reduced || idleRunning || state.thinking || state.listening || state.pointerId !== null) return;
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
    speak: speak,
    classifyQuery: classifyQuery
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
