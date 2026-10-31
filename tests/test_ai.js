import E from '../src/game/engine.js';
import Book from '../src/game/openings.js';
import AI from '../src/game/ai.js';

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  if (actual === expected) {
    passed++;
    console.log('通过  ' + name + ' => ' + actual);
  } else {
    failed++;
    console.log('失败  ' + name + ' => 实际 ' + actual + '，期望 ' + expected);
  }
}

function bestSan(fen, options) {
  const state = E.createState(fen);
  const result = AI.search(state, options || { depth: 3, timeLimit: 3000 });
  if (!result) return null;
  return E.moveToSan(state, result.move);
}

console.log('--- 战术测试 ---');
check('一步杀 Re8#', bestSan('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1'), 'Re8#');
check('白吃黑后', bestSan('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1'), 'Rxd5');
check('兵升变', bestSan('8/4P3/8/8/8/8/8/4K2k w - - 0 1'), 'e8=Q');
check('后吃 f7 杀', bestSan('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1'), 'Qxf7#');

console.log('--- 简单档不丢子 ---');
(function () {
  const capture = 'rnbqkb1r/pppppppp/5n2/7Q/8/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1';
  const state = E.createState(capture);
  const result = AI.search(state, Object.assign({ book: false }, AI.DIFFICULTIES.easy));
  check('简单档吃掉白后', result && E.alg(result.move.to), 'h5');

  const mate = '6k1/5ppp/8/8/8/8/8/R6K w - - 0 1';
  const mateState = E.createState(mate);
  const mateResult = AI.search(mateState, Object.assign({ book: false }, AI.DIFFICULTIES.easy));
  check('简单档看到一步杀', mateResult && E.alg(mateResult.move.from) + E.alg(mateResult.move.to), 'a1a8');
})();

console.log('--- 开局库 ---');
check('开局库线路数', AI.DIFFICULTIES && Book.size(), 22);
(function () {
  const state = E.createState();
  const first = AI.search(state, { depth: 3, timeLimit: 2000 });
  check('开局走库内着法', Boolean(first.book), true);
  check('开局着法在合理集合', ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'f2f4'].includes(E.alg(first.move.from) + E.alg(first.move.to)), true);
  E.makeMove(state, first.move);
  const second = AI.search(state, { depth: 3, timeLimit: 2000 });
  check('黑方也走库内着法', Boolean(second.book), true);
})();

console.log('--- 评估函数细节 ---');
(function () {
  const doubled = '4k3/8/8/8/8/P7/PPPP1PPP/R3K2R w KQ - 0 1';
  const normal = '4k3/8/8/8/8/8/PPPPPPPP/R3K2R w KQ - 0 1';
  check('叠兵比完整兵链低分', AI.evaluateFen(doubled) < AI.evaluateFen(normal), true);

  const lonely = '4k3/8/8/8/8/8/P6P/R3K2R w KQ - 0 1';
  const paired = '4k3/8/8/8/8/8/PP6/R3K2R w KQ - 0 1';
  check('孤兵比相邻兵低分', AI.evaluateFen(lonely) < AI.evaluateFen(paired), true);

  const shielded = '4k3/8/8/8/8/8/5PPP/R2Q1RK1 w - - 0 1';
  const away = '4k3/8/8/8/8/8/PPP5/R2Q1RK1 w - - 0 1';
  check('王前兵盾比兵远离王高分', AI.evaluateFen(shielded) > AI.evaluateFen(away), true);
})();

console.log('--- 搜索不污染棋盘 ---');
(function () {
  const mid = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  const state = E.createState(mid);
  const before = E.fenOf(state);
  AI.search(state, { depth: 10, timeLimit: 200, book: false });
  check('超时后局面完全还原', E.fenOf(state), before);
  check('超时后历史栈已清空', state.history.length, 0);
})();

console.log('--- 开局搜索 ---');
const start = Date.now();
const state = E.createState();
const result = AI.search(state, { depth: 3, timeLimit: 3000 });
const cost = Date.now() - start;
console.log('最佳着法 ' + E.moveToSan(state, result.move) + '，深度 ' + result.depth + '，节点 ' + result.nodes + '，耗时 ' + cost + ' 毫秒');
check('搜索返回合法着法', Boolean(E.findMove(E.createState(), result.move.from, result.move.to)), true);
check('搜索在时限内完成', cost < 6000, true);

console.log('--- 结果 ---');
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
process.exit(failed ? 1 : 0);
