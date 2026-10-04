/* economy.js 经济系统自测：收益公式、升级曲线、星级、成就、主题、持久化 */
'use strict';
var Economy = require('../economy.js');

var failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
}
function approx(a, b, msg) { assert(Math.abs(a - b) < 1e-9, msg + ' (got ' + a + ', want ' + b + ')'); }

function memStorage() {
  var map = {};
  return {
    getItem: function (k) { return map[k] === undefined ? null : map[k]; },
    setItem: function (k, v) { map[k] = String(v); }
  };
}

// 1. 默认状态与持久化往返
var st = memStorage();
var s = Economy.load(st);
assert(s.coins === 0 && s.level === 1, 'default state');
s.coins = 777;
Economy.save(s, st);
var s2 = Economy.load(st);
assert(s2.coins === 777, 'persistence roundtrip');
assert(Economy.load(memStorage()).coins === 0, 'fresh storage gives defaults');

// 2. 单格奖励：连击倍率与封顶
var base = Economy.defaultState();
approx(Economy.cellReward(base, 0), 10, 'combo 0 reward');
approx(Economy.cellReward(base, 5), 15, 'combo 5 reward');
approx(Economy.cellReward(base, 20), 30, 'combo 20 capped at x3');
var mult = Economy.defaultState();
mult.upgrades.multiplier = 2; // 1.5x
approx(Economy.cellReward(mult, 0), 15, 'multiplier lv2 reward');
approx(Economy.cellReward(mult, 20), 45, 'multiplier lv2 + cap');

// 3. 行列奖励
approx(Economy.lineReward(base), 50, 'line reward');
approx(Economy.lineReward(mult), 75, 'line reward with multiplier');

// 4. 整局奖励：星级、速通、自由模式、倍率
var r = Economy.gameReward(base, 'easy', 'level', 100, 0);
assert(r.stars === 3 && r.speedBonus === true, '0 mistakes 3 stars + speed');
approx(r.coins, Math.round(200 * 1.3), 'speed bonus applied');
var r2 = Economy.gameReward(base, 'easy', 'level', 100, 2);
assert(r2.stars === 2 && r2.speedBonus === true, '2 mistakes 2 stars');
var r3 = Economy.gameReward(base, 'easy', 'level', 100, 5);
assert(r3.stars === 1, '5 mistakes 1 star');
var r4 = Economy.gameReward(base, 'easy', 'level', 9999, 0);
assert(r4.speedBonus === false, 'slow game no speed bonus');
approx(r4.coins, 200, 'no speed no bonus');
var r5 = Economy.gameReward(base, 'hard', 'free', 9999, 0);
approx(r5.coins, Math.round(800 * 0.6), 'free mode 60%');
approx(r5.xp, Math.round(400 * 0.6), 'free mode xp 60%');
var r6 = Economy.gameReward(mult, 'easy', 'level', 100, 0);
approx(r6.coins, Math.round(200 * 1.3 * 1.5), 'multiplier in game reward');

// 5. 经验与升级
assert(Economy.xpForLevel(1) === 100, 'xp level 1 = 100');
assert(Economy.xpForLevel(2) > Economy.xpForLevel(1), 'xp curve increasing');
var g = Economy.gainXP(base, 50);
assert(!g.leveledUp && base.level === 1 && base.xp === 50, 'partial xp no levelup');
var g2 = Economy.gainXP(base, 60); // 累计 110 → 升 1 级
assert(g2.leveledUp && base.level === 2 && base.xp === 10, 'level up rolls over xp');
assert(base.coins === g2.bonusCoins && g2.bonusCoins === 100, 'level bonus = 50 * lv2');
var big = Economy.defaultState();
var g3 = Economy.gainXP(big, 100 + 283 + 50); // 连升 2 级
assert(big.level === 3, 'multi level up');
assert(big.coins === 50 * 2 + 50 * 3, 'multi level bonus sum');
var p = Economy.xpProgress(big);
assert(p.need === Economy.xpForLevel(3) && p.pct >= 0 && p.pct <= 100, 'xpProgress sane');

// 6. 商店
var shop = Economy.defaultState();
shop.coins = 10000;
var p0 = Economy.priceOf(shop, 'multiplier');
assert(p0 === 300, 'multiplier base price');
var b1 = Economy.buyUpgrade(shop, 'multiplier');
assert(b1.ok && shop.upgrades.multiplier === 1 && shop.coins === 9700, 'buy multiplier');
var p1 = Economy.priceOf(shop, 'multiplier');
assert(p1 === Math.round(300 * 1.8), 'price grows by growth factor');
for (var i = 0; i < 4; i++) Economy.buyUpgrade(shop, 'multiplier');
assert(Economy.buyUpgrade(shop, 'multiplier').reason === 'max', 'max level blocks');
var poor = Economy.defaultState();
assert(Economy.buyUpgrade(poor, 'autoNotes').reason === 'poor', 'insufficient coins');
assert(Economy.buyUpgrade(shop, 'nope').reason === 'unknown', 'unknown item');
assert(Economy.hintsPerGame(shop) === 3, 'default hints 3');
assert(Economy.hintsPerGame(poor) === 3, 'default hints 3 (fresh)');
var h = Economy.defaultState(); h.upgrades.hints = 2;
assert(Economy.hintsPerGame(h) === 5, 'hints upgrade');
assert(Economy.mercyPerGame(h) === 0 && Economy.headstartCount(h) === 0 && !Economy.hasAutoNotes(h), 'other upgrades default 0');
h.upgrades.mercy = 1; h.upgrades.headstart = 3; h.upgrades.autoNotes = 1;
assert(Economy.mercyPerGame(h) === 1 && Economy.headstartCount(h) === 3 && Economy.hasAutoNotes(h), 'upgrade effects');

