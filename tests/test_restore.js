'use strict';

const path = require('path');
const E = require(path.join(__dirname, '..', 'js', 'engine.js'));

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

function serialize(move) {
  return { f: move.from, t: move.to, p: move.promotion, l: move.flag };
}

function replay(fen, serialized) {
  const state = E.createState(fen);
  for (const mv of serialized) {
    const m = E.findMove(state, mv.f, mv.t, mv.p || 0);
    if (!m) return null;
    E.makeMove(state, m);
  }
  return state;
}

let state = E.createState();
console.log('--- 恢复重放：常规对局 ---');
const seq = [];
const real = E.createState();
for (const [from, to] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6']]) {
  const m = E.findMove(real, E.fromAlg(from), E.fromAlg(to), 0);
  seq.push(serialize(m));
  E.makeMove(real, m);
}
const back = replay(E.START_FEN, seq);
check('普通四步重放 FEN 一致', E.fenOf(back), E.fenOf(real));

console.log('--- 恢复重放：易位 ---');
state = E.createState('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
const target = E.createState('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
const seqC = [];
const oo = E.generateLegalMoves(state).find(function (m) { return m.flag === E.FLAG_KCASTLE; });
seqC.push(serialize(oo));
E.makeMove(target, oo);
const qoo = E.generateLegalMoves(target).find(function (m) { return m.flag === E.FLAG_QCASTLE; });
seqC.push(serialize(qoo));
E.makeMove(target, qoo);
const backC = replay('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', seqC);
check('双侧易位重放 FEN 一致', E.fenOf(backC), E.fenOf(target));
check('重放后易位权消耗', backC.castling, 0);

console.log('--- 恢复重放：吃过路兵 ---');
const epFen = '8/8/8/3pP3/8/8/8/4K2k w - d6 0 1';
const epState = E.createState(epFen);
const seqE = [];
const ep = E.generateLegalMoves(epState).find(function (m) { return m.flag === E.FLAG_EP; });
seqE.push(serialize(ep));
E.makeMove(epState, ep);
const backE = replay(epFen, seqE);
check('吃过路兵重放 FEN 一致', E.fenOf(backE), E.fenOf(epState));

console.log('--- 恢复重放：升变 ---');
const promoFen = '8/4P3/8/8/8/8/8/4K2k w - - 0 1';
const promoReal = E.createState(promoFen);
const seqP = [];
const pm = E.generateLegalMoves(promoReal).find(function (m) { return m.promotion === E.KNIGHT; });
seqP.push(serialize(pm));
E.makeMove(promoReal, pm);
const backP = replay(promoFen, seqP);
check('升变马重放 FEN 一致', E.fenOf(backP), E.fenOf(promoReal));

console.log('--- 重放容错：非法序列返回空 ---');
check('坏序列重放失败', replay(E.START_FEN, [{ f: 20, t: 20, p: 0, l: 0 }]), null);

console.log('--- 结果 ---');
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
process.exit(failed ? 1 : 0);
