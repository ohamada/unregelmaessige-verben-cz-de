(function () {
  "use strict";

  /* ---------- Data ---------- */

  var VERBS = window.VERB_DATA.trim().split("\n").map(function (line) {
    var f = line.split("|");
    return {
      i: f[0],
      p: f[1].split("/"),
      t: f[2].split("/"),
      aux: f[3].split("/").map(function (a) { return a === "s" ? "ist" : "hat"; }),
      pp: f[4].split("/"),
      en: f[5],
      cs: f[6],
      pic: f[7] || ""
    };
  });

  var TENSES = ["p", "t", "pp"];
  var TENSE_LABEL = { p: "tPres", t: "tPraet", pp: "tPerf" };
  var STORE_KEY = "irregular-verbs-settings";

  /* ---------- Settings (stored only in this browser) ---------- */

  var settings = loadSettings();

  // Stored values are never trusted: anything unexpected falls back to the default.
  function loadSettings() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { raw = null; }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
    var tenses = Array.isArray(raw.tenses) ? TENSES.filter(function (k) { return raw.tenses.indexOf(k) !== -1; }) : [];
    var custom = parseInt(raw.custom, 10);
    return {
      lang: Object.prototype.hasOwnProperty.call(window.I18N, raw.lang) ? raw.lang : "cs",
      tenses: tenses.length ? tenses : TENSES.slice(),
      count: ["10", "20", "50", "all", "custom"].indexOf(raw.count) !== -1 ? raw.count : "10",
      mode: raw.mode === "choice" ? "choice" : "write",
      custom: custom >= 1 && custom <= VERBS.length ? custom : 15
    };
  }

  function saveSettings() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
  }

  /* ---------- Helpers ---------- */

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  function t(key, vars) {
    var s = (window.I18N[settings.lang] || window.I18N.en)[key] || window.I18N.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function meaning(v) {
    // Czech UI shows Czech meanings, English and German UI show English ones.
    return settings.lang === "cs" ? v.cs : v.en;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  /* ---------- Stem vowel highlighting ---------- */

  var VOWELS = /[aeiouäöüy]+/gi;

  function lastVowelGroup(word) {
    var m, last = null;
    VOWELS.lastIndex = 0;
    while ((m = VOWELS.exec(word))) last = { start: m.index, text: m[0] };
    // "qu": the u is a consonant (quellen, quillt)
    if (last && /u/i.test(last.text[0]) && last.start > 0 && /q/i.test(word[last.start - 1]) && last.text.length > 1) {
      last = { start: last.start + 1, text: last.text.slice(1) };
    }
    return last;
  }

  function infinitiveVowel(inf) {
    var g = lastVowelGroup(inf.replace(/e?n$/, ""));
    return g ? g.text.toLowerCase() : "";
  }

  // Removes the inflection ending, but keeps "ie" together (schrie, geschrien, ist).
  function stem(form, tense) {
    var s = form.replace(tense === "p" ? /e?s?t$/ : /(en|e)$/, "");
    return /i$/i.test(s) ? form : s;
  }

  // Wraps the stem vowel of a form in <mark> when it differs from the infinitive's stem vowel.
  function highlight(form, infVowel, tense) {
    var g = lastVowelGroup(stem(form, tense));
    if (!g || g.text.toLowerCase() === infVowel) return esc(form);
    return esc(form.slice(0, g.start)) + "<mark>" + esc(g.text) + "</mark>" + esc(form.slice(g.start + g.text.length));
  }

  function formsHtml(v, tense) {
    var iv = infinitiveVowel(v.i);
    var forms = tense === "pp" ? v.pp : v[tense];
    var html = forms.map(function (f) { return highlight(f, iv, tense); }).join(" / ");
    if (tense === "pp") html = '<span class="aux">' + v.aux.join("/") + "</span> " + html;
    return html;
  }

  function formsText(v, tense) {
    if (tense === "pp") return v.aux.join("/") + " " + v.pp.join(" / ");
    return v[tense].join(" / ");
  }

  /* ---------- Answer checking ---------- */

  function normalize(s) {
    return s.toLowerCase().replace(/\s+/g, " ").trim()
      .replace(/^(er\s*\/\s*sie\s*\/\s*es|er|sie|es)\s+/, "");
  }

  function fold(s) {
    return s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  }

  function candidates(v, tense) {
    if (tense !== "pp") return v[tense];
    var list = [];
    v.aux.forEach(function (a) { v.pp.forEach(function (p) { list.push(a + " " + p); }); });
    return list;
  }

  // Returns { status: "ok" | "spelling" | "aux" | "wrong", match: the form closest to the answer }
  function evaluate(v, tense, given) {
    var g = normalize(given);
    var cands = candidates(v, tense);
    var i;
    for (i = 0; i < cands.length; i++) if (cands[i] === g) return { status: "ok", match: cands[i] };
    for (i = 0; i < cands.length; i++) if (fold(cands[i]) === fold(g)) return { status: "spelling", match: cands[i] };
    if (tense === "pp" && g) {
      for (i = 0; i < v.pp.length; i++) if (fold(v.pp[i]) === fold(g)) return { status: "aux", match: null };
    }
    return { status: "wrong", match: null };
  }

  /* ---------- i18n ---------- */

  function applyLanguage() {
    document.documentElement.lang = settings.lang;
    document.title = t("appTitle");
    $$("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    $$("[data-i18n-placeholder]").forEach(function (el) { el.placeholder = t(el.getAttribute("data-i18n-placeholder")); });
    $$("[data-i18n-aria]").forEach(function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
    $$(".lang button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === settings.lang));
    });
    $("#count-all-label").textContent = t("countAll", { n: VERBS.length });
    renderOverview();
    if (session) {
      if (!$("#session").hidden) renderVerb(true);
      if (!$("#results").hidden) renderResults();
    }
  }

  /* ---------- Overview ---------- */

  function renderOverview() {
    var q = normalize($("#search").value);
    var fq = fold(q);
    var rows = VERBS.filter(function (v) {
      if (!q) return true;
      var hay = [v.i, v.p.join(" "), v.t.join(" "), v.pp.join(" "), meaning(v)].join(" ").toLowerCase();
      return hay.indexOf(q) !== -1 || fold(hay).indexOf(fq) !== -1;
    });

    $("#verb-rows").innerHTML = rows.map(function (v) {
      return '<div class="vrow" role="row">' +
        '<span class="c-inf" role="cell" lang="de">' + esc(v.i) + "</span>" +
        TENSES.map(function (k) {
          return '<span class="c-form" role="cell"><small>' + esc(t(TENSE_LABEL[k])) + '</small><span lang="de">' + formsHtml(v, k) + "</span></span>";
        }).join("") +
        '<span class="c-mean" role="cell">' + esc(meaning(v)) + "</span>" +
        "</div>";
    }).join("");

    $("#verb-count").textContent = t("verbCount", { n: rows.length });
    var none = $("#no-results");
    none.hidden = rows.length > 0;
    if (!rows.length) none.textContent = t("noResults", { x: $("#search").value.trim() });
  }

  /* ---------- Practice: setup ---------- */

  function initSetup() {
    $('input[name="mode"][value="' + settings.mode + '"]').checked = true;
    $$('input[name="tense"]').forEach(function (cb) { cb.checked = settings.tenses.indexOf(cb.value) !== -1; });
    var radio = $('input[name="count"][value="' + settings.count + '"]') || $('input[name="count"][value="10"]');
    radio.checked = true;
    $("#custom-count").value = settings.custom;
    $("#custom-count").max = VERBS.length;

    $("#custom-count").addEventListener("focus", function () {
      $('input[name="count"][value="custom"]').checked = true;
    });

    $("#setup").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#setup-error");
      var tenses = $$('input[name="tense"]:checked').map(function (cb) { return cb.value; });
      if (!tenses.length) { err.textContent = t("needTense"); err.hidden = false; return; }

      var choice = $('input[name="count"]:checked').value;
      var n;
      if (choice === "all") n = VERBS.length;
      else if (choice === "custom") n = parseInt($("#custom-count").value, 10);
      else n = parseInt(choice, 10);
      if (!(n >= 1 && n <= VERBS.length)) {
        err.textContent = t("needCount", { n: VERBS.length }); err.hidden = false; return;
      }
      err.hidden = true;

      settings.tenses = tenses;
      settings.mode = $('input[name="mode"]:checked').value;
      settings.count = choice;
      if (choice === "custom") settings.custom = n;
      saveSettings();

      startSession(shuffle(VERBS).slice(0, n), tenses, settings.mode);
    });
  }

  /* ---------- Practice: session ---------- */

  var session = null;
  var lastInput = null;

  function startSession(verbs, tenses, mode) {
    session = { verbs: verbs, tenses: tenses, mode: mode, index: 0, results: [], checked: false, choice: null };
    showPractice("session");
    renderVerb(false);
  }

  function current() { return session.verbs[session.index]; }

  // keep = re-render after a language change without losing typed answers
  function renderVerb(keep) {
    var v = current();
    var n = session.verbs.length;
    $("#progress-text").textContent = t("progress", { i: session.index + 1, n: n });
    $("#progress-bar").style.width = (session.index / n * 100) + "%";
    $("#prompt-pic").textContent = v.pic;
    $("#prompt-pic").hidden = !v.pic;
    $("#prompt-verb").textContent = v.i;
    $("#prompt-meaning").textContent = meaning(v);
    $("#keys").hidden = session.mode === "choice";

    if (session.mode === "choice") { renderChoices(keep); return; }

    var previous = {};
    if (keep) $$("#fields input").forEach(function (inp) { previous[inp.name] = inp.value; });

    $("#fields").innerHTML = session.tenses.map(function (k, idx) {
      var last = idx === session.tenses.length - 1;
      return '<div class="field" data-tense="' + k + '">' +
        '<label for="in-' + k + '">' + esc(t(TENSE_LABEL[k])) + "</label>" +
        '<div class="inputwrap"><span class="pron" lang="de">er/sie/es</span>' +
        '<input id="in-' + k + '" name="' + k + '" type="text" lang="de" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="' + (last ? "done" : "next") + '"' +
        (k === "pp" ? ' placeholder="hat / ist …"' : "") + "></div>" +
        '<p class="feedback" aria-live="polite"></p></div>';
    }).join("");

    $$("#fields input").forEach(function (inp) {
      if (keep && previous[inp.name] != null) inp.value = previous[inp.name];
      inp.addEventListener("focus", function () { lastInput = inp; });
      inp.addEventListener("keydown", onInputKey);
    });

    if (keep && session.checked) showFeedback(session.results[session.results.length - 1]);
    else {
      session.checked = false;
      updateButtons();
      if (!keep) focusFirst();
    }
  }

  function focusFirst() {
    var first = $("#fields input");
    lastInput = first;
    // Avoid popping the keyboard over the card on initial page load on phones; after a tap it is fine.
    if (first) first.focus({ preventScroll: true });
  }

  function onInputKey(e) {
    if (e.key !== "Enter" || session.checked) return;
    var inputs = $$("#fields input");
    var idx = inputs.indexOf(e.target);
    if (idx < inputs.length - 1) {
      e.preventDefault();
      inputs[idx + 1].focus();
    }
  }

  function updateButtons() {
    var primary = $("#primary");
    var lastVerb = session.index === session.verbs.length - 1;
    primary.textContent = session.checked ? t(lastVerb ? "finish" : "next") : t("check");
    primary.hidden = session.mode === "choice" && !session.checked;
    $("#reveal").hidden = session.checked || session.mode === "choice";
  }

  function check(reveal) {
    var v = current();
    var result = { verb: v, fields: {}, ok: true };
    session.tenses.forEach(function (k) {
      var inp = $("#in-" + k);
      var given = reveal ? "" : inp.value;
      var r = evaluate(v, k, given);
      r.given = given.trim();
      result.fields[k] = r;
      if (r.status !== "ok" && r.status !== "spelling") result.ok = false;
    });
    session.results.push(result);
    session.checked = true;
    showFeedback(result);
  }

  function showFeedback(result) {
    var v = result.verb;
    session.tenses.forEach(function (k) {
      var r = result.fields[k];
      var field = document.querySelector('.field[data-tense="' + k + '"]');
      var inp = field.querySelector("input");
      var fb = field.querySelector(".feedback");
      var good = r.status === "ok" || r.status === "spelling";
      inp.readOnly = true;
      field.classList.remove("is-ok", "is-bad");
      field.classList.add(good ? "is-ok" : "is-bad");
      var answer = '<span lang="de">' + formsHtml(v, k) + "</span>";
      if (r.status === "ok") fb.innerHTML = esc(t("correct"));
      else if (r.status === "spelling") fb.innerHTML = esc(t("spelling", { x: "\u0000" })).replace("\u0000", '<span lang="de">' + esc(r.match) + "</span>");
      else if (r.status === "aux") fb.innerHTML = esc(t("auxMissing", { x: "\u0000" })).replace("\u0000", answer);
      else fb.innerHTML = esc(t("wrong", { x: "\u0000" })).replace("\u0000", answer);
    });
    updateButtons();
    $("#progress-bar").style.width = ((session.index + 1) / session.verbs.length * 100) + "%";
    $("#primary").focus({ preventScroll: true });
  }

  function next() {
    if (session.index < session.verbs.length - 1) {
      session.index++;
      session.checked = false;
      session.choice = null;
      renderVerb(false);
      $("#session").scrollIntoView({ block: "start", behavior: "auto" });
    } else {
      showPractice("results");
      renderResults();
    }
  }

  function initSession() {
    $("#answer-form").addEventListener("submit", function (e) {
      e.preventDefault();
      if (session.checked) next(); else if (session.mode !== "choice") check(false);
    });

    // Keys 1–4 pick an option in the first unanswered row.
    document.addEventListener("keydown", function (e) {
      if (!session || session.mode !== "choice" || session.checked || $("#session").hidden) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var n = parseInt(e.key, 10);
      if (!(n >= 1 && n <= OPTION_COUNT)) return;
      var open = session.tenses.filter(function (x) { return session.choice[x].picked === null; });
      if (open.length) { e.preventDefault(); pick(open[0], n - 1); }
    });
    $("#reveal").addEventListener("click", function () { if (!session.checked) check(true); });
    $("#quit").addEventListener("click", function () {
      if (session.results.length) { showPractice("results"); renderResults(); }
      else { session = null; showPractice("setup"); }
    });

    // Umlaut keys: keep focus in the text field so the phone keyboard stays open.
    $$(".keys button").forEach(function (b) {
      b.addEventListener("pointerdown", function (e) { e.preventDefault(); });
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });
      b.addEventListener("click", function () {
        var inp = document.activeElement && document.activeElement.closest && document.activeElement.closest("#fields input")
          ? document.activeElement : lastInput;
        if (!inp || inp.readOnly) return;
        var ch = b.getAttribute("data-key");
        var s = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
        var en = inp.selectionEnd == null ? inp.value.length : inp.selectionEnd;
        inp.setRangeText(ch, s, en, "end");
        inp.focus();
      });
    });
  }

  /* ---------- Practice: pick from options ---------- */

  var OPTION_COUNT = 4;
  var PRESENT_SWAPS = { a: ["ä"], "ä": ["a"], e: ["i", "ie"], i: ["ie", "e"], ie: ["i"], o: ["ö"], "ö": ["o"], au: ["äu"], "äu": ["au"], u: ["ü"], "ü": ["u"], ei: ["ie"] };
  var GENERIC_VOWELS = { p: ["a", "ä", "e", "i", "ie", "o"], t: ["a", "i", "ie", "o", "u", "ei"], pp: ["a", "e", "i", "ie", "o", "u"] };

  function swapVowel(form, tense, vowel) {
    var g = lastVowelGroup(stem(form, tense));
    if (!g) return null;
    return form.slice(0, g.start) + vowel + form.slice(g.start + g.text.length);
  }

  function vowelOf(form, tense) {
    var g = lastVowelGroup(stem(form, tense));
    return g ? g.text.toLowerCase() : "";
  }

  // Plausible wrong forms, in three tiers: typical mistakes first, then near misses, then other vowels.
  function wrongForms(v, tense) {
    var st = v.i.replace(/e?n$/, "");
    var dt = /[dt]$/.test(st);
    var tiers = [[], [], []];
    var aux = v.aux[0];

    if (tense === "p") {
      var reg = st + (dt ? "et" : "t");
      tiers[0].push(reg);
      [reg, v.p[0]].forEach(function (f) {
        (PRESENT_SWAPS[vowelOf(f, "p")] || []).forEach(function (x) { tiers[1].push(swapVowel(f, "p", x)); });
      });
      GENERIC_VOWELS.p.forEach(function (x) { tiers[2].push(swapVowel(v.p[0], "p", x)); });
    } else if (tense === "t") {
      tiers[0].push(st + (dt ? "ete" : "te"));
      if (!/te$/.test(v.t[0])) tiers[1].push(v.t[0] + (/[dt]$/.test(v.t[0]) ? "ete" : "te"));
      GENERIC_VOWELS.t.forEach(function (x) { tiers[2].push(swapVowel(v.t[0], "t", x)); });
    } else {
      var ge = /^ge/.test(v.pp[0]) && (!/^ge/.test(v.i) || /^geg/.test(v.pp[0])) ? "ge" : "";
      if (v.aux.length === 1) tiers[0].push((aux === "hat" ? "ist" : "hat") + " " + v.pp[0]);
      tiers[0].push(aux + " " + ge + st + (dt ? "et" : "t"));
      tiers[1].push(aux + " " + ge + v.i);
      GENERIC_VOWELS.pp.forEach(function (x) {
        var f = swapVowel(v.pp[0], "pp", x);
        if (f) tiers[2].push(aux + " " + f);
      });
    }

    var right = candidates(v, tense).map(fold);
    var seen = {};
    return tiers.map(function (list) {
      return shuffle(list.filter(function (f) {
        if (!f || seen[fold(f)] || right.indexOf(fold(f)) !== -1) return false;
        seen[fold(f)] = true;
        return true;
      }));
    });
  }

  function buildOptions(v, tense) {
    var cands = candidates(v, tense);
    var correct = cands[Math.floor(Math.random() * cands.length)];
    var tiers = wrongForms(v, tense);
    var wrong = tiers[0].slice(0, tense === "pp" ? 2 : 1).concat(tiers[1], tiers[0], tiers[2]);
    var picked = [];
    wrong.forEach(function (f) { if (picked.length < OPTION_COUNT - 1 && picked.indexOf(f) === -1) picked.push(f); });
    // Very rarely too few: borrow forms of other verbs.
    shuffle(VERBS).forEach(function (o) {
      if (picked.length >= OPTION_COUNT - 1 || o === v) return;
      var f = candidates(o, tense)[0];
      if (picked.indexOf(f) === -1 && f !== correct) picked.push(f);
    });
    var options = shuffle(picked.concat(correct));
    return { options: options, correct: options.indexOf(correct), picked: null };
  }

  function renderChoices(keep) {
    var v = current();
    if (!keep || !session.choice) {
      session.choice = {};
      session.tenses.forEach(function (k) { session.choice[k] = buildOptions(v, k); });
    }

    $("#fields").innerHTML = session.tenses.map(function (k) {
      var c = session.choice[k];
      return '<div class="field choice" data-tense="' + k + '">' +
        '<p class="field-label" id="lbl-' + k + '">' + esc(t(TENSE_LABEL[k])) + ' <span class="muted">er/sie/es</span></p>' +
        '<div class="options" role="group" aria-labelledby="lbl-' + k + '">' +
        c.options.map(function (o, i) {
          return '<button type="button" class="opt" lang="de" data-k="' + k + '" data-i="' + i + '">' + esc(o) + "</button>";
        }).join("") +
        '</div><p class="feedback" aria-live="polite"></p></div>';
    }).join("");

    $$("#fields .opt").forEach(function (b) {
      b.addEventListener("click", function () { pick(b.getAttribute("data-k"), +b.getAttribute("data-i")); });
    });

    session.tenses.forEach(function (k) { if (session.choice[k].picked !== null) markChoice(k); });
    if (!keep) session.checked = false;
    updateButtons();
    if (session.checked) return;
    if (!keep) {
      var first = $("#fields .opt");
      if (first) first.focus({ preventScroll: true });
    }
  }

  function markChoice(k) {
    var c = session.choice[k];
    var v = current();
    var field = document.querySelector('.field[data-tense="' + k + '"]');
    var good = c.picked === c.correct;
    field.classList.add(good ? "is-ok" : "is-bad");
    field.querySelectorAll(".opt").forEach(function (b, i) {
      b.disabled = true;
      if (i === c.correct) b.classList.add("is-correct");
      if (i === c.picked && !good) b.classList.add("is-wrong");
    });
    var fb = field.querySelector(".feedback");
    if (good) fb.textContent = t("correct");
    else fb.innerHTML = esc(t("wrong", { x: "\u0000" })).replace("\u0000", '<span lang="de">' + formsHtml(v, k) + "</span>");
  }

  function pick(k, i) {
    var c = session.choice[k];
    if (session.checked || c.picked !== null) return;
    c.picked = i;
    markChoice(k);

    var open = session.tenses.filter(function (x) { return session.choice[x].picked === null; });
    if (open.length) {
      var nextBtn = document.querySelector('.field[data-tense="' + open[0] + '"] .opt');
      if (nextBtn) nextBtn.focus({ preventScroll: true });
      return;
    }

    var result = { verb: current(), fields: {}, ok: true };
    session.tenses.forEach(function (x) {
      var ch = session.choice[x];
      var ok = ch.picked === ch.correct;
      result.fields[x] = { status: ok ? "ok" : "wrong", given: ch.options[ch.picked], match: null };
      if (!ok) result.ok = false;
    });
    session.results.push(result);
    session.checked = true;
    updateButtons();
    $("#progress-bar").style.width = ((session.index + 1) / session.verbs.length * 100) + "%";
    $("#primary").focus({ preventScroll: true });
  }

  /* ---------- Practice: results ---------- */

  function renderResults() {
    var res = session.results;
    var verbsOk = res.filter(function (r) { return r.ok; }).length;
    var answers = 0, answersOk = 0;
    res.forEach(function (r) {
      Object.keys(r.fields).forEach(function (k) {
        answers++;
        var s = r.fields[k].status;
        if (s === "ok" || s === "spelling") answersOk++;
      });
    });

    $("#score").textContent = t("resultsSummary", { c: verbsOk, n: res.length });
    $("#score-detail").textContent = t("answersSummary", { c: answersOk, n: answers });

    var wrong = res.filter(function (r) { return !r.ok; });
    $("#retry").hidden = !wrong.length;

    if (!wrong.length) {
      $("#mistakes").innerHTML = '<p class="perfect">' + esc(t("perfect")) + "</p>";
      return;
    }

    $("#mistakes").innerHTML = "<h2>" + esc(t("mistakesTitle")) + "</h2><ul class=\"mistakes\">" +
      wrong.map(function (r) {
        var v = r.verb;
        return '<li><p class="m-head"><span class="m-inf" lang="de">' + esc(v.i) + '</span> <span class="muted">' + esc(meaning(v)) + "</span></p><dl>" +
          Object.keys(r.fields).map(function (k) {
            var f = r.fields[k];
            var bad = f.status !== "ok" && f.status !== "spelling";
            return '<div class="' + (bad ? "bad" : "") + '"><dt>' + esc(t(TENSE_LABEL[k])) + '</dt><dd><span lang="de">' + formsHtml(v, k) + "</span>" +
              (bad ? ' <span class="given">' + esc(t("yourAnswer")) + ": <s lang=\"de\">" + esc(f.given || t("empty")) + "</s></span>" : "") +
              "</dd></div>";
          }).join("") + "</dl></li>";
      }).join("") + "</ul>";
  }

  function initResults() {
    $("#retry").addEventListener("click", function () {
      var wrong = session.results.filter(function (r) { return !r.ok; }).map(function (r) { return r.verb; });
      startSession(shuffle(wrong), session.tenses, session.mode);
    });
    $("#new-practice").addEventListener("click", function () {
      session = null;
      showPractice("setup");
      $("#setup button[type=submit]").focus({ preventScroll: true });
    });
  }

  /* ---------- Views & routing ---------- */

  function showPractice(part) {
    $("#setup").hidden = part !== "setup";
    $("#session").hidden = part !== "session";
    $("#results").hidden = part !== "results";
    window.scrollTo(0, 0);
  }

  function route() {
    var view = location.hash === "#practice" ? "practice" : "overview";
    $("#view-overview").hidden = view !== "overview";
    $("#view-practice").hidden = view !== "practice";
    $$(".tabs a").forEach(function (a) {
      if (a.getAttribute("data-nav") === view) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
  }

  /* ---------- Init ---------- */

  $$(".lang button").forEach(function (b) {
    b.addEventListener("click", function () {
      settings.lang = b.getAttribute("data-lang");
      saveSettings();
      applyLanguage();
    });
  });
  $("#search").addEventListener("input", renderOverview);
  window.addEventListener("hashchange", route);

  initSetup();
  initSession();
  initResults();
  applyLanguage();
  route();
})();
