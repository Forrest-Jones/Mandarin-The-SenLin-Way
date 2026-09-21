/* Mandarin The SenLin Way — lazy level loader
   HSK 1 (≈45 KB) always loads with the page. HSK 2–6 (≈850 KB, 300 KB gzipped) are loaded *before*
   the app only as far as this learner needs them today (day, placement, or a deep link past the
   loaded levels); the rest streams in after first paint. The schedule for the days already loaded is
   identical either way, so nothing the learner sees changes when the remaining levels arrive. */
(function () {
  'use strict';
  /* characters per level, so day boundaries can be computed before the data files load
     (tools/validate.js checks these against the data) */
  var REST = [[2, 173, 'js/data/hsk2.js'], [3, 273, 'js/data/hsk3.js'], [4, 452, 'js/data/hsk4.js'], [5, 629, 'js/data/hsk5.js'], [6, 969, 'js/data/hsk6.js']];
  var settings = {}; try { settings = JSON.parse(localStorage.getItem('senlin.settings') || '{}') || {}; } catch (e) { /* private mode */ }
  var pace = settings.charsPerDay || 3;
  var start = settings.startDate || '2026-09-21';
  var parts = start.split('-').map(Number);
  var startUTC = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  var now = new Date(); var todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  var day = Math.floor((todayUTC - startUTC) / 86400000) + 1;
  var m = /^#\/(lesson|plan)\/(\d+)/.exec(location.hash);
  var wanted = Math.max(day, m ? +m[2] : 0) + 3;                       /* a few days of look-ahead */
  var all = (settings.placement || 0) >= 1 || /^#\/(library|levels|progress|plan)/.test(location.hash);
  var end = 12; (window.SENLIN_LEVELS || []).forEach(function (l) { end += Math.ceil(l.characters.length / pace); });
  var loadedLevels = (window.SENLIN_LEVELS || []).map(function (l) { return l.level; });
  var now_ = [], later = [];
  REST.forEach(function (r) {
    if (loadedLevels.indexOf(r[0]) >= 0) return;
    var need = all || wanted > end; end += Math.ceil(r[1] / pace);
    (need ? now_ : later).push(r[2]);
  });
  window.SENLIN_LAZY = { pending: later.length > 0, files: later, end3: end };
  if (now_.length) {
    /* parser-blocking on purpose: the app must not boot without today's level */
    now_.forEach(function (f) { document.write('<script src="' + f + '"><\/script>'); });
  }
  /* end3 = last scheduled day the loaded levels cover (kept under its old name for app.js) */
  window.SENLIN_LAZY.end3 = (function () { var e = 12; var lv = loadedLevels.concat(now_.map(function (f) { return +f.replace(/\D/g, ''); })); REST.forEach(function (r) { if (lv.indexOf(r[0]) >= 0) e += Math.ceil(r[1] / pace); }); return e + Math.ceil(180 / pace); })();
  /** Load the remaining levels in the background; resolves with the level numbers present. */
  window.SENLIN_LAZY.load = function () {
    if (window.SENLIN_LAZY.promise) return window.SENLIN_LAZY.promise;
    if (!window.SENLIN_LAZY.pending) return (window.SENLIN_LAZY.promise = Promise.resolve((window.SENLIN_LEVELS || []).map(function (l) { return l.level; })));
    var before = (window.SENLIN_LEVELS || []).length;
    var chain = Promise.resolve();
    later.forEach(function (f) {
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
