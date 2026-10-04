/* integration.test.js — 静态一致性自检：
 * 1) game.js / fx.js 引用的 DOM id 都存在于 index.html
 * 2) game.js 引用的 Economy.* / Sudoku.* / FX.* API 都真实存在
 * 3) index.html 引用的资源文件都存在
 */
'use strict';
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

var failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
}
function read(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }

var html = read('index.html');
var gameJs = read('game.js');
var fxJs = read('fx.js');

// 1. DOM id 一致性
var htmlIds = {};
(html.match(/id="([^"]+)"/g) || []).forEach(function (m) {
  htmlIds[m.slice(4, -1)] = true;
});
var usedIds = {};
var reId = /\$\('([^']+)'\)|getElementById\('([^']+)'\)/g;
[gameJs, fxJs].forEach(function (src) {
  var m;
  while ((m = reId.exec(src)) !== null) {
    var id = m[1] || m[2];
    if (id.indexOf("' +") >= 0) continue; // 动态 id（view-*）单独验证
    usedIds[id] = true;
  }
});
Object.keys(usedIds).forEach(function (id) {
  assert(htmlIds[id], 'DOM id "' + id + '" missing in index.html');
});
// 动态视图 id
['menu', 'levels', 'shop', 'achievements', 'game'].forEach(function (name) {
  assert(htmlIds['view-' + name], 'view id view-' + name + ' missing');
});

// 2. API 引用一致性
function exportsOf(file) {
  var src = read(file);
  var out = {};
  // UMD 工厂模式：return { a: a, b: b };
  var m = src.match(/return \{([\s\S]*?)\};\s*\}\);/);
  if (m) {
    (m[1].match(/^\s*([A-Za-z_$][\w$]*)\s*:/gm) || []).forEach(function (line) {
      out[line.trim().replace(/:$/, '')] = true;
    });
    return out;
  }
  // 全局赋值模式：global.FX = { a: a, ... };
  var g = src.match(/global\.[A-Za-z_$][\w$]*\s*=\s*\{([\s\S]*?)\};/);
  if (g) {
    (g[1].match(/^\s*([A-Za-z_$][\w$]*)\s*[:]/gm) || []).forEach(function (line) {
      out[line.trim().replace(/:$/, '').replace(/\s*[:]$/, '')] = true;
    });
  }
  return out;
}
var econApi = exportsOf('economy.js');
var sudokuApi = exportsOf('sudoku.js');
var fxApi = exportsOf('fx.js');

function checkApi(src, nsName, api, label) {
  var re = new RegExp(nsName + '\\.([A-Za-z_$][\\w$]*)', 'g');
  var m;
  var seen = {};
  while ((m = re.exec(src)) !== null) {
    if (seen[m[1]]) continue;
    seen[m[1]] = true;
    assert(api[m[1]], label + ' uses ' + nsName + '.' + m[1] + ' which is not exported');
  }
}
checkApi(gameJs, 'Economy', econApi, 'game.js');
checkApi(gameJs, 'Sudoku', sudokuApi, 'game.js');
checkApi(gameJs, 'FX', fxApi, 'game.js');

// 3. 资源文件存在
['index.html', 'style.css', 'sudoku.js', 'economy.js', 'fx.js', 'game.js', 'manifest.json', 'icon.svg'].forEach(function (f) {
  assert(fs.existsSync(path.join(root, f)), 'missing file: ' + f);
});
['style.css', 'manifest.json', 'icon.svg'].forEach(function (f) {
  assert(html.indexOf(f) >= 0, 'index.html does not reference ' + f);
});
['sudoku.js', 'economy.js', 'fx.js', 'game.js'].forEach(function (f) {
  assert(html.indexOf('src="' + f + '"') >= 0, 'index.html missing script tag for ' + f);
});

// 4. manifest.json 是合法 JSON
assert(function () {
  try { JSON.parse(read('manifest.json')); return true; } catch (e) { return false; }
}(), 'manifest.json is valid JSON');

// 5. 脚本加载顺序：依赖在前
var order = ['sudoku.js', 'economy.js', 'fx.js', 'game.js'].map(function (f) {
  return html.indexOf('src="' + f + '"');
});
assert(order.every(function (v, i) { return i === 0 || v > order[i - 1]; }), 'script load order wrong');

if (failures > 0) {
  console.error('\n' + failures + ' assertion(s) FAILED');
  process.exit(1);
}
console.log('All integration checks PASSED (' + Object.keys(usedIds).length + ' DOM ids, ' +
  Object.keys(econApi).length + ' economy api, ' + Object.keys(sudokuApi).length + ' sudoku api, ' +
  Object.keys(fxApi).length + ' fx api)');