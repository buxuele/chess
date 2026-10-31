(function (root, factory) {
  const api = factory(root.ChessEngine, root.ChessOpenings);
  root.ChessAI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E, Book) {
  'use strict';

  if (!Book && typeof module !== 'undefined' && module.exports) {
    try {
      Book = require('./openings.js');
    } catch (err) {
      Book = null;
    }
  }

  const MATE = 100000;
  const VALUE = { 1: 100, 2: 320, 3: 330, 4: 500, 5: 900, 6: 20000 };

  const PST = {
    1: [
       0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
       5,  5, 10, 25, 25, 10,  5,  5,
       0,  0,  0, 20, 20,  0,  0,  0,
       5, -5,-10,  0,  0,-10, -5,  5,
       5, 10, 10,-20,-20, 10, 10,  5,
       0,  0,  0,  0,  0,  0,  0,  0
    ],
    2: [
     -50,-40,-30,-30,-30,-30,-40,-50,
     -40,-20,  0,  0,  0,  0,-20,-40,
     -30,  0, 10, 15, 15, 10,  0,-30,
     -30,  5, 15, 20, 20, 15,  5,-30,
     -30,  0, 15, 20, 20, 15,  0,-30,
     -30,  5, 10, 15, 15, 10,  5,-30,
     -40,-20,  0,  5,  5,  0,-20,-40,
     -50,-40,-30,-30,-30,-30,-40,-50
    ],
    3: [
     -20,-10,-10,-10,-10,-10,-10,-20,
     -10,  0,  0,  0,  0,  0,  0,-10,
     -10,  0,  5, 10, 10,  5,  0,-10,
     -10,  5,  5, 10, 10,  5,  5,-10,
     -10,  0, 10, 10, 10, 10,  0,-10,
     -10, 10, 10, 10, 10, 10, 10,-10,
     -10,  5,  0,  0,  0,  0,  5,-10,
     -20,-10,-10,-10,-10,-10,-10,-20
    ],
    4: [
       0,  0,  0,  0,  0,  0,  0,  0,
       5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
       0,  0,  0,  5,  5,  0,  0,  0
    ],
    5: [
     -20,-10,-10, -5, -5,-10,-10,-20,
     -10,  0,  0,  0,  0,  0,  0,-10,
     -10,  0,  5,  5,  5,  5,  0,-10,
      -5,  0,  5,  5,  5,  5,  0, -5,
       0,  0,  5,  5,  5,  5,  0, -5,
     -10,  5,  5,  5,  5,  5,  0,-10,
     -10,  0,  5,  0,  0,  0,  0,-10,
     -20,-10,-10, -5, -5,-10,-10,-20
    ],
    6: [
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -20,-30,-30,-40,-40,-30,-30,-20,
     -10,-20,-20,-20,-20,-20,-20,-10,
      20, 20,  0,  0,  0,  0, 20, 20,
      20, 30, 10,  0,  0, 10, 30, 20
    ]
  };

  const PST_END_KING = [
    -50,-30,-30,-30,-30,-30,-30,-50,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -50,-40,-30,-20,-20,-30,-40,-50
  ];

  const DIFFICULTIES = {
    easy: { depth: 2, timeLimit: 700, randomness: 80, uniformBook: true },
    normal: { depth: 8, timeLimit: 1000, randomness: 0 },
    hard: { depth: 12, timeLimit: 2600, randomness: 0 }
  };

  const PAWN_COUNT = [new Uint8Array(8), new Uint8Array(8)];
  const HISTORY = new Int32Array(128 * 128);
  const PROMOTION_TYPES = { q: 5, r: 4, b: 3, n: 2 };

  let nodes = 0;
  let deadline = 0;
  let killers = [];

  function moveKey(move) {
    return move.from * 128 + move.to;
  }

  function evaluate(state) {
    const board = state.board;
    const pawnsA = PAWN_COUNT[0];
    const pawnsB = PAWN_COUNT[1];
    pawnsA.fill(0);
    pawnsB.fill(0);

    let score = 0;
    let material = 0;
    let bishopsA = 0;
    let bishopsB = 0;
    let pawnMaskA = 0;
    let pawnMaskB = 0;

    for (let sq = 0; sq < 128; sq++) {
      if ((sq & 0x88) !== 0) continue;
      const p = board[sq];
      if (!p) continue;
      const type = p > 0 ? p : -p;
      if (type === 6) continue;

      const color = p > 0 ? 1 : -1;
      const file = sq & 7;
      const rank = sq >> 4;
      const index = color === 1 ? (7 - rank) * 8 + file : rank * 8 + file;
      score += color * (VALUE[type] + PST[type][index]);

      if (type === 1) {
        if (color === 1) {
          pawnsA[file] += 1;
          pawnMaskA |= 1 << file;
        } else {
          pawnsB[file] += 1;
          pawnMaskB |= 1 << file;
        }
      } else {
        material += VALUE[type];
        if (type === 3) {
          if (color === 1) bishopsA++;
          else bishopsB++;
        }
      }
    }

    if (bishopsA >= 2) score += 28;
    if (bishopsB >= 2) score -= 28;

    const pawns = [pawnsA, pawnsB];
    const masks = [pawnMaskA, pawnMaskB];
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? 1 : -1;
      const mine = pawns[side];
      const theirs = masks[1 - side];
      let structure = 0;

      for (let file = 0; file < 8; file++) {
        const count = mine[file];
        if (!count) continue;
        if (count > 1) structure -= 14 * (count - 1);

        const left = file > 0 ? mine[file - 1] : 0;
        const right = file < 7 ? mine[file + 1] : 0;
        if (!left && !right) structure -= 16;

        let nearby = 1 << file;
        if (file > 0) nearby |= 1 << (file - 1);
        if (file < 7) nearby |= 1 << (file + 1);
        if ((theirs & nearby) === 0) structure += 12;
      }

      score += sign * structure;
    }

    const endgame = material < 1400;
    const kingSquares = [state.kings[1], state.kings[-1]];
    for (let side = 0; side < 2; side++) {
      const sq = kingSquares[side];
      if (sq < 0) continue;
      const color = side === 0 ? 1 : -1;
      const file = sq & 7;
      const rank = sq >> 4;
      const index = color === 1 ? (7 - rank) * 8 + file : rank * 8 + file;

      if (endgame) {
        score += color * PST_END_KING[index];
        continue;
      }

      score += color * PST[6][index];

      const forward = color === 1 ? 1 : -1;
      const shieldRank = rank + forward;
      if (shieldRank >= 0 && shieldRank <= 7) {
        let shield = 0;
        for (let df = -1; df <= 1; df++) {
          const f = file + df;
          if (f < 0 || f > 7) continue;
          shield += board[shieldRank * 16 + f] === color * 1 ? 10 : -6;
        }
        score += color * shield;
      }
    }

    return state.turn === 1 ? score : -score;
  }

  function orderMoves(moves, ply) {
    const list = killers[ply];
    const k1 = list ? list[0] : -1;
    const k2 = list ? list[1] : -1;

    for (const m of moves) {
      const key = moveKey(m);
      let s = 0;
      if (m.captured) {
        s = 100000 + VALUE[Math.abs(m.captured)] * 10 - VALUE[Math.abs(m.piece)];
      }
      if (m.promotion) s += 90000 + VALUE[m.promotion];
      if (!m.captured) {
        if (key === k1) s += 50000;
        else if (key === k2) s += 40000;
        s += HISTORY[key];
      }
      m._score = s;
    }

    moves.sort(function (a, b) { return b._score - a._score; });
  }

  function checkTime() {
    nodes++;
    if ((nodes & 511) === 0 && Date.now() > deadline) throw 'timeout';
  }

  function quiesce(state, alpha, beta, ply) {
    checkTime();
    const stand = evaluate(state);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (ply > 20) return alpha;

    const moves = E.generateLegalMoves(state, true);
    orderMoves(moves, ply);
    for (const move of moves) {
      E.makeMove(state, move);
      const score = -quiesce(state, -beta, -alpha, ply + 1);
      E.unmakeMove(state);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function negamax(state, depth, alpha, beta, ply) {
    checkTime();
    if (state.halfmove >= 100) return 0;
    if (depth <= 0) return quiesce(state, alpha, beta, ply);

    const moves = E.generateLegalMoves(state);
    if (!moves.length) {
      return E.inCheck(state, state.turn) ? -MATE + ply : 0;
    }

    orderMoves(moves, ply);
    let best = -MATE * 2;
    for (const move of moves) {
      E.makeMove(state, move);
      const score = -negamax(state, depth - 1, -beta, -alpha, ply + 1);
      E.unmakeMove(state);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (!move.captured && !move.promotion) {
          const list = killers[ply] || (killers[ply] = [-1, -1]);
          const key = moveKey(move);
          if (list[0] !== key) {
            list[1] = list[0];
            list[0] = key;
          }
          const next = HISTORY[key] + depth * depth;
          HISTORY[key] = next > 40000 ? 40000 : next;
        }
        break;
      }
    }
    return best;
  }

  function bookMove(rootMoves, state, uniform) {
    if (!Book || typeof Book.lookup !== 'function') return null;
    const uci = Book.lookup(E, state, uniform);
    if (!uci) return null;
    const from = E.fromAlg(uci.slice(0, 2));
    const to = E.fromAlg(uci.slice(2, 4));
    const promotion = uci.length > 4 ? PROMOTION_TYPES[uci[4]] : 0;
    return rootMoves.find(function (m) {
      return m.from === from && m.to === to && (!promotion || m.promotion === promotion);
    }) || null;
  }

  function search(state, options) {
    const opts = options || {};
    const depth = Math.max(1, opts.depth || 3);
    const timeLimit = Math.max(200, opts.timeLimit || 2000);
    const randomness = opts.randomness || 0;
    const rootMoves = E.generateLegalMoves(state);

    if (!rootMoves.length) return null;
    if (rootMoves.length === 1) {
      return { move: rootMoves[0], score: 0, depth: 0, nodes: 1 };
    }

    if (opts.book !== false) {
      const fromBook = bookMove(rootMoves, state, opts.uniformBook === true);
      if (fromBook) {
        return { move: fromBook, score: 0, depth: 0, nodes: 1, book: true };
      }
    }

    nodes = 0;
    deadline = Date.now() + timeLimit;
    killers = [];
    HISTORY.fill(0);
    const baseHistory = state.history.length;

    const entries = rootMoves.map(function (move) {
      return { move: move, score: -Infinity, d: 0, prev: -Infinity };
    });

    let completed = 0;
    try {
      for (let d = 1; d <= depth; d++) {
        entries.sort(function (a, b) { return b.score - a.score; });
        for (const entry of entries) entry.prev = entry.score;

        let alpha = -MATE * 2;
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          E.makeMove(state, entry.move);
          let score;
          if (randomness > 0 || i === 0) {
            score = -negamax(state, d - 1, -MATE * 2, MATE * 2, 1);
          } else {
            score = -negamax(state, d - 1, -alpha - 1, -alpha, 1);
            if (score > alpha) {
              score = -negamax(state, d - 1, -MATE * 2, -alpha, 1);
            }
          }
          E.unmakeMove(state);
          entry.score = score;
          entry.d = d;
          if (score > alpha) alpha = score;
          if (Date.now() > deadline) throw 'timeout';
        }
        completed = d;
      }
    } catch (err) {
      while (state.history.length > baseHistory) E.unmakeMove(state);
      if (err !== 'timeout') throw err;
      if (completed > 0) {
        for (const entry of entries) {
          if (entry.d === completed + 1) {
            entry.score = entry.prev;
            entry.d = completed;
          }
        }
      }
    }

    entries.sort(function (a, b) { return b.score - a.score; });

    let chosen = entries[0];
    if (randomness > 0) {
      const top = entries[0].score;
      const pool = entries.filter(function (entry) {
        return !entry.move.captured && top - entry.score <= randomness;
      });
      if (pool.length) {
        chosen = pool[Math.floor(Math.random() * pool.length)];
      }
    }

    return {
      move: chosen.move,
      score: chosen.score,
      depth: completed,
      nodes: nodes
    };
  }

  function evaluateFen(fen) {
    return evaluate(E.createState(fen));
  }

  return {
    MATE,
    VALUE,
    PST,
    PST_END_KING,
    DIFFICULTIES,
    evaluate,
    evaluateFen,
    search
  };
});
