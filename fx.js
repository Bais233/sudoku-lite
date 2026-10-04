/*
 * fx.js — 特效与音效：Web Audio 合成音效 + DOM 动画（飘分/弹跳/扫光/彩带/升级金光）
 */
(function (global) {
  'use strict';

  var ctx = null;
  var soundOn = true;

  function setSound(on) { soundOn = on; }

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    } catch (e) { ctx = null; }
    return ctx;
  }

  // 用户首次交互后解锁音频
  function unlock() {
    var c = ensureCtx();
    if (c && c.state === 'suspended') c.resume();
  }

  function tone(freq, dur, type, gain, delay, slideTo) {
    if (!soundOn) return;
    var c = ensureCtx();
    if (!c) return;
    try {
      var t0 = c.currentTime + (delay || 0);
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.15, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (e) { /* 音频不可用时静默 */ }
  }

  var sfx = {
    click: function () { tone(660, 0.06, 'triangle', 0.08); },
    place: function (combo) {
      var semi = Math.min(Math.max(combo || 0, 0), 16);
      var freq = 523.25 * Math.pow(2, semi / 12);
      tone(freq, 0.12, 'sine', 0.16);
      tone(freq * 2, 0.08, 'sine', 0.05, 0.02);
    },
    note: function () { tone(440, 0.05, 'triangle', 0.06); },
    error: function () { tone(150, 0.2, 'sawtooth', 0.14, 0, 110); },
    erase: function () { tone(330, 0.07, 'triangle', 0.08, 0, 220); },
    line: function () {
      tone(659.25, 0.1, 'sine', 0.14);
      tone(830.61, 0.1, 'sine', 0.14, 0.07);
      tone(987.77, 0.14, 'sine', 0.14, 0.14);
    },
    win: function () {
      var seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
      for (var i = 0; i < seq.length; i++) tone(seq[i], 0.16, 'triangle', 0.15, i * 0.12);
    },
    levelup: function () {
      var seq = [783.99, 987.77, 1174.66, 1567.98];
      for (var i = 0; i < seq.length; i++) tone(seq[i], 0.2, 'sine', 0.16, i * 0.09);
    },
    buy: function () { tone(587.33, 0.09, 'triangle', 0.13); tone(880, 0.12, 'triangle', 0.13, 0.08); },
    achievement: function () {
      var seq = [987.77, 1174.66, 1567.98, 2093];
      for (var i = 0; i < seq.length; i++) tone(seq[i], 0.12, 'sine', 0.12, i * 0.06);
    },
    denied: function () { tone(220, 0.12, 'square', 0.08, 0, 180); }
  };

  function el(id) { return document.getElementById(id); }

  function layer() { return el('fx-layer'); }

  // 在指定元素上方飘出分数文字
  function floatScore(target, text, cls) {
    if (!target || !layer()) return;
    var rect = target.getBoundingClientRect();
    var span = document.createElement('span');
    span.className = 'float-score ' + (cls || '');
    span.textContent = text;
    span.style.left = (rect.left + rect.width / 2) + 'px';
    span.style.top = rect.top + 'px';
    layer().appendChild(span);
    setTimeout(function () { span.parentNode && span.parentNode.removeChild(span); }, 1000);
  }

  function popCell(cellEl) {
    if (!cellEl) return;
    cellEl.classList.remove('pop');
    void cellEl.offsetWidth; // 重启动画
    cellEl.classList.add('pop');
  }

  // 行列宫完成扫光：对一组格子加 class 后移除
  function sweep(cells) {
    if (!cells) return;
    for (var i = 0; i < cells.length; i++) cells[i].classList.add('sweep');
    setTimeout(function () {
      for (var j = 0; j < cells.length; j++) cells[j].classList.remove('sweep');
    }, 700);
  }

  function shake(elm) {
    if (!elm) return;
    elm.classList.remove('shake');
    void elm.offsetWidth;
    elm.classList.add('shake');
  }

  // 升级金光全屏
  function levelUpFx() {
    var d = document.createElement('div');
    d.className = 'levelup-flash';
    document.body.appendChild(d);
    setTimeout(function () { d.parentNode && d.parentNode.removeChild(d); }, 1600);
  }

  // 彩带：canvas 粒子
  function confetti() {
    var cv = el('confetti');
    if (!cv) return;
    var c2 = cv.getContext('2d');
    if (!c2) return;
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    var colors = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#facc15'];
    var parts = [];
    for (var i = 0; i < 160; i++) {
      parts.push({
        x: Math.random() * cv.width,
        y: -20 - Math.random() * cv.height * 0.4,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        vx: -1.5 + Math.random() * 3,
        vy: 2 + Math.random() * 3.5,
        rot: Math.random() * Math.PI,
        vr: -0.12 + Math.random() * 0.24,
        color: colors[(Math.random() * colors.length) | 0]
      });
    }
    var start = Date.now();
    (function tick() {
      c2.clearRect(0, 0, cv.width, cv.height);
      var alive = false;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.02;
        if (p.y < cv.height + 30) alive = true;
        c2.save();
        c2.translate(p.x, p.y);
        c2.rotate(p.rot);
        c2.fillStyle = p.color;
        c2.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c2.restore();
      }
      if (alive && Date.now() - start < 4500) requestAnimationFrame(tick);
      else c2.clearRect(0, 0, cv.width, cv.height);
    })();
  }

  // 棋盘轻微震动（高连击时）
  function boardPulse() {
    var b = el('board');
    if (!b) return;
    b.classList.remove('board-pulse');
    void b.offsetWidth;
    b.classList.add('board-pulse');
  }

  global.FX = {
    setSound: setSound,
    unlock: unlock,
    sfx: sfx,
    floatScore: floatScore,
    popCell: popCell,
    sweep: sweep,
    shake: shake,
    levelUpFx: levelUpFx,
    confetti: confetti,
    boardPulse: boardPulse
  };
})(typeof self !== 'undefined' ? self : this);
