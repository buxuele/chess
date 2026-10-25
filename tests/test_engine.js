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

function checkTrue(name, value) {
  check(name, Boolean(value), true);
}

console.log('--- 初始局面 perft ---');
let s = E.createState();
check('perft(1)', E.perft(s, 1), 20);
check('perft(2)', E.perft(s, 2), 400);
check('perft(3)', E.perft(s, 3), 8902);

console.log('--- Kiwipete perft ---');
s = E.createState(E.KIWIPETE_FEN);
check('perft(1)', E.perft(s, 1), 48);
check('perft(2)', E.perft(s, 2), 2039);
check('perft(3)', E.perft(s, 3), 97862);

console.log('--- FEN 往返 ---');
s = E.createState(E.KIWIPETE_FEN);
check('fen 往返一致', E.fenOf(s), E.KIWIPETE_FEN);

console.log('--- 特殊走法 ---');
s = E.createState('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
const castles = E.generateLegalMoves(s).filter(function (m) {
  return m.flag === E.FLAG_KCASTLE || m.flag === E.FLAG_QCASTLE;
});
check('白方两处易位可用', castles.length, 2);
const castling = castles.find(function (m) { return m.flag === E.FLAG_KCASTLE; });
const sanCastle = E.moveToSan(s, castling);
check('王翼易位 SAN', sanCastle, 'O-O');

s = E.createState('8/8/8/4k3/8/8/3p4/K7 w - - 0 1');
s.turn = E.BLACK;
const promoMoves = E.generateLegalMoves(s).filter(function (m) { return m.promotion; });
check('升变生成四种', promoMoves.length, 4);

s = E.createState('8/8/8/3pP3/8/8/8/4K2k w - d6 0 1');
const epMoves = E.generateLegalMoves(s).filter(function (m) { return m.flag === E.FLAG_EP; });
check('吃过路兵可用', epMoves.length, 1);

console.log('--- 将杀与逼和 ---');
s = E.createState('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
const fool = E.gameStatus(s);
check('愚人将杀判负', fool.reason, 'checkmate');
check('愚人将杀结果', fool.result, 'black');

s = E.createState('7k/8/6Q1/8/8/8/8/7K b - - 0 1');
const stale = E.gameStatus(s);
check('逼和判定', stale.reason, 'stalemate');

s = E.createState('8/8/8/8/8/8/8/K6k w - - 0 1');
const bare = E.gameStatus(s);
check('裸王和棋', bare.reason, 'material');

console.log('--- 子力不足细化 ---');
const KNK = E.createState('4k3/3n4/8/8/8/8/3N4/4K3 w - - 0 1');
checkTrue('马对马不判和', !E.insufficientMaterial(KNK));
const KBKB_SAME = E.createState('4k3/5b2/8/8/2B5/8/8/4K3 w - - 0 1');
checkTrue('同色双象判和', E.insufficientMaterial(KBKB_SAME));
const KBKB_OPP = E.createState('4k3/5b2/8/8/7B/8/8/4K3 w - - 0 1');
checkTrue('异色双象不判和', !E.insufficientMaterial(KBKB_OPP));

console.log('--- 悔棋还原 ---');
s = E.createState();
const before = E.fenOf(s);
for (const move of E.generateLegalMoves(s).slice(0, 5)) {
  E.makeMove(s, move);
}
while (s.history.length) E.unmakeMove(s);
check('连续悔棋后 FEN 一致', E.fenOf(s), before);

console.log('--- 结果 ---');
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
process.exit(failed ? 1 : 0);
