(function (root, factory) {
  const api = factory();
  root.ChessOpenings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LINES = [
    { name: '意大利开局', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'] },
    { name: '西班牙开局', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4'] },
    { name: '苏格兰开局', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4'] },
    { name: '双马防御', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6'] },
    { name: '西西里防御', moves: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4'] },
    { name: '法国防御', moves: ['e2e4', 'e7e6', 'd2d4', 'd7d5'] },
    { name: '卡罗康防御', moves: ['e2e4', 'c7c6', 'd2d4', 'd7d5'] },
    { name: '斯堪的纳维亚防御', moves: ['e2e4', 'd7d5', 'e4d5', 'd8d5'] },
    { name: '阿廖欣防御', moves: ['e2e4', 'g8f6'] },
    { name: '现代防御', moves: ['e2e4', 'g7g6', 'd2d4', 'f8g7'] },
    { name: '王翼开局', moves: ['e2e4', 'e7e5', 'g1f3', 'g8f6'] },
    { name: '后翼弃兵', moves: ['d2d4', 'd7d5', 'c2c4', 'e7e6'] },
    { name: '接受后翼弃兵', moves: ['d2d4', 'd7d5', 'c2c4', 'd5c4'] },
    { name: '斯拉夫防御', moves: ['d2d4', 'd7d5', 'c2c4', 'c7c6'] },
    { name: '王印度防御', moves: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7'] },
    { name: '尼姆佐印度防御', moves: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4'] },
    { name: '荷兰防御', moves: ['d2d4', 'f7f5'] },
    { name: '伦敦体系', moves: ['d2d4', 'd7d5', 'g1f3', 'g8f6', 'c1f4'] },
    { name: '卡塔兰开局', moves: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g2g3', 'd7d5'] },
    { name: '英国式开局', moves: ['c2c4', 'e7e5', 'b1c3', 'g8f6'] },
    { name: '列蒂开局', moves: ['g1f3', 'd7d5', 'c2c4', 'e7e6'] },
    { name: '伯德开局', moves: ['f2f4', 'd7d5', 'g1f3', 'g7g6'] }
  ];

  const PROMOTION_TYPES = { q: 5, r: 4, b: 3, n: 2 };

  let table = null;
  let tableEngine = null;

  function build(engine) {
    if (table && tableEngine === engine) return table;

    const result = {};
    tableEngine = engine;

    for (const line of LINES) {
      const state = engine.createState();
      for (const uci of line.moves) {
        const key = engine.positionKey(state);
        const bucket = result[key] || (result[key] = []);
        const existing = bucket.find(function (item) { return item.uci === uci; });
        if (existing) {
          existing.weight += 1;
        } else {
          bucket.push({ uci: uci, weight: 1, line: line.name });
        }

        const from = engine.fromAlg(uci.slice(0, 2));
        const to = engine.fromAlg(uci.slice(2, 4));
        const promotion = uci.length > 4 ? PROMOTION_TYPES[uci[4]] : 0;
        const move = engine.findMove(state, from, to, promotion);
        if (!move) break;
        engine.makeMove(state, move);
      }
    }

    table = result;
    return table;
  }

  function lookup(engine, state) {
    const map = build(engine);
    const bucket = map[engine.positionKey(state)];
    if (!bucket || !bucket.length) return null;

    let total = 0;
    for (const item of bucket) total += item.weight;

    let pick = Math.random() * total;
    for (const item of bucket) {
      pick -= item.weight;
      if (pick <= 0) return item.uci;
    }
    return bucket[0].uci;
  }

  return {
    LINES,
    build,
    lookup,
    size: function () { return LINES.length; }
  };
});
