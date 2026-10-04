/*
 * sudoku.js — 数独纯算法层（无 DOM 依赖，Node 可直接 require 测试）
 */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.Sudoku = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'expert'];

  // givens: 题目保留的已知数数量区间（对称挖洞为成对移除，实际结果可能少 1）
  var DIFFICULTIES = {
    easy:   { key: 'easy',   name: '简单', givens: [40, 44] },
    medium: { key: 'medium', name: '中等', givens: [33, 36] },
    hard:   { key: 'hard',   name: '困难', givens: [28, 31] },
    expert: { key: 'expert', name: '专家', givens: [24, 27] }
  };

  var TOTAL_LEVELS = 40;

  function rowOf(i) { return (i / 9) | 0; }
  function colOf(i) { return i % 9; }
  function boxOf(i) { return ((i / 9) | 0) / 3 * 3 + ((i % 9) / 3 | 0); }

  function peersOf(i) {
    var r = rowOf(i), c = colOf(i), seen = {}, out = [];
    function add(idx) { if (idx !== i && !seen[idx]) { seen[idx] = true; out.push(idx); } }
    for (var k = 0; k < 9; k++) {
      add(r * 9 + k);        // 同行
      add(k * 9 + c);        // 同列
    }
    var br = r - r % 3, bc = c - c % 3;
    for (var dr = 0; dr < 3; dr++) {
      for (var dc = 0; dc < 3; dc++) add((br + dr) * 9 + bc + dc);
    }
    return out;
  }

  function candidates(board, i) {
    var used = {};
    var peers = peersOf(i);
    for (var k = 0; k < peers.length; k++) {
      var v = board[peers[k]];
      if (v) used[v] = true;
    }
    var out = [];
    for (var n = 1; n <= 9; n++) if (!used[n]) out.push(n);
    return out;
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = (rng() * (i + 1)) | 0;
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function randInt(min, max, rng) { // [min, max] 闭区间
    return min + ((rng() * (max - min + 1)) | 0);
  }

  // MRV 回溯：填充一个完整合法解
  function fillBoard(board, rng) {
    var best = -1, bestCands = null;
    for (var i = 0; i < 81; i++) {
      if (board[i] === 0) {
        var cands = candidates(board, i);
        if (cands.length === 0) return false;
        if (!bestCands || cands.length < bestCands.length) {
          best = i; bestCands = cands;
          if (cands.length === 1) break;
        }
      }
    }
    if (best === -1) return true;
    shuffle(bestCands, rng);
    for (var k = 0; k < bestCands.length; k++) {
      board[best] = bestCands[k];
      if (fillBoard(board, rng)) return true;
      board[best] = 0;
    }
    return false;
  }

  function generateSolvedBoard(rng) {
    rng = rng || Math.random;
    var board = new Array(81).fill(0);
    fillBoard(board, rng);
    return board;
  }

  // 计解数，达到 limit 提前退出（唯一解判断只需 limit=2）
  function countSolutions(board, limit) {
    limit = limit || 2;
    var b = board.slice();
    var count = 0;
    (function walk() {
      if (count >= limit) return;
      var best = -1, bestCands = null;
      for (var i = 0; i < 81; i++) {
        if (b[i] === 0) {
          var cands = candidates(b, i);
          if (cands.length === 0) return;
          if (!bestCands || cands.length < bestCands.length) {
            best = i; bestCands = cands;
            if (cands.length === 1) break;
          }
        }
      }
      if (best === -1) { count++; return; }
      for (var k = 0; k < bestCands.length; k++) {
        b[best] = bestCands[k];
        walk();
        b[best] = 0;
        if (count >= limit) return;
      }
    })();
    return count;
  }

  // 求解：返回第一个解的副本；无解返回 null
  function solve(board) {
    var b = board.slice();
    if (!fillBoard(b, Math.random)) return null;
    return b;
  }

  // 中心对称挖洞生成唯一解题目
  function generatePuzzle(difficultyKey, rng) {
    rng = rng || Math.random;
    var conf = DIFFICULTIES[difficultyKey];
    if (!conf) throw new Error('unknown difficulty: ' + difficultyKey);
    var solution = generateSolvedBoard(rng);
    var puzzle = solution.slice();
    var order = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39], rng);
    var givens = 81;
    var target = randInt(conf.givens[0], conf.givens[1], rng);
    for (var oi = 0; oi < order.length; oi++) {
      if (givens <= target) break;
      var i = order[oi], j = 80 - i;
      var cells = i === j ? [i] : [i, j];
      var backup = cells.map(function (c) { return puzzle[c]; });
      for (var k = 0; k < cells.length; k++) puzzle[cells[k]] = 0;
      if (countSolutions(puzzle, 2) !== 1) {
        for (var m = 0; m < cells.length; m++) puzzle[cells[m]] = backup[m];
      } else {
        givens -= cells.length;
      }
    }
    // 第二遍：非对称单格清理，在保持唯一解的前提下尽量逼近目标已知数
    if (givens > target) {
      var rest = [];
      for (var c = 0; c < 81; c++) if (puzzle[c]) rest.push(c);
      shuffle(rest, rng);
      for (var ri = 0; ri < rest.length && givens > target; ri++) {
        var cc = rest[ri];
        var bak = puzzle[cc];
        puzzle[cc] = 0;
        if (countSolutions(puzzle, 2) !== 1) puzzle[cc] = bak;
        else givens--;
      }
    }
    return { puzzle: puzzle, solution: solution, givens: givens };
  }

  function isValidBoard(board) {
    if (!board || board.length !== 81) return false;
    for (var i = 0; i < 81; i++) {
      var v = board[i];
      if (!v) return false;
      var peers = peersOf(i);
      for (var k = 0; k < peers.length; k++) {
        if (peers[k] !== i && board[peers[k]] === v) return false;
      }
    }
    return true;
  }

  function countGivens(puzzle) {
    var n = 0;
    for (var i = 0; i < 81; i++) if (puzzle[i]) n++;
    return n;
  }

  // 关卡 → 难度：1-10 简单，11-20 中等，21-30 困难，31-40 专家
  function difficultyForLevel(levelIndex) {
    if (levelIndex <= 10) return 'easy';
    if (levelIndex <= 20) return 'medium';
    if (levelIndex <= 30) return 'hard';
    return 'expert';
  }

  return {
    DIFFICULTY_ORDER: DIFFICULTY_ORDER,
    DIFFICULTIES: DIFFICULTIES,
    TOTAL_LEVELS: TOTAL_LEVELS,
    rowOf: rowOf,
    colOf: colOf,
    boxOf: boxOf,
    peersOf: peersOf,
    candidates: candidates,
    generateSolvedBoard: generateSolvedBoard,
    countSolutions: countSolutions,
    solve: solve,
    generatePuzzle: generatePuzzle,
    isValidBoard: isValidBoard,
    countGivens: countGivens,
    difficultyForLevel: difficultyForLevel
  };
});
