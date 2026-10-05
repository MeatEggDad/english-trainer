// 英文聽說訓練：畫面與儲存。比對邏輯在 core.js，句庫在 sentences.js。
(function () {
  "use strict";
  var C = window.TrainerCore, S = window.SENTENCES;
  var KEY = "engTrainer.v1";
  var $ = function (id) { return document.getElementById(id); };
  var byId = {};
  S.forEach(function (s) { byId[s.id] = s; });

  // ---------------------------------------------------------------- 儲存
  function blank() {
    return {schema: 1, profile: {id: C.uid(), name: "自我訓練（家長）", kind: "self"}, records: [],
      settings: {rate: 0.9, voiceURI: "", set: "all", maxLevel: 3, ts: new Date().toISOString()}};
  }
  var storageOk = true;
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw), b = blank();
        d.settings = Object.assign(b.settings, d.settings || {});
        d.profile = d.profile || b.profile;
        d.records = d.records || [];
        return d;
      }
    } catch (e) { storageOk = false; }
    return blank();
  }
  var DB = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(DB)); storageOk = true; }
    catch (e) { storageOk = false; }
    showEnvWarn();
  }
  function setSetting(k, v) { DB.settings[k] = v; DB.settings.ts = new Date().toISOString(); save(); }

  // ---------------------------------------------------------------- 語音
  var synth = window.speechSynthesis;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var voices = [];

  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices().filter(function (v) { return /^en[-_]/i.test(v.lang); });
    var sel = $("voice");
    sel.innerHTML = "";
    voices.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v.voiceURI; o.textContent = v.name + "（" + v.lang + "）";
      sel.appendChild(o);
    });
    var pick = voices.filter(function (v) { return v.voiceURI === DB.settings.voiceURI; })[0] ||
      voices.filter(function (v) { return /en-US/i.test(v.lang) && /Google|Natural|Online/i.test(v.name); })[0] ||
      voices.filter(function (v) { return /en-US/i.test(v.lang); })[0] || voices[0];
    if (pick) sel.value = pick.voiceURI;
    $("voiceNote").textContent = voices.length ? "找到 " + voices.length + " 個英文聲音。名稱有 Google、Natural 或 Online 的通常比較自然。"
      : "找不到英文聲音。Windows：設定 → 時間與語言 → 語音 → 新增英文語音；Android：設定 → 系統 → 語言 → 文字轉語音。";
    showEnvWarn();
  }
  function currentVoice() {
    var uri = $("voice").value;
    return voices.filter(function (v) { return v.voiceURI === uri; })[0] || null;
  }
  function speak(text, rate) {
    if (!synth) return;
    synth.cancel();
    var u = new SpeechSynthesisUtterance(text);
    var v = currentVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
    u.rate = rate;
    synth.speak(u);
  }

  function showEnvWarn() {
    var msg = [];
    if (!synth) msg.push("這個瀏覽器不支援朗讀，請改用 Chrome。");
    else if (!voices.length) msg.push("還沒找到英文朗讀聲音（剛打開時可能要等一兩秒）。");
    if (mode === "shadow" && !SR) msg.push("這個瀏覽器不支援語音辨識，跟讀功能請改用 Chrome。");
    if (mode === "shadow" && SR && !window.isSecureContext) msg.push("語音辨識需要用 https:// 網址或本機伺服器開啟，直接雙擊檔案打開時麥克風可能無法使用。");
    if (!storageOk) msg.push("這個瀏覽器目前無法儲存紀錄（可能是無痕模式），練習結果不會保留。");
    $("envWarn").textContent = msg.join(" ");
    $("envWarn").classList.toggle("hidden", !msg.length);
  }

  // ---------------------------------------------------------------- 狀態
  var mode = "dictation";       // dictation | shadow | progress | settings
  var practiceMode = "dictation";
  var cur = null, replays = 0, answered = false, pinned = null;

  function filterFn() {
    var set = DB.settings.set, lv = +DB.settings.maxLevel;
    return function (s) { return (set === "all" || s.set === set) && s.level <= lv; };
  }
  function pickNext(keepOrder) {
    if (pinned) { cur = byId[pinned]; pinned = null; }
    else {
      var q = C.nextQueue(S, DB.records, practiceMode, filterFn());
      cur = (keepOrder === true ? q : q.filter(function (s) { return !cur || s.id !== cur.id; }))[0] || q[0] || null;
    }
    replays = 0; answered = false;
    renderPractice();
  }

  function renderQueueInfo() {
    var st = C.sentenceStats(DB.records, practiceMode), f = filterFn();
    var pool = S.filter(f);
    var weak = pool.filter(function (s) { return C.isWeak(st[s.id]); }).length;
    var fresh = pool.filter(function (s) { return !st[s.id]; }).length;
    $("queueInfo").textContent = "範圍內 " + pool.length + " 句：弱點 " + weak + "、還沒練 " + fresh;
  }

  function renderPractice() {
    renderQueueInfo();
    $("result").classList.add("hidden");
    $("answer").value = "";
    $("live").textContent = "";
    $("recDiag").textContent = "";
    $("shadowText").classList.add("hidden");
    $("btnShow").textContent = "顯示原句";
    if (!cur) { $("qBadge").textContent = "這個範圍沒有句子"; return; }
    $("qBadge").textContent = (cur.set === "life" ? "生活" : "職場會議") + " · 第 " + cur.level + " 級 · " + cur.id;
    var s = C.sentenceStats(DB.records, practiceMode)[cur.id];
    $("qWeak").textContent = !s ? "新句子" : C.isWeak(s) ? "弱點句（練過 " + s.n + " 次）" : "已練過 " + s.n + " 次";
    $("qReplays").textContent = "";
    $("shadowText").textContent = cur.en;
  }

  function play(slow) {
    if (!cur) return;
    var r = +DB.settings.rate;
    if (slow) r = Math.max(0.5, r * 0.7);
    speak(cur.en, r);
    if (!answered) {
      replays++;
      $("qReplays").textContent = "已播放 " + replays + " 次";
    }
  }

  // ---------------------------------------------------------------- 比對與結果
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"}[c]; }); }

  // 用原句的字（不是展開後的字）顯示對照；同一個原字被拆成兩個（例如 I'll）時，只要有一部分錯就整個標紅
  function diffHtml(res) {
    var out = [], lastI = -1, groupBad = false, groupWord = "", groupGot = [];
    function flush() {
      if (lastI < 0) return;
      out.push(groupBad
        ? "<span class='w " + (groupGot.length ? "sub" : "miss") + "'>" + esc(groupWord) +
          (groupGot.length ? " <small>(" + esc(groupGot.join(" ")) + ")</small>" : "") + "</span>"
        : "<span class='w ok'>" + esc(groupWord) + "</span>");
    }
    res.ops.forEach(function (op) {
      if (op.op === "extra") {
        flush(); lastI = -1; groupBad = false; groupGot = [];
        out.push("<span class='w extra'>" + esc(op.g.w) + "</span>");
        return;
      }
      if (op.e.i !== lastI) { flush(); lastI = op.e.i; groupBad = false; groupWord = op.e.w; groupGot = []; }
      if (op.op !== "ok") groupBad = true;
      if (op.g && groupGot.indexOf(op.g.w) < 0) groupGot.push(op.g.w);
    });
    flush();
    return out.join(" ");
  }

  function showResult(input) {
    var res = C.compare(cur.en, input);
    answered = true;
    var rec = {id: C.uid(), ts: new Date().toISOString(), dev: navigator.userAgent.slice(0, 60), mode: practiceMode,
      sid: cur.id, input: input, acc: Math.round(res.acc * 1000) / 1000, rate: +DB.settings.rate, replays: replays,
      errors: res.errors};
    DB.records.push(rec);
    save();
    var pct = Math.round(res.acc * 100);
    var sc = $("score");
    sc.textContent = res.errors.length ? pct + "%" : "全對！";
    sc.className = "score " + (pct >= 90 ? "good" : pct >= 60 ? "mid" : "low");
    $("diff").innerHTML = diffHtml(res);
    $("resEn").textContent = cur.en;
    $("resZh").textContent = cur.zh;
    var seen = {}, tips = [];
    res.errors.forEach(function (e) { e.tags.forEach(function (t) { seen[t] = (seen[t] || 0) + 1; }); });
    Object.keys(seen).forEach(function (t) {
      var info = C.TAG_INFO[t];
      tips.push("<div class='tip'><b>" + info.name + "（" + seen[t] + "）</b>：" + esc(info.tip) + "</div>");
    });
    $("tips").innerHTML = tips.join("");
    $("result").classList.remove("hidden");
    $("shadowText").classList.remove("hidden");
    renderQueueInfo();
    $("result").scrollIntoView({behavior: "smooth", block: "nearest"});
  }

  // ---------------------------------------------------------------- 跟讀（語音辨識）
  // 每一步都把狀態顯示在畫面上（手機上看不到主控台，出問題時要靠這些字判斷卡在哪一步）
  var rec = null, recText = "", recInterim = "", recErr = "", recSteps = [];
  function recStep(s) { recSteps.push(s); $("recDiag").textContent = "過程：" + recSteps.join(" → "); }
  function startRec() {
    if (!SR) { showEnvWarn(); return; }
    if (rec) { rec.stop(); return; }
    synth && synth.cancel();
    rec = new SR();
    rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    recText = ""; recInterim = ""; recErr = ""; recSteps = [];
    $("btnRec").textContent = "■ 說完了"; $("btnRec").className = "b rec";
    $("live").textContent = "準備麥克風……";
    recStep("啟動");
    rec.onstart = function () { recStep("麥克風已開啟"); $("live").textContent = "請說……"; };
    rec.onaudiostart = function () { recStep("收音中"); };
    rec.onspeechstart = function () { recStep("聽到說話聲"); $("live").textContent = "聽到了，繼續說……"; };
    rec.onresult = function (ev) {
      var fin = "", interim = "";
      for (var k = 0; k < ev.results.length; k++) {
        if (ev.results[k].isFinal) fin += ev.results[k][0].transcript;
        else interim += ev.results[k][0].transcript;
      }
      recText = fin || recText;
      if (interim) recInterim = interim;
      if (recSteps[recSteps.length - 1] !== "有辨識結果") recStep("有辨識結果");
      $("live").textContent = (fin + " " + interim).trim();
    };
    rec.onerror = function (ev) {
      recErr = ev.error;
      recStep("錯誤：" + ev.error);
      var m = {"not-allowed": "麥克風沒有被允許使用。請按網址列左邊的圖示 → 權限 → 麥克風 → 允許，再重新整理網頁。",
        "service-not-allowed": "這支手機的語音辨識服務沒有開啟。請確認已安裝並啟用「Google」App 或「Google 語音服務」（Speech Services by Google）。",
        "language-not-supported": "語音辨識不支援英文（美國）。請在「Google 語音服務」的設定裡下載英文。",
        "no-speech": "沒有聽到聲音。請靠近麥克風、說大聲一點，再試一次。", "network": "語音辨識需要網路連線。",
        "audio-capture": "找不到麥克風，或麥克風正被其他 App 使用。", "aborted": "辨識被中斷了，請再按一次。"}[ev.error] ||
        ("語音辨識發生錯誤：" + ev.error);
      $("live").textContent = m;
    };
    rec.onend = function () {
      rec = null;
      recStep("結束");
      $("btnRec").textContent = "● 開始跟讀"; $("btnRec").className = "b pri";
      // 有些 Android 手機只給「暫定結果」、不給「最終結果」，這時就用最後一次的暫定結果
      var said = (recText || recInterim).trim();
      if (said) showResult(said);
      else if (!recErr) $("live").textContent = "沒有辨識到任何字。請按「開始跟讀」後，等畫面出現「請說……」再開口。";
    };
    try { rec.start(); } catch (e) { rec = null; recStep("無法啟動"); $("live").textContent = "無法啟動語音辨識：" + e.message; }
  }

  // ---------------------------------------------------------------- 進度頁
  function pctBar(f) { return "<div class='bar'><i style='width:" + Math.round(f * 100) + "%'></i></div>"; }
  function renderProgress() {
    var R = DB.records, h = [];
    var today = new Date().toISOString().slice(0, 10);
    function last(modeName, n) { return R.filter(function (r) { return r.mode === modeName; }).slice(-n); }
    function avg(a) { return a.length ? a.reduce(function (x, r) { return x + r.acc; }, 0) / a.length : 0; }
    var d50 = last("dictation", 50), s50 = last("shadow", 50);
    var todayN = R.filter(function (r) { return r.ts.slice(0, 10) === today; }).length;
    var days = {};
    R.forEach(function (r) { days[r.ts.slice(0, 10)] = 1; });
    h.push("<div class='card'><div class='stats'>" +
      "<div class='stat'><div class='v'>" + todayN + "</div><div class='k'>今天練習句數</div></div>" +
      "<div class='stat'><div class='v'>" + Object.keys(days).length + "</div><div class='k'>練習天數</div></div>" +
      "<div class='stat'><div class='v'>" + (d50.length ? Math.round(avg(d50) * 100) + "%" : "—") + "</div><div class='k'>聽寫正確率（最近 " + d50.length + " 句）</div></div>" +
      "<div class='stat'><div class='v'>" + (s50.length ? Math.round(avg(s50) * 100) + "%" : "—") + "</div><div class='k'>跟讀正確率（最近 " + s50.length + " 句）</div></div>" +
      "</div></div>");

    ["dictation", "shadow"].forEach(function (m) {
      var name = m === "dictation" ? "聽寫" : "跟讀";
      var ps = C.patternStats(R.filter(function (r) { return r.mode === m; }), 200);
      h.push("<div class='card'><h3 style='margin-top:0'>" + name + "：常錯的聲音類型（最近 200 句）</h3>");
      if (!ps.length) h.push("<p class='meta'>還沒有錯誤紀錄。</p>");
      else {
        var max = ps[0].n;
        h.push("<table><tr><th>類型</th><th>次數</th><th>常見例子</th></tr>");
        ps.forEach(function (p) {
          h.push("<tr><td><b>" + C.TAG_INFO[p.tag].name + "</b></td><td>" + p.n + pctBar(p.n / max) + "</td><td class='ex'>" +
            p.examples.map(function (e) { return esc(e.text) + (e.n > 1 ? "（" + e.n + "）" : ""); }).join("、") + "</td></tr>");
        });
        h.push("</table>");
        var top = C.TAG_INFO[ps[0].tag];
        h.push("<div class='tip'><b>目前最常錯：" + top.name + "</b>　" + esc(top.tip) + "</div>");
      }
      var st = C.sentenceStats(R, m);
      var weak = S.filter(function (s) { return C.isWeak(st[s.id]); })
        .sort(function (a, b) { return st[b.id].errN / st[b.id].n - st[a.id].errN / st[a.id].n; });
      var done = S.filter(function (s) { return st[s.id] && !C.isWeak(st[s.id]); }).length;
      h.push("<p class='meta'>已過關（全對，或錯過後連續兩次全對）" + done + " 句、弱點 " + weak.length + " 句、還沒練 " +
        S.filter(function (s) { return !st[s.id]; }).length + " 句。</p>");
      if (weak.length) {
        h.push("<table><tr><th>弱點句</th><th>練過</th><th>平均錯字</th><th></th></tr>");
        weak.slice(0, 15).forEach(function (s) {
          var x = st[s.id];
          h.push("<tr><td>" + esc(s.en) + "<div class='ex'>" + esc(s.zh) + "</div></td><td>" + x.n + "</td><td>" +
            (x.errN / x.n).toFixed(1) + "</td><td><button class='b' data-drill='" + m + ":" + s.id + "'>練這句</button></td></tr>");
        });
        h.push("</table>");
      }
      h.push("</div>");
    });
    $("progress").innerHTML = h.join("");
  }

  // ---------------------------------------------------------------- 分頁切換
  function setTab(t) {
    mode = t;
    document.querySelectorAll("nav button").forEach(function (b) { b.classList.toggle("on", b.dataset.tab === t); });
    $("practice").classList.toggle("hidden", t !== "dictation" && t !== "shadow");
    $("progress").classList.toggle("hidden", t !== "progress");
    $("settings").classList.toggle("hidden", t !== "settings");
    if (t === "dictation" || t === "shadow") {
      if (rec) rec.abort();
      var changed = practiceMode !== t;
      practiceMode = t;
      $("dictBox").classList.toggle("hidden", t !== "dictation");
      $("shadowBox").classList.toggle("hidden", t !== "shadow");
      if (changed || !cur || answered) pickNext(); else renderPractice();
    }
    if (t === "progress") renderProgress();
    showEnvWarn();
  }

  // ---------------------------------------------------------------- 備份
  function exportData() {
    var blob = new Blob([JSON.stringify(DB, null, 1)], {type: "application/json"});
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "english-trainer-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    $("ioMsg").textContent = "已匯出 " + DB.records.length + " 筆紀錄。";
  }
  function importData(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var other = JSON.parse(fr.result);
        if (!other || !Array.isArray(other.records)) throw new Error("格式不對");
        var before = DB.records.length;
        DB = C.merge(DB, other);
        save();
        $("ioMsg").textContent = "合併完成：新增 " + (DB.records.length - before) + " 筆，目前共 " + DB.records.length + " 筆。";
        initSettingsUI();
      } catch (e) { $("ioMsg").textContent = "無法匯入：" + e.message; }
    };
    fr.readAsText(file);
  }

  // ---------------------------------------------------------------- 綁定
  function initSettingsUI() {
    $("fSet").value = DB.settings.set;
    $("fLevel").value = String(DB.settings.maxLevel);
    $("rate").value = DB.settings.rate;
    $("rateV").textContent = (+DB.settings.rate).toFixed(2) + "×";
    $("pname").value = DB.profile.name;
    $("who").textContent = DB.profile.name;
  }

  document.querySelectorAll("nav button").forEach(function (b) {
    b.addEventListener("click", function () { setTab(b.dataset.tab); });
  });
  $("fSet").addEventListener("change", function () { setSetting("set", this.value); pickNext(true); });
  $("fLevel").addEventListener("change", function () { setSetting("maxLevel", +this.value); pickNext(true); });
  $("rate").addEventListener("input", function () { $("rateV").textContent = (+this.value).toFixed(2) + "×"; });
  $("rate").addEventListener("change", function () { setSetting("rate", +this.value); });
  $("btnPlay").addEventListener("click", function () { play(false); });
  $("btnSlow").addEventListener("click", function () { play(true); });
  $("btnCheck").addEventListener("click", function () {
    if (!cur || answered) return;
    showResult($("answer").value);
  });
  $("answer").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("btnCheck").click(); }
  });
  $("btnSkip").addEventListener("click", pickNext);
  $("btnSkip2").addEventListener("click", pickNext);
  $("btnNext").addEventListener("click", function () {
    pickNext();
    if (practiceMode === "dictation") $("answer").focus();
    setTimeout(function () { play(false); }, 150);
  });
  $("btnReplayOrig").addEventListener("click", function () { play(false); });
  $("btnShow").addEventListener("click", function () {
    var hid = $("shadowText").classList.toggle("hidden");
    this.textContent = hid ? "顯示原句" : "隱藏原句";
  });
  $("btnRec").addEventListener("click", function () { if (!rec) answered = false; startRec(); });
  $("progress").addEventListener("click", function (e) {
    var t = e.target.closest("[data-drill]");
    if (!t) return;
    var p = t.dataset.drill.split(":");
    pinned = p[1];
    practiceMode = "";       // 讓 setTab 重新挑題（會挑到 pinned 這句）
    setTab(p[0]);
  });
  $("voice").addEventListener("change", function () { setSetting("voiceURI", this.value); });
  $("btnTestVoice").addEventListener("click", function () { speak("Hi, this is how I sound. Is this speed okay for you?", +DB.settings.rate); });
  $("btnSaveName").addEventListener("click", function () {
    DB.profile.name = $("pname").value.trim() || "自我訓練（家長）"; save(); initSettingsUI();
  });
  $("btnExport").addEventListener("click", exportData);
  $("fileImport").addEventListener("change", function () { if (this.files[0]) importData(this.files[0]); this.value = ""; });
  $("btnClear").addEventListener("click", function () { $("btnClearYes").classList.toggle("hidden"); });
  $("btnClearYes").addEventListener("click", function () {
    var keep = DB.profile; DB = blank(); DB.profile = keep; save();
    this.classList.add("hidden"); initSettingsUI(); $("ioMsg").textContent = "紀錄已清除。";
  });

  if (synth) {
    loadVoices();
    if ("onvoiceschanged" in synth) synth.onvoiceschanged = loadVoices;
    setTimeout(loadVoices, 800);
  }
  initSettingsUI();
  setTab("dictation");

  // 給測試用
  window.__trainer = {db: function () { return DB; }, cur: function () { return cur; }, showResult: showResult};
})();
