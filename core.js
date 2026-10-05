// 英文聽說自我訓練：比對與分析邏輯（不碰畫面、不碰儲存，方便用 node 測試）。
// 做法：把原句和你打的字（或語音辨識出的字）都切成單字、展開縮寫，再用編輯距離對齊，
// 找出「漏掉、聽錯、多打」的字，並替每個錯誤標上可能的原因（弱讀、連音、縮寫、字尾、數字）。
(function (root) {
  "use strict";

  var NUM = {zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8",
    nine: "9", ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15",
    sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20", thirty: "30", hundred: "100"};

  // 整個字的縮寫（不規則的先列，其餘用字尾規則）
  var WHOLE = {"can't": ["can", "not"], "cannot": ["can", "not"], "won't": ["will", "not"], "shan't": ["shall", "not"],
    "let's": ["let", "us"], "gonna": ["going", "to"], "wanna": ["want", "to"], "gotta": ["got", "to"],
    "gimme": ["give", "me"], "lemme": ["let", "me"], "kinda": ["kind", "of"], "ok": ["okay"], "o.k.": ["okay"]};
  var SUFFIX = [["n't", "not"], ["'re", "are"], ["'m", "am"], ["'ll", "will"], ["'ve", "have"], ["'d", "'d"], ["'s", "'s"]];
  // 's、'd 有兩種意思，對方打成哪一種都算對
  var ALT = {"'s": ["is", "has", "'s", "us"], "'d": ["would", "had", "'d"]};
  // 「所有格 's」只出現在名詞後；這些字後面的 's 一定是 is/has
  var PRON_S = {he: 1, she: 1, it: 1, that: 1, what: 1, who: 1, there: 1, here: 1, where: 1, how: 1, everyone: 1,
    everything: 1, nothing: 1, something: 1, someone: 1};

  // 口語中通常弱讀（唸得又輕又快）的功能字
  var WEAK = {};
  ("a an the to of for and or but at in on from as than that can could would should will shall have has had " +
   "do does did is are was were be been am not him her them his your you me us we our there some just 's 'd " +
   "with by if so it its into about").split(" ").forEach(function (w) { WEAK[w] = 1; });

  var TAG_INFO = {
    weak: {name: "弱讀", tip: "功能字（to、of、and、can、have…）在句子裡唸得很輕很短，常常只剩一個模糊的「ㄜ」音。練習時注意聽句子的節奏：重音落在實詞上，功能字被壓扁夾在中間。"},
    linking: {name: "連音", tip: "前一個字的子音結尾和下一個字的母音開頭黏在一起（例如 look at → loo-kat、get it → ge-dit），聽起來像一個字。"},
    contraction: {name: "縮寫", tip: "I'll、we're、should've、didn't 這類縮寫唸起來只多一個很短的音，容易整個漏掉或聽成別的字。"},
    ending: {name: "字尾", tip: "字尾的 -s、-ed 在連續說話時很輕，常被下一個字蓋過。可以從前後文（時態、單複數）推回來。"},
    number: {name: "數字", tip: "數字要特別注意 -teen 和 -ty（fifteen／fifty）的重音位置。"},
    content: {name: "實詞", tip: "名詞、動詞、形容詞這類有意思的字沒聽出來，通常是字認得但聲音跟腦中的印象對不上，多聽幾次原音、跟著唸。"},
    extra: {name: "多打的字", tip: "原句沒有這個字。可能是把一個字聽成兩個字，或憑印象自動補上的。"}
  };

  function clean(s) {
    return String(s || "").toLowerCase()
      .replace(/[‘’ʼ`]/g, "'")
      .replace(/(\d),(\d)/g, "$1$2")
      .replace(/%/g, " percent")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9'.\s-]/g, " ")
      .replace(/(^|\s)'+|'+(\s|$)/g, " ")
      .replace(/\.(\s|$)/g, " ")
      .replace(/-/g, " ");
  }

  // 回傳 [{t: 比對用的字, w: 原本的字, i: 原本是第幾個字, c: 是否來自縮寫}]
  function tokens(s) {
    var out = [];
    clean(s).split(/\s+/).filter(Boolean).forEach(function (w, i) {
      var parts = null, c = false;
      if (WHOLE[w]) { parts = WHOLE[w]; c = parts.length > 1; }
      else {
        for (var k = 0; k < SUFFIX.length; k++) {
          var suf = SUFFIX[k][0];
          if (w.length > suf.length && w.slice(-suf.length) === suf) {
            var base = w.slice(0, -suf.length);
            if (suf === "'s" && !PRON_S[base]) break;    // 所有格（today's、Tom's）不拆
            parts = [base, SUFFIX[k][1]]; c = true; break;
          }
        }
      }
      (parts || [w]).forEach(function (p) {
        out.push({t: NUM[p] || p, w: w, i: i, c: c});
      });
    });
    return out;
  }

  function same(a, b) {
    if (a === b) return true;
    if (ALT[a] && ALT[a].indexOf(b) >= 0) return true;
    if (ALT[b] && ALT[b].indexOf(a) >= 0) return true;
    return false;
  }

  // 編輯距離對齊。ops：{op: "ok"|"sub"|"miss"|"extra", e: 原句的字, g: 你的字}
  function align(exp, got) {
    var n = exp.length, m = got.length, i, j;
    var d = [];
    for (i = 0; i <= n; i++) { d.push(new Array(m + 1)); d[i][0] = i; }
    for (j = 0; j <= m; j++) d[0][j] = j;
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) {
        var c = same(exp[i - 1].t, got[j - 1].t) ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j - 1] + c, d[i - 1][j] + 1, d[i][j - 1] + 1);
      }
    }
    var ops = [];
    i = n; j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (same(exp[i - 1].t, got[j - 1].t) ? 0 : 1)) {
        ops.push({op: same(exp[i - 1].t, got[j - 1].t) ? "ok" : "sub", e: exp[i - 1], g: got[j - 1], ei: i - 1});
        i--; j--;
      } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
        ops.push({op: "miss", e: exp[i - 1], g: null, ei: i - 1}); i--;
      } else {
        ops.push({op: "extra", e: null, g: got[j - 1], ei: i}); j--;
      }
    }
    return ops.reverse();
  }

  var VOWEL_START = /^[aeiou]/;
  var CONS_END = /[bcdfgkmnprstvxz]$/;    // 不含 h、w、y（字尾 h/w/y 通常不發子音）

  function stem(w) { return w.replace(/(es|s|ed|d)$/, ""); }

  // 替一個錯誤標上可能的原因（可以有好幾個）
  function tagsFor(op, exp) {
    if (op.op === "extra") return ["extra"];
    var e = op.e, tags = [];
    if (e.c) tags.push("contraction");
    if (op.op === "sub" && op.g && op.g.t !== e.t && (stem(op.g.t) === stem(e.t)) && stem(e.t).length >= 2) tags.push("ending");
    if (/^\d+$/.test(e.t) || NUM[e.t]) tags.push("number");
    var prev = op.ei > 0 ? exp[op.ei - 1] : null;
    if (prev && prev.i !== e.i && CONS_END.test(prev.w.replace(/'.*$/, "")) && VOWEL_START.test(e.w)) tags.push("linking");
    if (WEAK[e.t]) tags.push("weak");
    if (!tags.length) tags.push("content");
    return tags;
  }

  // 主要入口：比對一句。回傳 {ops, errors, acc}
  function compare(expected, typed) {
    var exp = tokens(expected), got = tokens(typed);
    var ops = align(exp, got);
    var errors = [], okN = 0;
    ops.forEach(function (op) {
      if (op.op === "ok") { okN++; return; }
      var tags = tagsFor(op, exp);
      op.tags = tags;
      errors.push({kind: op.op, exp: op.e ? op.e.t : "", expWord: op.e ? op.e.w : "", got: op.g ? op.g.t : "", tags: tags});
    });
    return {ops: ops, errors: errors, acc: exp.length ? okN / exp.length : 0, n: exp.length};
  }

  // ---------- 紀錄與複習排序 ----------
  // 紀錄格式（之後雲端同步會用到，所以每筆都有唯一 id 與時間戳，合併時以 id 聯集，不覆蓋）：
  // {id, ts, dev, mode: "dictation"|"shadow", sid, input, acc, rate, replays, errors: [...]}

  function uid() {
    var r = "";
    for (var k = 0; k < 4; k++) r += Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
    return Date.now().toString(36) + "-" + r;
  }

  // 每一句在某個模式下的狀況
  function sentenceStats(records, mode) {
    var st = {};
    records.filter(function (r) { return !mode || r.mode === mode; })
      .sort(function (a, b) { return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0; })
      .forEach(function (r) {
        var s = st[r.sid] || (st[r.sid] = {n: 0, errN: 0, streak: 0, last: null, lastAcc: 0, lastErr: 0});
        s.n++;
        var perfect = r.errors.length === 0;
        s.errN += r.errors.length;
        s.streak = perfect ? s.streak + 1 : 0;
        s.last = r.ts; s.lastAcc = r.acc; s.lastErr = r.errors.length;
      });
    return st;
  }

  // 「弱點句」：錯過、而且之後還沒連續兩次全對（第一次就全對的不算弱點）
  function isWeak(s) { return !!s && s.errN > 0 && s.streak < 2; }

  // 下一句：先複習弱點句（錯越多越前面、隔越久越前面），再依難度出新句子，最後輪最久沒練的
  function nextQueue(sentences, records, mode, filter) {
    var st = sentenceStats(records, mode);
    var pool = sentences.filter(filter || function () { return true; });
    var weak = pool.filter(function (s) { return isWeak(st[s.id]); })
      .sort(function (a, b) {
        var x = st[a.id], y = st[b.id];
        return (y.errN / y.n) - (x.errN / x.n) || (x.last < y.last ? -1 : 1);
      });
    var fresh = pool.filter(function (s) { return !st[s.id]; })
      .sort(function (a, b) { return a.level - b.level || a.n - b.n; });
    var old = pool.filter(function (s) { return st[s.id] && !isWeak(st[s.id]); })
      .sort(function (a, b) { return st[a.id].last < st[b.id].last ? -1 : 1; });
    // 弱點句和新句子交錯（每 2 句複習夾 1 句新的），避免一直只做錯過的句子而沒有進度
    var out = [], wi = 0, fi = 0;
    while (wi < weak.length || fi < fresh.length) {
      for (var k = 0; k < 2 && wi < weak.length; k++) out.push(weak[wi++]);
      if (fi < fresh.length) out.push(fresh[fi++]);
    }
    return out.concat(old);
  }

  // 錯誤類型統計（最近 limit 筆紀錄）
  function patternStats(records, limit) {
    var recs = records.slice().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; }).slice(0, limit || 200);
    var cnt = {}, ex = {};
    recs.forEach(function (r) {
      r.errors.forEach(function (e) {
        e.tags.forEach(function (t) {
          cnt[t] = (cnt[t] || 0) + 1;
          var key = e.kind === "extra" ? "+" + e.got : (e.expWord || e.exp) + (e.got ? " → " + e.got : " → （漏掉）");
          (ex[t] = ex[t] || {})[key] = (ex[t][key] || 0) + 1;
        });
      });
    });
    return Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).map(function (t) {
      var top = Object.keys(ex[t]).sort(function (a, b) { return ex[t][b] - ex[t][a]; }).slice(0, 5);
      return {tag: t, n: cnt[t], examples: top.map(function (k) { return {text: k, n: ex[t][k]}; })};
    });
  }

  // 合併兩份資料（例如手機和電腦各自的紀錄）：紀錄以 id 聯集，不覆蓋
  function merge(a, b) {
    var seen = {}, recs = [];
    (a.records || []).concat(b.records || []).forEach(function (r) {
      if (!seen[r.id]) { seen[r.id] = 1; recs.push(r); }
    });
    recs.sort(function (x, y) { return x.ts < y.ts ? -1 : x.ts > y.ts ? 1 : 0; });
    var sa = a.settings || {}, sb = b.settings || {};
    return {schema: 1, profile: a.profile || b.profile, records: recs,
      settings: (sb.ts || "") > (sa.ts || "") ? sb : sa};
  }

  var api = {tokens: tokens, align: align, compare: compare, uid: uid, sentenceStats: sentenceStats,
    isWeak: isWeak, nextQueue: nextQueue, patternStats: patternStats, merge: merge, TAG_INFO: TAG_INFO};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TrainerCore = api;
})(this);
