/* sudoku.js 算法自测：唯一解、合法性、难度区间、性能 */
'use strict';
var Sudoku = require('../sudoku.js');

var failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
}

function givensOf(puzzle) { return Sudoku.countGivens(puzzle); }

// 1. 空盘计解上限
assert(Sudoku.countSolutions(new Array(81).fill(0), 2) === 2, 'empty board countSolutions limit=2');

// 2. 求解器与合法解
var solved = Sudoku.generateSolvedBoard();
assert(Sudoku.isValidBoard(solved), 'generateSolvedBoard produces valid board');

var PER_DIFF = 20;
var ORDER = ['easy', 'medium', 'hard', 'expert'];

for (var d = 0; d < ORDER.length; d++) {
  var key = ORDER[d];
  var conf = Sudoku.DIFFICULTIES[key];
  var times = [];
  for (var n = 0; n < PER_DIFF; n++) {
    var t0 = Date.now();
    var gen = Sudoku.generatePuzzle(key);
    times.push(Date.now() - t0);

    // 唯一解
    assert(Sudoku.countSolutions(gen.puzzle, 2) === 1, key + ' puzzle has unique solution (#' + n + ')');
    // 解合法
    assert(Sudoku.isValidBoard(gen.solution), key + ' solution valid (#' + n + ')');
    // 题目与解一致
    var consistent = true;
    for (var i = 0; i < 81; i++) {
      if (gen.puzzle[i] !== 0 && gen.puzzle[i] !== gen.solution[i]) { consistent = false; break; }
    }
    assert(consistent, key + ' puzzle consistent with solution (#' + n + ')');
    // 已知数区间（对称挖洞成对移除，允许比下限少 1）
    var g = givensOf(gen.puzzle);
    assert(g >= conf.givens[0] - 1 && g <= conf.givens[1], key + ' givens ' + g + ' in [' + (conf.givens[0] - 1) + ',' + conf.givens[1] + '] (#' + n + ')');
    // solve() 能还原同解（唯一解下必然相同）
    var s = Sudoku.solve(gen.puzzle);
    var same = true;
    for (var j = 0; j < 81; j++) if (s[j] !== gen.solution[j]) { same = false; break; }
    assert(same, key + ' solve() matches unique solution (#' + n + ')');
  }
  var avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
  var max = Math.max.apply(null, times);
  console.log(key + ': avg ' + avg.toFixed(0) + 'ms, max ' + max + 'ms over ' + PER_DIFF + ' puzzles');
  assert(max < 8000, key + ' generation not pathologically slow');
}

// 3. 关卡难度映射
assert(Sudoku.difficultyForLevel(1) === 'easy', 'level 1 easy');
assert(Sudoku.difficultyForLevel(10) === 'easy', 'level 10 easy');
assert(Sudoku.difficultyForLevel(11) === 'medium', 'level 11 medium');
assert(Sudoku.difficultyForLevel(20) === 'medium', 'level 20 medium');
assert(Sudoku.difficultyForLevel(21) === 'hard', 'level 21 hard');
assert(Sudoku.difficultyForLevel(30) === 'hard', 'level 30 hard');
assert(Sudoku.difficultyForLevel(31) === 'expert', 'level 31 expert');
assert(Sudoku.difficultyForLevel(40) === 'expert', 'level 40 expert');

// 4. peers/candidates 基本性质
var peers40 = Sudoku.peersOf(40);
assert(peers40.length === 20, 'center cell has 20 peers');
var cands = Sudoku.candidates(solved, -1); // n/a 占位
var emptyBoard = new Array(81).fill(0);
assert(Sudoku.candidates(emptyBoard, 0).length === 9, 'empty board cell has 9 candidates');

if (failures > 0) {
  console.error('\n' + failures + ' assertion(s) FAILED');
  process.exit(1);
}
console.log('\nAll sudoku.js tests PASSED');