// 7. 关卡星级与解锁
var lv = Economy.defaultState();
assert(Economy.isLevelUnlocked(lv, 1) && !Economy.isLevelUnlocked(lv, 2), 'level gating');
assert(Economy.recordLevelClear(lv, 1, 2, 'easy') === true, 'first clear records');
assert(Economy.starsForLevel(lv, 1) === 2, 'stars stored');
assert(Economy.isLevelUnlocked(lv, 2), 'next level unlocked');
assert(Economy.recordLevelClear(lv, 1, 1, 'easy') === false && Economy.starsForLevel(lv, 1) === 2, 'stars keep max');
assert(Economy.recordLevelClear(lv, 1, 3, 'easy') === true && Economy.starsForLevel(lv, 1) === 3, 'stars improve');
assert(lv.stats.games === 3 && lv.stats.perfectGames === 1, 'stats accumulate');
assert(Economy.levelsClearedCount(lv) === 1, 'cleared count');
Economy.recordLevelClear(lv, 31, 1, 'expert');
assert(lv.stats.expertClears === 1, 'expert clear stat');
var fr = Economy.defaultState();
Economy.recordFreeGame(fr, 3);
assert(fr.stats.games === 1 && fr.stats.perfectGames === 1, 'free game recorded');

// 8. 主题解锁
var th = Economy.defaultState();
assert(Economy.themesUnlockedCount(th) === 1, 'only classic at start');
assert(Economy.setTheme(th, 'classic') === true, 'classic settable');
assert(Economy.setTheme(th, 'neon') === false && th.theme === 'classic', 'locked theme rejected');
for (var L = 1; L <= 15; L++) Economy.recordLevelClear(th, L, 1, 'easy');
assert(Economy.themesUnlockedCount(th) === 4, '15 clears unlock 4 themes');
assert(Economy.setTheme(th, 'neon') === true && th.theme === 'neon', 'theme unlocks at 15 clears');

// 9. 成就
var ac = Economy.defaultState();
var got = Economy.checkAchievements(ac);
assert(got.length === 0, 'no achievements at start');
Economy.recordLevelClear(ac, 1, 3, 'easy');
got = Economy.checkAchievements(ac);
assert(got.length === 2, 'first_win + perfect after 1 perfect game');
assert(ac.achievements.first_win && ac.achievements.perfect, 'achievement flags set');
var coinsAfter = ac.coins;
assert(Economy.checkAchievements(ac).length === 0 && ac.coins === coinsAfter, 'no re-trigger');
Economy.bumpStat(ac, 'cells', 100);
got = Economy.checkAchievements(ac);
assert(ac.achievements.hundred_cells, 'hundred_cells at 100');
Economy.bumpStat(ac, 'bestCombo', 20);
Economy.bumpStat(ac, 'notesUsed', 200);
Economy.bumpStat(ac, 'playSec', 3600);
Economy.addCoins(ac, 10000);
got = Economy.checkAchievements(ac);
assert(ac.achievements.combo20 && ac.achievements.noter && ac.achievements.hour && ac.achievements.rich, 'stat achievements fire');
// 十局
var ten = Economy.defaultState();
for (var g10 = 0; g10 < 10; g10++) Economy.recordFreeGame(ten, 1);
Economy.checkAchievements(ten);
assert(ten.achievements.ten_games, 'ten_games');
// 全皮肤
var col = Economy.defaultState();
for (var L2 = 1; L2 <= 35; L2++) Economy.recordLevelClear(col, L2, 1, 'easy');
Economy.checkAchievements(col);
assert(col.achievements.collector, 'collector at 35 clears');

// 10. 存档缺字段合并
var partial = memStorage();
partial.setItem(Economy.KEY, JSON.stringify({ version: 1, coins: 5 }));
var merged = Economy.load(partial);
assert(merged.coins === 5 && merged.level === 1 && merged.stats && merged.upgrades, 'partial save merged with defaults');
var bad = memStorage();
bad.setItem(Economy.KEY, '{not json');
assert(Economy.load(bad).coins === 0, 'corrupt save falls back');

if (failures > 0) {
  console.error('\n' + failures + ' assertion(s) FAILED');
  process.exit(1);
}
console.log('All economy.js tests PASSED');
