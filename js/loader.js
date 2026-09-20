/* Mandarin The SenLin Way — lazy level loader
   HSK 1–3 (≈160 KB) always load with the page. HSK 4–6 (≈700 KB, 250 KB gzipped) are loaded
   *before* the app only when this learner needs them today (day, placement, or a deep link past
   HSK 3); otherwise they stream in after first paint. The schedule for days inside HSK 1–3 is
   identical either way, so nothing the learner sees changes when the rest arrives. */
(function () {
  'use strict';
  var REST = ['js/data/hsk4.js', 'js/data/hsk5.js', 'js/data/hsk6.js'];
  var loaded = (window.SENLIN_LEVELS || []).map(function (l) { return l.level; });
  var settings = {}; try { settings = JSON.parse(localStorage.getItem('senlin.settings') || '{}') || {}; } catch (e) { /* private mode */ }
  var pace = settings.charsPerDay || 3;
  var start = settings.startDate || '2026-09-21';
  var parts = start.split('-').map(Number);
  var startUTC = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  var now = new Date(); var todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  var day = Math.floor((todayUTC - startUTC) / 86400000) + 1;
  var end3 = 12; (window.SENLIN_LEVELS || []).forEach(function (l) { end3 += Math.ceil(l.characters.length / pace); });
  var m = /^#\/(lesson|plan)\/(\d+)/.exec(location.hash);
  var wanted = m ? +m[2] : 0;
  var needNow = loaded.indexOf(4) < 0 && (day > end3 - 3 || wanted > end3 - 3 || (settings.placement || 0) >= 3 || /^#\/(library|levels|progress)/.test(location.hash));
  window.SENLIN_LAZY = { pending: loaded.indexOf(4) < 0 && !needNow, files: REST, end3: end3 };
  if (needNow) {
    /* parser-blocking on purpose: the app must not boot without today's level */
    REST.forEach(function (f) { document.write('<script src="' + f + '"><\/script>'); });
    window.SENLIN_LAZY.pending = false;
  }
  /** Load the remaining levels in the background; resolves with the level numbers present. */
  window.SENLIN_LAZY.load = function () {
    if (window.SENLIN_LAZY.promise) return window.SENLIN_LAZY.promise;
    if (!window.SENLIN_LAZY.pending) return (window.SENLIN_LAZY.promise = Promise.resolve((window.SENLIN_LEVELS || []).map(function (l) { return l.level; })));
    var before = (window.SENLIN_LEVELS || []).length;
    var chain = Promise.resolve();
    REST.forEach(function (f) {
      chain = chain.then(function () {
        return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = f; s.onload = res; s.onerror = function () { rej(new Error('failed ' + f)); }; document.head.appendChild(s); });
      });
    });
    window.SENLIN_LAZY.promise = chain.then(function () {
      var fresh = (window.SENLIN_LEVELS || []).slice(before);
      window.SENLIN_LAZY.pending = false;
      return window.SenLin && window.SenLin.addLevels ? window.SenLin.addLevels(fresh) : fresh.map(function (l) { return l.level; });
    });
    return window.SENLIN_LAZY.promise;
  };
})();
