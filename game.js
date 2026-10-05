/*
 * game.js — 对局逻辑与视图调度：五视图切换、输入、计时存档、经济接线
 * 依赖全局 Sudoku / Economy / FX
 */
(function () {
  'use strict';

  var SAVE_KEY = 'sudoku_save';
  var eco = Economy.load();

  var G = null;          // 当前对局
  var timerId = null;
  var toastTimer = null;

  function $(id) { return document.getElementById(id); }

  // ---------- 通用 UI ----------
  function showView(name) {
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) views[i].classList.remove('active');
    $('view-' + name).classList.add('active');
    if (name === 'game') startTimer(); else stopTimer();
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1900);
  }

  function showConfirm(text, onYes) {
    $('confirm-text').textContent = text;
    $('modal-confirm').classList.remove('hidden');
    $('btn-confirm-yes').onclick = function () {
      $('modal-confirm').classList.add('hidden');
      onYes();
    };
    $('btn-confirm-no').onclick = function () {
      $('modal-confirm').classList.add('hidden');
    };
  }

  function showLoading(on) {
    $('loading').classList.toggle('hidden', !on);
  }

  function fmtTime(sec) {
    var m = (sec / 60) | 0, s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  // ---------- 顶栏 ----------
  function updateTopbar() {
    $('coins-label').textContent = eco.coins;
    $('level-label').textContent = 'Lv.' + eco.level;
    $('xp-fill').style.width = Economy.xpProgress(eco).pct + '%';
  }

  function renderThemeSelect() {
    var sel = $('theme-select');
    sel.innerHTML = '';
    var cleared = Economy.levelsClearedCount(eco);
    for (var i = 0; i < Economy.THEMES.length; i++) {
      var th = Economy.THEMES[i];
      var opt = document.createElement('option');
      opt.value = th.id;
      opt.textContent = th.name + (th.unlockAt > cleared ? '（通关' + th.unlockAt + '解锁）' : '');
      opt.disabled = th.unlockAt > cleared;
      sel.appendChild(opt);
    }
    sel.value = eco.theme;
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', eco.theme);
  }

  function updateSoundBtn() {
    $('sound-btn').textContent = eco.sound ? '♪' : '静';
  }

  // ---------- 主菜单 ----------
  function renderMenu() {
    var hasSave = !!localStorage.getItem(SAVE_KEY);
    $('btn-continue').style.display = hasSave ? '' : 'none';
    $('menu-stats').textContent =
      '通关 ' + Economy.levelsClearedCount(eco) + '/' + Sudoku.TOTAL_LEVELS +
      ' · 总局数 ' + eco.stats.games +
      ' · 完美 ' + eco.stats.perfectGames +
      ' · 最佳连击 ' + eco.stats.bestCombo;
  }

  // ---------- 关卡选择 ----------
  function renderLevels() {
    var grid = $('levels-grid');
    grid.innerHTML = '';
    var segNames = { easy: '简单', medium: '中等', hard: '困难', expert: '专家' };
    for (var n = 1; n <= Sudoku.TOTAL_LEVELS; n++) {
      (function (levelIndex) {
        var diff = Sudoku.difficultyForLevel(levelIndex);
        var stars = Economy.starsForLevel(eco, levelIndex);
        var unlocked = Economy.isLevelUnlocked(eco, levelIndex);
        var btn = document.createElement('button');
        btn.className = 'level-cell diff-' + diff + (unlocked ? '' : ' locked');
        var starText = '';
        for (var s = 1; s <= 3; s++) starText += s <= stars ? '★' : '☆';
        btn.innerHTML = '<span class="level-num">' + levelIndex + '</span>' +
          '<span class="level-stars">' + (unlocked ? starText : '未解锁') + '</span>' +
          '<span class="level-diff">' + segNames[diff] + '</span>';
        if (unlocked) {
          btn.onclick = function () { FX.sfx.click(); startLevel(levelIndex); };
        } else {
          btn.onclick = function () { FX.sfx.denied(); toast('先通关第 ' + (levelIndex - 1) + ' 关'); };
        }
        grid.appendChild(btn);
      })(n);
    }
    $('levels-summary').textContent = '已通关 ' + Economy.levelsClearedCount(eco) + ' / ' + Sudoku.TOTAL_LEVELS;
  }

  // ---------- 商店 ----------
  function renderShop() {
    $('shop-coins').textContent = eco.coins;
    var list = $('shop-list');
    list.innerHTML = '';
    for (var i = 0; i < Economy.SHOP.length; i++) {
      (function (item) {
        var lv = eco.upgrades[item.id] || 0;
        var row = document.createElement('div');
        row.className = 'shop-item';
        var pips = '';
        for (var p = 1; p <= item.max; p++) pips += p <= lv ? '●' : '○';
        var priceText = lv >= item.max ? '已满级' : Economy.priceOf(eco, item.id) + ' 金币';
        var canBuy = lv < item.max && eco.coins >= Economy.priceOf(eco, item.id);
        row.innerHTML =
          '<div class="shop-info"><div class="shop-name">' + item.name +
          ' <span class="shop-pips">' + pips + '</span></div>' +
          '<div class="shop-desc">' + item.desc + '</div></div>' +
          '<button class="btn shop-buy' + (canBuy ? '' : ' disabled') + '">' + priceText + '</button>';
        row.querySelector('.shop-buy').onclick = function () {
          var res = Economy.buyUpgrade(eco, item.id);
          if (res.ok) {
            FX.sfx.buy();
            toast('已购买「' + item.name + '」');
          } else {
            FX.sfx.denied();
            toast(res.reason === 'poor' ? '金币不足' : '已达最高等级');
          }
          Economy.save(eco);
          updateTopbar();
          renderShop();
        };
        list.appendChild(row);
      })(Economy.SHOP[i]);
    }
  }

  // ---------- 成就 ----------
  function renderAchievements() {
    var list = $('ach-list');
    list.innerHTML = '';
    for (var i = 0; i < Economy.ACHIEVEMENTS.length; i++) {
      var a = Economy.ACHIEVEMENTS[i];
      var got = !!eco.achievements[a.id];
      var row = document.createElement('div');
      row.className = 'ach-item' + (got ? ' got' : '');
      row.innerHTML = '<div class="ach-badge">' + (got ? '★' : '?') + '</div>' +
        '<div class="ach-info"><div class="ach-name">' + a.name + '</div>' +
        '<div class="ach-desc">' + a.desc + ' · 奖励 ' + a.coins + ' 金币</div></div>';
      list.appendChild(row);
    }
  }

  // ---------- 开局 ----------
  function startLevel(levelIndex) {
    showLoading(true);
    setTimeout(function () {
      var diff = Sudoku.difficultyForLevel(levelIndex);
      var gen = Sudoku.generatePuzzle(diff);
      showLoading(false);
      setupGame(gen, 'level', levelIndex, diff);
    }, 60);
  }

  function startFree(diff) {
    showLoading(true);
    setTimeout(function () {
      var gen = Sudoku.generatePuzzle(diff);
      showLoading(false);
      setupGame(gen, 'free', null, diff);
    }, 60);
  }

  function setupGame(gen, mode, levelIndex, difficulty) {
    G = {
      mode: mode,
      levelIndex: levelIndex,
      difficulty: difficulty,
      puzzle: gen.puzzle,
      solution: gen.solution,
      grid: gen.puzzle.slice(),
      notes: [],
      selected: -1,
      noteMode: false,
      mistakes: 0,
      combo: 0,
      bestCombo: 0,
      hintsLeft: Economy.hintsPerGame(eco),
      mercyLeft: Economy.mercyPerGame(eco),
      linesDone: {},
      elapsed: 0,
      over: false,
      history: [],
      redo: []
    };
    for (var i = 0; i < 81; i++) G.notes.push([]);

    // 开局透底：随机填 N 个（无奖励、不计连击）
    var headN = Economy.headstartCount(eco);
    if (headN > 0) {
      var empty = [];
      for (var e = 0; e < 81; e++) if (G.grid[e] === 0) empty.push(e);
      for (var h = 0; h < headN && empty.length; h++) {
        var idx = empty.splice((Math.random() * empty.length) | 0, 1)[0];
        G.grid[idx] = G.solution[idx];
      }
    }
    // 自动笔记
    if (Economy.hasAutoNotes(eco)) {
      for (var c = 0; c < 81; c++) {
        if (G.grid[c] === 0) G.notes[c] = Sudoku.candidates(G.grid, c);
      }
    }

    buildBoard();
    var title = mode === 'level' ? '第 ' + levelIndex + ' 关 · ' + Sudoku.DIFFICULTIES[difficulty].name
                                 : '自由模式 · ' + Sudoku.DIFFICULTIES[difficulty].name;
    $('game-title').textContent = title;
    updateHud();
    renderBoard();
    showView('game');
    saveGame();
  }

  // ---------- 棋盘 ----------
  var cellEls = [];

  function buildBoard() {
    var board = $('board');
    board.innerHTML = '';
    cellEls = [];
    for (var i = 0; i < 81; i++) {
      (function (idx) {
        var cell = document.createElement('div');
        var r = Sudoku.rowOf(idx), c = Sudoku.colOf(idx);
        cell.className = 'cell';
        if ((Sudoku.boxOf(idx) % 2) === 1) cell.classList.add('alt');
        if (c === 2 || c === 5) cell.classList.add('thick-r');
        if (r === 2 || r === 5) cell.classList.add('thick-b');
        cell.innerHTML = '<span class="val"></span><span class="notes"></span>';
        cell.onclick = function () { selectCell(idx); };
        board.appendChild(cell);
        cellEls.push(cell);
      })(i);
    }
  }

  function renderBoard() {
    var selVal = G.selected >= 0 ? G.grid[G.selected] : 0;
    for (var i = 0; i < 81; i++) {
      var cell = cellEls[i];
      var v = G.grid[i];
      var isGiven = G.puzzle[i] !== 0;
      cell.classList.toggle('given', isGiven);
      cell.classList.toggle('player', !isGiven && v !== 0);
      cell.classList.toggle('err', !isGiven && v !== 0 && v !== G.solution[i]);
      cell.classList.toggle('sel', i === G.selected);
      var peer = G.selected >= 0 && i !== G.selected &&
        (Sudoku.rowOf(i) === Sudoku.rowOf(G.selected) ||
         Sudoku.colOf(i) === Sudoku.colOf(G.selected) ||
         Sudoku.boxOf(i) === Sudoku.boxOf(G.selected));
      cell.classList.toggle('peer', peer);
      cell.classList.toggle('same', selVal !== 0 && v === selVal && i !== G.selected);
      cell.querySelector('.val').textContent = v || '';
      var notesEl = cell.querySelector('.notes');
      notesEl.innerHTML = '';
      if (v === 0 && G.notes[i].length) {
        for (var n = 1; n <= 9; n++) {
          var s = document.createElement('i');
          s.textContent = G.notes[i].indexOf(n) >= 0 ? n : '';
          notesEl.appendChild(s);
        }
      }
    }
    updateDigitButtons();
  }

  function updateDigitButtons() {
    var counts = {};
    for (var d = 1; d <= 9; d++) counts[d] = 0;
    for (var i = 0; i < 81; i++) if (G.grid[i]) counts[G.grid[i]]++;
    var btns = $('digits').querySelectorAll('.digit-btn');
    for (var b = 0; b < btns.length; b++) {
      var d2 = Number(btns[b].getAttribute('data-digit'));
      btns[b].classList.toggle('done', counts[d2] >= 9);
    }
  }

  function updateHud() {
    $('game-timer').textContent = fmtTime(G.elapsed);
    $('game-mistakes').textContent = '错误 ' + G.mistakes;
    $('game-combo').textContent = 'x' + G.combo;
    $('game-combo-wrap').classList.toggle('hot', G.combo >= 10);
    $('btn-notes').classList.toggle('on', G.noteMode);
    $('game-hints').textContent = '提示 ' + G.hintsLeft;
  }

  function selectCell(i) {
    if (!G || G.over) return;
    G.selected = i;
    FX.sfx.click();
    renderBoard();
  }

  // ---------- 历史（撤销/重做） ----------
  function snapshot() {
    return {
      grid: G.grid.slice(),
      notes: G.notes.map(function (a) { return a.slice(); }),
      mistakes: G.mistakes,
      combo: G.combo,
      bestCombo: G.bestCombo,
      hintsLeft: G.hintsLeft,
      mercyLeft: G.mercyLeft,
      linesDone: Object.assign({}, G.linesDone)
    };
  }

  function pushHistory() {
    G.history.push(snapshot());
    if (G.history.length > 200) G.history.shift();
    G.redo = [];
  }

  function applySnapshot(s) {
    G.grid = s.grid.slice();
    G.notes = s.notes.map(function (a) { return a.slice(); });
    G.mistakes = s.mistakes;
    G.combo = s.combo;
    G.bestCombo = s.bestCombo;
    G.hintsLeft = s.hintsLeft;
    G.mercyLeft = s.mercyLeft;
    G.linesDone = Object.assign({}, s.linesDone);
  }

  function undo() {
    if (!G.history.length) { toast('没有可撤销的操作'); return; }
    G.redo.push(snapshot());
    applySnapshot(G.history.pop());
    FX.sfx.click();
    updateHud();
    renderBoard();
    saveGame();
  }

  function redo() {
    if (!G.redo.length) { toast('没有可重做的操作'); return; }
    G.history.push(snapshot());
    applySnapshot(G.redo.pop());
    FX.sfx.click();
    updateHud();
    renderBoard();
    saveGame();
  }

  // ---------- 填写 ----------
  function clearPeerNotes(i, digit) {
    var peers = Sudoku.peersOf(i);
    for (var k = 0; k < peers.length; k++) {
      var p = peers[k];
      var pos = G.notes[p].indexOf(digit);
      if (pos >= 0) G.notes[p].splice(pos, 1);
    }
  }

  // 填对后的统一处理：连击、金币、特效、行列宫检测
  function onCorrectFill(i, rewardScale) {
    G.combo++;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;
    if (G.combo > eco.stats.bestCombo) eco.stats.bestCombo = G.combo;
    Economy.bumpStat(eco, 'cells', 1);

    var reward = Math.max(1, Math.round(Economy.cellReward(eco, G.combo) * (rewardScale || 1)));
    Economy.addCoins(eco, reward);
    updateTopbar();

    var cell = cellEls[i];
    FX.popCell(cell);
    FX.floatScore(cell, '+' + reward, '');
    FX.sfx.place(G.combo);
    if (G.combo >= 10 && G.combo % 10 === 0) FX.boardPulse();

    var xpRes = Economy.gainXP(eco, Economy.TUNING.xpPerCell);
    if (xpRes.leveledUp) {
      FX.levelUpFx();
      FX.sfx.levelup();
      toast('升级到 Lv.' + eco.level + '!奖励 ' + xpRes.bonusCoins + ' 金币');
      updateTopbar();
    }

    checkLineCompletion(i);
    Economy.save(eco);
  }

  function lineCells(kind, idx) {
    var out = [];
    if (kind === 'r') for (var c = 0; c < 9; c++) out.push(idx * 9 + c);
    else if (kind === 'c') for (var r = 0; r < 9; r++) out.push(r * 9 + idx);
    else {
      var br = ((idx / 3) | 0) * 3, bc = (idx % 3) * 3;
      for (var dr = 0; dr < 3; dr++) for (var dc = 0; dc < 3; dc++) out.push((br + dr) * 9 + bc + dc);
    }
    return out;
  }

  function checkLineCompletion(i) {
    var checks = [
      ['r', Sudoku.rowOf(i)],
      ['c', Sudoku.colOf(i)],
      ['b', Sudoku.boxOf(i)]
    ];
    for (var k = 0; k < checks.length; k++) {
      var kind = checks[k][0], idx = checks[k][1], key = kind + idx;
      if (G.linesDone[key]) continue;
      var cells = lineCells(kind, idx);
      var full = true;
      for (var m = 0; m < cells.length; m++) {
        if (G.grid[cells[m]] !== G.solution[cells[m]]) { full = false; break; }
      }
      if (full) {
        G.linesDone[key] = true;
        var reward = Economy.lineReward(eco);
        Economy.addCoins(eco, reward);
        var els = cells.map(function (ci) { return cellEls[ci]; });
        FX.sweep(els);
        FX.sfx.line();
        FX.floatScore(cellEls[i], '+' + reward, 'line');
        updateTopbar();
      }
    }
  }

  function inputDigit(d) {
    if (!G || G.over) return;
    var i = G.selected;
    if (i < 0) { toast('先选择一个格子'); return; }
    if (G.puzzle[i] !== 0) { FX.sfx.denied(); return; }

    if (G.noteMode) {
      if (G.grid[i] !== 0) return;
      pushHistory();
      var pos = G.notes[i].indexOf(d);
      if (pos >= 0) G.notes[i].splice(pos, 1);
      else {
        G.notes[i].push(d);
        G.notes[i].sort();
        Economy.bumpStat(eco, 'notesUsed', 1);
      }
      FX.sfx.note();
      renderBoard();
      saveGame();
      return;
    }

    if (G.grid[i] === d) return; // 相同数字不重复处理

    pushHistory();
    G.grid[i] = d;
    if (d === G.solution[i]) {
      G.notes[i] = [];
      clearPeerNotes(i, d);
      onCorrectFill(i, 1);
    } else {
      if (G.mercyLeft > 0) {
        G.mercyLeft--;
        toast('容错之心挡下了这次错误');
        FX.sfx.denied();
      } else {
        G.mistakes++;
        G.combo = 0;
        FX.sfx.error();
        FX.shake(cellEls[i]);
      }
    }
    updateHud();
    renderBoard();
    saveGame();
    checkWin();
  }

  function eraseCell() {
    if (!G || G.over) return;
    var i = G.selected;
    if (i < 0 || G.puzzle[i] !== 0 || G.grid[i] === 0) return;
    pushHistory();
    G.grid[i] = 0;
    FX.sfx.erase();
    updateHud();
    renderBoard();
    saveGame();
  }

  // ---------- 提示 / 检查 / 求解 ----------
  function useHint() {
    if (!G || G.over) return;
    if (G.hintsLeft <= 0) { FX.sfx.denied(); toast('提示次数已用完，可在商店扩容'); return; }
    var target = -1;
    if (G.selected >= 0 && G.puzzle[G.selected] === 0 && G.grid[G.selected] !== G.solution[G.selected]) {
      target = G.selected;
    } else {
      var empty = [];
      for (var i = 0; i < 81; i++) {
        if (G.puzzle[i] === 0 && G.grid[i] !== G.solution[i]) empty.push(i);
      }
      if (!empty.length) return;
      target = empty[(Math.random() * empty.length) | 0];
    }
    pushHistory();
    G.hintsLeft--;
    var d = G.solution[target];
    G.grid[target] = d;
    G.notes[target] = [];
    clearPeerNotes(target, d);
    G.selected = target;
    onCorrectFill(target, 0.5); // 提示收益减半
    FX.floatScore(cellEls[target], '提示', 'hint');
    updateHud();
    renderBoard();
    saveGame();
    checkWin();
  }

  function checkBoard() {
    if (!G || G.over) return;
    var wrong = [];
    for (var i = 0; i < 81; i++) {
      if (G.puzzle[i] === 0 && G.grid[i] !== 0 && G.grid[i] !== G.solution[i]) wrong.push(i);
    }
    if (wrong.length) {
      for (var k = 0; k < wrong.length; k++) {
        (function (ci) {
          cellEls[ci].classList.add('flash-err');
          setTimeout(function () { cellEls[ci].classList.remove('flash-err'); }, 900);
        })(wrong[k]);
      }
      FX.sfx.denied();
      toast('有 ' + wrong.length + ' 处错误');
    } else {
      FX.sfx.line();
      toast('目前填写的全部正确，继续！');
    }
  }

  function solveBoard() {
    if (!G || G.over) return;
    showConfirm('直接查看答案将不会获得任何奖励，确定？', function () {
      for (var i = 0; i < 81; i++) G.grid[i] = G.solution[i];
      G.over = true;
      stopTimer();
      Economy.bumpStat(eco, 'playSec', G.elapsed);
      Economy.save(eco);
      clearSave();
      renderBoard();
      showResult(null, true);
    });
  }

  // ---------- 计时 ----------
  function startTimer() {
    stopTimer();
    timerId = setInterval(function () {
      if (!G || G.over) return;
      G.elapsed++;
      $('game-timer').textContent = fmtTime(G.elapsed);
      if (G.elapsed % 15 === 0) saveGame();
    }, 1000);
  }

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  // ---------- 存档 ----------
  function saveGame() {
    if (!G || G.over) return;
    var data = {
      mode: G.mode,
      levelIndex: G.levelIndex,
      difficulty: G.difficulty,
      puzzle: G.puzzle,
      solution: G.solution,
      grid: G.grid,
      notes: G.notes,
      selected: G.selected,
      noteMode: G.noteMode,
      mistakes: G.mistakes,
      combo: G.combo,
      bestCombo: G.bestCombo,
      hintsLeft: G.hintsLeft,
      mercyLeft: G.mercyLeft,
      linesDone: G.linesDone,
      elapsed: G.elapsed
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }

  function clearSave() {
    localStorage.removeItem(SAVE_KEY);
  }

  function resumeGame() {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      var d = JSON.parse(raw);
      if (!d || !d.puzzle || d.puzzle.length !== 81) return false;
      if (!d.grid || d.grid.length !== 81 || !d.solution || d.solution.length !== 81) return false;
      var notes = [];
      for (var n = 0; n < 81; n++) notes.push((d.notes && d.notes[n]) || []);
      G = {
        mode: d.mode, levelIndex: d.levelIndex, difficulty: d.difficulty,
        puzzle: d.puzzle, solution: d.solution, grid: d.grid,
        notes: notes, selected: d.selected || -1, noteMode: !!d.noteMode,
        mistakes: d.mistakes || 0, combo: d.combo || 0, bestCombo: d.bestCombo || 0,
        hintsLeft: d.hintsLeft === undefined ? 3 : d.hintsLeft,
        mercyLeft: d.mercyLeft || 0,
        linesDone: d.linesDone || {}, elapsed: d.elapsed || 0,
        over: false, history: [], redo: []
      };
      buildBoard();
      var title = G.mode === 'level' ? '第 ' + G.levelIndex + ' 关 · ' + Sudoku.DIFFICULTIES[G.difficulty].name
                                     : '自由模式 · ' + Sudoku.DIFFICULTIES[G.difficulty].name;
      $('game-title').textContent = title + '（继续）';
      updateHud();
      renderBoard();
      showView('game');
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- 胜利与结算 ----------
  function checkWin() {
    if (!G || G.over) return;
    for (var i = 0; i < 81; i++) {
      if (G.grid[i] !== G.solution[i]) return;
    }
    G.over = true;
    stopTimer();
    Economy.bumpStat(eco, 'playSec', G.elapsed);
    var reward = Economy.gameReward(eco, G.difficulty, G.mode, G.elapsed, G.mistakes);
    if (G.mode === 'level') {
      Economy.recordLevelClear(eco, G.levelIndex, reward.stars, G.difficulty);
    } else {
      Economy.recordFreeGame(eco, reward.stars);
    }
    Economy.addCoins(eco, reward.coins);
    var xpRes = Economy.gainXP(eco, reward.xp);
    var newAch = Economy.checkAchievements(eco);
    Economy.save(eco);
    clearSave();
    updateTopbar();

    FX.sfx.win();
    FX.confetti();
    if (xpRes.leveledUp) {
      setTimeout(function () { FX.levelUpFx(); FX.sfx.levelup(); }, 600);
    }
    for (var a = 0; a < newAch.length; a++) {
      (function (ach, delay) {
        setTimeout(function () {
          toast('达成成就「' + ach.name + '」 +' + ach.coins + ' 金币');
          FX.sfx.achievement();
        }, delay);
      })(newAch[a], 1200 + a * 1600);
    }
    showResult(reward, false);
  }

  function showResult(reward, solved) {
    var modal = $('modal-result');
    var nextBtn = $('btn-result-next');
    var againBtn = $('btn-result-again');
    if (solved || !reward) {
      $('result-title').textContent = '已求解';
      $('result-stars').textContent = '☆☆☆';
      $('result-rows').innerHTML = '<div class="result-row"><span>本局无奖励</span><span>再试一次？</span></div>';
      $('result-coins-total').textContent = '0';
      $('result-xp').textContent = '0';
      $('result-levelup').textContent = '';
      nextBtn.style.display = 'none';
      againBtn.style.display = '';
    } else {
      $('result-title').textContent = G.mode === 'level' ? ('第 ' + G.levelIndex + ' 关通关！') : '自由模式完成！';
      var starText = '';
      for (var s = 1; s <= 3; s++) starText += s <= reward.stars ? '★' : '☆';
      $('result-stars').textContent = starText;
      var rows = '<div class="result-row"><span>基础奖励</span><span>' + reward.base + '</span></div>';
      if (reward.speedBonus) rows += '<div class="result-row bonus"><span>速通加成 x1.3</span><span></span></div>';
      if (reward.modeFactor < 1) rows += '<div class="result-row"><span>自由模式 x0.6</span><span></span></div>';
      if (reward.multiplier > 1) rows += '<div class="result-row"><span>金币倍率 x' + reward.multiplier.toFixed(2) + '</span><span></span></div>';
      $('result-rows').innerHTML = rows;
      $('result-coins-total').textContent = '+' + reward.coins + ' 金币';
      $('result-xp').textContent = '+' + reward.xp + ' 经验';
      $('result-levelup').textContent = '';
      var hasNext = G.mode === 'level' && G.levelIndex < Sudoku.TOTAL_LEVELS;
      nextBtn.style.display = hasNext ? '' : 'none';
      againBtn.style.display = '';
    }
    modal.classList.remove('hidden');
  }

  function closeResult() {
    $('modal-result').classList.add('hidden');
  }

  // ---------- 退出 ----------
  function quitToMenu() {
    if (G && !G.over) {
      saveGame();
      G = null;
    }
    closeResult();
    renderMenu();
    renderLevels();
    showView('menu');
  }

  // ---------- 事件绑定 ----------
  function bind() {
    // 顶栏
    $('theme-select').onchange = function () {
      if (Economy.setTheme(eco, this.value)) {
        Economy.save(eco);
        applyTheme();
        FX.sfx.click();
      } else {
        toast('该主题未解锁');
        this.value = eco.theme;
      }
    };
    $('sound-btn').onclick = function () {
      eco.sound = !eco.sound;
      Economy.save(eco);
      FX.setSound(eco.sound);
      updateSoundBtn();
      FX.sfx.click();
    };

    // 主菜单
    $('btn-continue').onclick = function () {
      FX.unlock();
      if (!resumeGame()) toast('存档读取失败');
    };
    $('btn-levels').onclick = function () { FX.unlock(); FX.sfx.click(); renderLevels(); showView('levels'); };
    $('btn-free').onclick = function () { FX.unlock(); FX.sfx.click(); $('modal-difficulty').classList.remove('hidden'); };
    $('btn-shop').onclick = function () { FX.sfx.click(); renderShop(); showView('shop'); };
    $('btn-achievements').onclick = function () { FX.sfx.click(); renderAchievements(); showView('achievements'); };

    // 难度选择
    var diffBtns = $('modal-difficulty').querySelectorAll('.diff-btn');
    for (var i = 0; i < diffBtns.length; i++) {
      diffBtns[i].onclick = function () {
        $('modal-difficulty').classList.add('hidden');
        startFree(this.getAttribute('data-diff'));
      };
    }
    $('btn-diff-cancel').onclick = function () { $('modal-difficulty').classList.add('hidden'); };

    // 返回按钮
    $('btn-levels-back').onclick = function () { FX.sfx.click(); renderMenu(); showView('menu'); };
    $('btn-shop-back').onclick = function () { FX.sfx.click(); renderMenu(); showView('menu'); };
    $('btn-ach-back').onclick = function () { FX.sfx.click(); renderMenu(); showView('menu'); };

    // 对局控制
    var digitBtns = $('digits').querySelectorAll('.digit-btn');
    for (var d = 0; d < digitBtns.length; d++) {
      digitBtns[d].onclick = function () { inputDigit(Number(this.getAttribute('data-digit'))); };
    }
    $('btn-erase').onclick = eraseCell;
    $('btn-notes').onclick = function () {
      if (!G) return;
      G.noteMode = !G.noteMode;
      FX.sfx.click();
      updateHud();
    };
    $('btn-hint').onclick = useHint;
    $('btn-undo').onclick = undo;
    $('btn-redo').onclick = redo;
    $('btn-check').onclick = checkBoard;
    $('btn-solve').onclick = solveBoard;
    $('btn-quit').onclick = function () { FX.sfx.click(); quitToMenu(); };

    // 结算按钮
    $('btn-result-next').onclick = function () {
      closeResult();
      var next = G.levelIndex + 1;
      G = null;
      startLevel(next);
    };
    $('btn-result-again').onclick = function () {
      var mode = G.mode, diff = G.difficulty, lv = G.levelIndex;
      closeResult();
      G = null;
      if (mode === 'level') startLevel(lv);
      else startFree(diff);
    };
    $('btn-result-menu').onclick = function () { quitToMenu(); };

    // 兑换码：主菜单右下角隐形热区，2 秒内连点 3 次弹出
    var tapCount = 0, tapTimer = null;
    $('redeem-hotzone').onclick = function () {
      tapCount++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(function () { tapCount = 0; }, 2000);
      FX.sfx.click();
      if (tapCount >= 3) {
        tapCount = 0;
        $('redeem-input').value = '';
        $('modal-redeem').classList.remove('hidden');
        $('redeem-input').focus();
      }
    };
    $('btn-redeem-cancel').onclick = function () {
      $('modal-redeem').classList.add('hidden');
      FX.sfx.click();
    };
    $('btn-redeem-confirm').onclick = function () {
      var code = $('redeem-input').value;
      var res = Economy.redeem(eco, code);
      if (!res.ok) {
        FX.sfx.denied();
        FX.shake($('redeem-input'));
        toast(res.reason === 'used' ? '该兑换码已被使用' : '兑换码无效');
        return;
      }
      Economy.save(eco);
      updateTopbar();
      renderThemeSelect();
      $('modal-redeem').classList.add('hidden');
      if (res.kind === 'admin') {
        FX.sfx.win();
        FX.confetti();
        FX.levelUpFx();
        toast('管理员兑换成功！金币 +99999，全部升级拉满，40 关全解锁');
      } else {
        FX.sfx.buy();
        toast('兑换成功「' + res.label + '」金币 +' + res.coins);
      }
      Economy.checkAchievements(eco);
      Economy.save(eco);
      updateTopbar();
    };

    // 键盘
    document.addEventListener('keydown', function (e) {
      if (!$('view-game').classList.contains('active')) return;
      if (G && G.over) return;
      if (e.key >= '1' && e.key <= '9') inputDigit(Number(e.key));
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') eraseCell();
      else if (e.key === 'n' || e.key === 'N') { G.noteMode = !G.noteMode; updateHud(); }
      else if (e.key === 'h' || e.key === 'H') useHint();
      else if (e.key === 'z' || e.key === 'Z') undo();
      else if (e.key === 'y' || e.key === 'Y') redo();
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!G || G.selected < 0) return;
        var r = Sudoku.rowOf(G.selected), c = Sudoku.colOf(G.selected);
        if (e.key === 'ArrowUp') r = (r + 8) % 9;
        if (e.key === 'ArrowDown') r = (r + 1) % 9;
        if (e.key === 'ArrowLeft') c = (c + 8) % 9;
        if (e.key === 'ArrowRight') c = (c + 1) % 9;
        G.selected = r * 9 + c;
        renderBoard();
        e.preventDefault();
      }
    });

    // 切后台自动存档
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && G && !G.over) saveGame();
    });

    // 首次交互解锁音频
    document.addEventListener('pointerdown', function once() {
      FX.unlock();
      document.removeEventListener('pointerdown', once);
    });
  }

  // ---------- 启动 ----------
  function init() {
    FX.setSound(eco.sound);
    updateSoundBtn();
    applyTheme();
    renderThemeSelect();
    updateTopbar();
    renderMenu();
    bind();
    showView('menu');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
