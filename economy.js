/*
 * economy.js — 经济系统：金币/经验/等级、商店、关卡星级、主题、成就
 * 无 DOM 依赖；浏览器用 localStorage，Node 测试注入内存 storage。
 */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.Economy = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;
  var KEY = 'sudoku_economy';

  // ---- 可调数值（平衡手感只改这里）----
  var TUNING = {
    coinsPerCell: 10,
    comboStep: 0.1,     // 每点连击 +10% 单格收益
    comboCap: 3,        // 连击倍率上限 ×3
    coinsPerLine: 50,   // 完成行/列/宫
    xpPerCell: 5,
    levelBaseXP: 100,   // 升级需求 = levelBaseXP * level^levelPow
    levelPow: 1.5,
    levelBonusCoins: 50 // 每升 1 级奖励金币 = levelBonusCoins * 新等级
  };

  // 难度奖励：coins 整局基础奖，xp 整局经验，targetSec 速通门槛
  var REWARDS = {
    easy:   { coins: 200,  xp: 100, targetSec: 8 * 60 },
    medium: { coins: 400,  xp: 200, targetSec: 15 * 60 },
    hard:   { coins: 800,  xp: 400, targetSec: 25 * 60 },
    expert: { coins: 1500, xp: 800, targetSec: 40 * 60 }
  };

  var FREE_MODE_FACTOR = 0.6; // 自由模式收益系数

  var SHOP = [
    { id: 'multiplier', name: '金币倍率', desc: '所有金币收益 +25%/级', max: 5, base: 300, growth: 1.8 },
    { id: 'autoNotes',  name: '自动笔记', desc: '开局自动填充全部候选笔记', max: 1, base: 500, growth: 1 },
    { id: 'hints',      name: '提示扩容', desc: '每局提示次数 +1/级', max: 4, base: 200, growth: 1.6 },
    { id: 'mercy',      name: '容错之心', desc: '填错不清连击不计错误，+1 次/级', max: 3, base: 150, growth: 1.7 },
    { id: 'headstart',  name: '开局透底', desc: '开局自动填入数字，+1 个/级', max: 3, base: 400, growth: 1.9 }
  ];

  var THEMES = [
    { id: 'classic', name: '经典蓝', unlockAt: 0 },
    { id: 'emerald', name: '翡翠绿', unlockAt: 5 },
    { id: 'sunset',  name: '日落橙', unlockAt: 10 },
    { id: 'neon',    name: '霓虹紫', unlockAt: 15 },
    { id: 'sakura',  name: '樱花粉', unlockAt: 20 },
    { id: 'gold',    name: '黄金黑', unlockAt: 25 },
    { id: 'ocean',   name: '海洋蓝', unlockAt: 30 },
    { id: 'rainbow', name: '彩虹宫', unlockAt: 35 }
  ];

  var ACHIEVEMENTS = [
    { id: 'first_win',     name: '初出茅庐',   desc: '完成第一局',           coins: 100,  check: function (s) { return s.stats.games >= 1; } },
    { id: 'ten_games',     name: '十局达成',   desc: '完成 10 局',           coins: 300,  check: function (s) { return s.stats.games >= 10; } },
    { id: 'hundred_cells', name: '百格大师',   desc: '累计填对 100 格',      coins: 200,  check: function (s) { return s.stats.cells >= 100; } },
    { id: 'combo20',       name: '连击爆发',   desc: '单局达成 20 连击',     coins: 300,  check: function (s) { return s.stats.bestCombo >= 20; } },
    { id: 'perfect',       name: '完美主义',   desc: '无错完成一局',         coins: 200,  check: function (s) { return s.stats.perfectGames >= 1; } },
    { id: 'expert_clear',  name: '专家驾到',   desc: '通关任意专家关',       coins: 500,  check: function (s) { return s.stats.expertClears >= 1; } },
    { id: 'rich',          name: '万元户',     desc: '累计获得 10000 金币',  coins: 500,  check: function (s) { return s.stats.totalCoins >= 10000; } },
    { id: 'hour',          name: '硬核玩家',   desc: '累计游戏 60 分钟',     coins: 300,  check: function (s) { return s.stats.playSec >= 3600; } },
    { id: 'noter',         name: '笔记达人',   desc: '使用笔记 200 次',      coins: 200,  check: function (s) { return s.stats.notesUsed >= 200; } },
    { id: 'collector',     name: '全皮肤收集', desc: '解锁所有主题',         coins: 1000, check: function (s, ctx) { return ctx.themesUnlocked >= THEMES.length; } }
  ];

  function defaultState() {
    return {
      version: VERSION,
      coins: 0,
      xp: 0,
      level: 1,
      upgrades: { multiplier: 0, autoNotes: 0, hints: 0, mercy: 0, headstart: 0 },
      levels: {},   // { '1': 2, '3': 3 } 关卡号 → 最高星级
      theme: 'classic',
      sound: true,
      stats: {
        games: 0, cells: 0, bestCombo: 0, perfectGames: 0,
        expertClears: 0, totalCoins: 0, playSec: 0, notesUsed: 0
      },
      achievements: {} // 已解锁成就 id → true
    };
  }

  function storageOf(storage) {
    if (storage) return storage;
    if (typeof localStorage !== 'undefined') return localStorage;
    return null;
  }

  function load(storage) {
    var st = storageOf(storage);
    if (!st) return defaultState();
    try {
      var raw = st.getItem(KEY);
      if (!raw) return defaultState();
      var data = JSON.parse(raw);
      if (!data || data.version !== VERSION) return defaultState();
      // 合并默认值，容忍旧存档缺字段
      var base = defaultState();
      for (var k in base) {
        if (data[k] === undefined) data[k] = base[k];
        else if (typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])) {
          for (var sk in base[k]) if (data[k][sk] === undefined) data[k][sk] = base[k][sk];
        }
      }
      return data;
    } catch (e) {
      return defaultState();
    }
  }

  function save(state, storage) {
    var st = storageOf(storage);
    if (st) st.setItem(KEY, JSON.stringify(state));
  }

  // ---- 等级 ----
  function xpForLevel(level) {
    return Math.round(TUNING.levelBaseXP * Math.pow(level, TUNING.levelPow));
  }

  function xpProgress(state) {
    var need = xpForLevel(state.level);
    var into = state.xp;
    return { into: into, need: need, pct: Math.min(100, Math.round(into / need * 100)) };
  }

  // 加经验，处理连续升级；返回 { leveledUp, levelsGained, bonusCoins }
  function gainXP(state, amount) {
    state.xp += amount;
    var gained = 0;
    while (state.xp >= xpForLevel(state.level)) {
      state.xp -= xpForLevel(state.level);
      state.level++;
      gained++;
    }
    // 每升一级奖励 = levelBonusCoins * 当时的等级，逐级累加
    var bonus = 0;
    for (var lv = state.level - gained + 1; lv <= state.level; lv++) bonus += TUNING.levelBonusCoins * lv;
    if (bonus > 0) addCoins(state, bonus);
    return { leveledUp: gained > 0, levelsGained: gained, bonusCoins: bonus };
  }

  // ---- 金币 ----
  function addCoins(state, amount) {
    state.coins += amount;
    if (amount > 0) state.stats.totalCoins += amount;
  }

  function coinsMultiplier(state) {
    return 1 + 0.25 * (state.upgrades.multiplier || 0);
  }

  // 单格奖励：基础 × 连击倍率（封顶）× 金币倍率
  function cellReward(state, combo) {
    var comboMult = Math.min(TUNING.comboCap, 1 + TUNING.comboStep * Math.max(0, combo));
    return Math.round(TUNING.coinsPerCell * comboMult * coinsMultiplier(state));
  }

  function lineReward(state) {
    return Math.round(TUNING.coinsPerLine * coinsMultiplier(state));
  }

  // 整局奖励；mode: 'level' | 'free'
  function gameReward(state, difficulty, mode, timeSec, mistakes) {
    var r = REWARDS[difficulty];
    if (!r) throw new Error('unknown difficulty: ' + difficulty);
    var stars = mistakes === 0 ? 3 : (mistakes <= 3 ? 2 : 1);
    var modeFactor = mode === 'free' ? FREE_MODE_FACTOR : 1;
    var speed = timeSec <= r.targetSec;
    var subtotal = r.coins * modeFactor * (speed ? 1.3 : 1);
    var total = Math.round(subtotal * coinsMultiplier(state));
    var xp = Math.round(r.xp * modeFactor);
    return {
      stars: stars,
      base: r.coins,
      modeFactor: modeFactor,
      speedBonus: speed,
      multiplier: coinsMultiplier(state),
      coins: total,
      xp: xp
    };
  }

  // ---- 商店 ----
  function shopItem(id) {
    for (var i = 0; i < SHOP.length; i++) if (SHOP[i].id === id) return SHOP[i];
    return null;
  }

  function upgradePrice(item, currentLevel) {
    return Math.round(item.base * Math.pow(item.growth, currentLevel));
  }

  function priceOf(state, id) {
    var item = shopItem(id);
    if (!item) return Infinity;
    return upgradePrice(item, state.upgrades[id] || 0);
  }

  // 返回 { ok:true, price } 或 { ok:false, reason }
  function buyUpgrade(state, id) {
    var item = shopItem(id);
    if (!item) return { ok: false, reason: 'unknown' };
    var lv = state.upgrades[id] || 0;
    if (lv >= item.max) return { ok: false, reason: 'max' };
    var price = upgradePrice(item, lv);
    if (state.coins < price) return { ok: false, reason: 'poor' };
    state.coins -= price;
    state.upgrades[id] = lv + 1;
    return { ok: true, price: price };
  }

  // ---- 升级效果 ----
  function hintsPerGame(state) { return 3 + (state.upgrades.hints || 0); }
  function mercyPerGame(state) { return state.upgrades.mercy || 0; }
  function headstartCount(state) { return state.upgrades.headstart || 0; }
  function hasAutoNotes(state) { return (state.upgrades.autoNotes || 0) > 0; }

  // ---- 关卡 ----
  function starsForLevel(state, levelIndex) {
    return state.levels[String(levelIndex)] || 0;
  }

  function isLevelUnlocked(state, levelIndex) {
    if (levelIndex <= 1) return true;
    return starsForLevel(state, levelIndex - 1) > 0;
  }

  function levelsClearedCount(state) {
    var n = 0;
    for (var k in state.levels) if (state.levels[k] > 0) n++;
    return n;
  }

  // 记录通关，星级取历史最高；返回是否刷新纪录
  function recordLevelClear(state, levelIndex, stars, difficulty) {
    var key = String(levelIndex);
    var prev = state.levels[key] || 0;
    var improved = stars > prev;
    if (improved) state.levels[key] = stars;
    state.stats.games++;
    if (stars === 3) state.stats.perfectGames++;
    if (difficulty === 'expert') state.stats.expertClears++;
    return improved;
  }

  function recordFreeGame(state, stars) {
    state.stats.games++;
    if (stars === 3) state.stats.perfectGames++;
  }

  function bumpStat(state, key, amount) {
    state.stats[key] = (state.stats[key] || 0) + (amount === undefined ? 1 : amount);
  }

  // ---- 主题 ----
  function themesUnlockedCount(state) {
    var cleared = levelsClearedCount(state);
    var n = 0;
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].unlockAt <= cleared) n++;
    return n;
  }

  function isThemeUnlocked(state, themeId) {
    var cleared = levelsClearedCount(state);
    for (var i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === themeId) return THEMES[i].unlockAt <= cleared;
    }
    return false;
  }

  function setTheme(state, themeId) {
    if (!isThemeUnlocked(state, themeId)) return false;
    state.theme = themeId;
    return true;
  }

  // ---- 成就 ----
  function checkAchievements(state) {
    var ctx = { themesUnlocked: themesUnlockedCount(state) };
    var newly = [];
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      var a = ACHIEVEMENTS[i];
      if (state.achievements[a.id]) continue;
      if (a.check(state, ctx)) {
        state.achievements[a.id] = true;
        addCoins(state, a.coins);
        newly.push(a);
      }
    }
    return newly;
  }

  return {
    VERSION: VERSION,
    KEY: KEY,
    TUNING: TUNING,
    REWARDS: REWARDS,
    FREE_MODE_FACTOR: FREE_MODE_FACTOR,
    SHOP: SHOP,
    THEMES: THEMES,
    ACHIEVEMENTS: ACHIEVEMENTS,
    defaultState: defaultState,
    load: load,
    save: save,
    xpForLevel: xpForLevel,
    xpProgress: xpProgress,
    gainXP: gainXP,
    addCoins: addCoins,
    coinsMultiplier: coinsMultiplier,
    cellReward: cellReward,
    lineReward: lineReward,
    gameReward: gameReward,
    shopItem: shopItem,
    upgradePrice: upgradePrice,
    priceOf: priceOf,
    buyUpgrade: buyUpgrade,
    hintsPerGame: hintsPerGame,
    mercyPerGame: mercyPerGame,
    headstartCount: headstartCount,
    hasAutoNotes: hasAutoNotes,
    starsForLevel: starsForLevel,
    isLevelUnlocked: isLevelUnlocked,
    levelsClearedCount: levelsClearedCount,
    recordLevelClear: recordLevelClear,
    recordFreeGame: recordFreeGame,
    bumpStat: bumpStat,
    themesUnlockedCount: themesUnlockedCount,
    isThemeUnlocked: isThemeUnlocked,
    setTheme: setTheme,
    checkAchievements: checkAchievements
  };
});
