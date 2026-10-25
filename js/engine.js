(function (root, factory) {
  const api = factory();
  root.ChessEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WHITE = 1;
  const BLACK = -1;

  const EMPTY = 0;
  const PAWN = 1;
  const KNIGHT = 2;
  const BISHOP = 3;
  const ROOK = 4;
  const QUEEN = 5;
  const KING = 6;

  const FLAG_NORMAL = 0;
  const FLAG_DOUBLE = 1;
  const FLAG_EP = 2;
  const FLAG_KCASTLE = 3;
  const FLAG_QCASTLE = 4;

  const CASTLE_WK = 1;
  const CASTLE_WQ = 2;
  const CASTLE_BK = 4;
  const CASTLE_BQ = 8;

  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const KIWIPETE_FEN = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';

  const KNIGHT_OFFSETS = [33, 31, 18, 14, -14, -18, -31, -33];
  const BISHOP_DIRS = [17, 15, -15, -17];
  const ROOK_DIRS = [16, -16, 1, -1];
  const QUEEN_DIRS = [17, 16, 15, 1, -1, -15, -16, -17];

  const PIECE_CHARS = { 1: 'P', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K' };
  const CHAR_PIECES = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };

  function isOnBoard(sq) {
    return (sq & 0x88) === 0;
  }

  function fileOf(sq) {
    return sq & 7;
  }

  function rankOf(sq) {
    return sq >> 4;
  }

  function sqOf(rank, file) {
    return rank * 16 + file;
  }

  function alg(sq) {
    return 'abcdefgh'[fileOf(sq)] + (rankOf(sq) + 1);
  }

  function fromAlg(s) {
    return sqOf(Number(s[1]) - 1, s.charCodeAt(0) - 97);
  }

  function colorOf(piece) {
    return piece > 0 ? WHITE : BLACK;
  }

  function loadFen(fen, state) {
    const parts = String(fen).trim().split(/\s+/);
    const rows = parts[0].split('/');
    state.board.fill(EMPTY);
    state.kings[WHITE] = -1;
    state.kings[BLACK] = -1;
    for (let r = 0; r < 8; r++) {
      const rank = 7 - r;
      let file = 0;
      const row = rows[r] || '';
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') {
          file += Number(ch);
          continue;
        }
        const lower = ch.toLowerCase();
        const type = CHAR_PIECES[lower];
        if (!type) continue;
        const color = ch === lower ? BLACK : WHITE;
        const sq = sqOf(rank, file);
        state.board[sq] = color * type;
        if (type === KING) state.kings[color] = sq;
        file++;
      }
    }
    state.turn = parts[1] === 'b' ? BLACK : WHITE;
    state.castling = 0;
    const rights = parts[2] || '-';
    if (rights.includes('K')) state.castling |= CASTLE_WK;
    if (rights.includes('Q')) state.castling |= CASTLE_WQ;
    if (rights.includes('k')) state.castling |= CASTLE_BK;
    if (rights.includes('q')) state.castling |= CASTLE_BQ;
    state.ep = parts[3] && parts[3] !== '-' ? fromAlg(parts[3]) : -1;
    state.halfmove = parts[4] ? Number(parts[4]) : 0;
    state.fullmove = parts[5] ? Number(parts[5]) : 1;
    state.history = [];
    return state;
  }

  function createState(fen) {
    const state = {
      board: new Array(128).fill(EMPTY),
      turn: WHITE,
      castling: 0,
      ep: -1,
      halfmove: 0,
      fullmove: 1,
      kings: { 1: -1, '-1': -1 },
      history: []
    };
    return loadFen(fen || START_FEN, state);
  }

  function fenOf(state) {
    const rows = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = '';
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const p = state.board[sqOf(rank, file)];
        if (!p) {
          empty++;
        } else {
          if (empty) {
            row += empty;
            empty = 0;
          }
          row += p > 0 ? PIECE_CHARS[p] : PIECE_CHARS[-p].toLowerCase();
        }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    let cast = '';
    if (state.castling & CASTLE_WK) cast += 'K';
    if (state.castling & CASTLE_WQ) cast += 'Q';
    if (state.castling & CASTLE_BK) cast += 'k';
    if (state.castling & CASTLE_BQ) cast += 'q';
    return [
      rows.join('/'),
      state.turn === WHITE ? 'w' : 'b',
      cast || '-',
      state.ep >= 0 ? alg(state.ep) : '-',
      state.halfmove,
      state.fullmove
    ].join(' ');
  }

  function positionKey(state) {
    const fen = fenOf(state).split(' ');
    return fen.slice(0, 4).join(' ');
  }

  function makeMove(state, move) {
    const us = state.turn;
    const them = -us;
    const board = state.board;
    const piece = move.piece;
    const type = Math.abs(piece);

    state.history.push({
      move,
      captured: move.captured,
      castling: state.castling,
      ep: state.ep,
      halfmove: state.halfmove,
      kingsW: state.kings[WHITE],
      kingsB: state.kings[BLACK]
    });

    board[move.from] = EMPTY;

    if (move.flag === FLAG_EP) {
      board[move.to - 16 * us] = EMPTY;
    } else if (move.captured) {
      board[move.to] = EMPTY;
    }

    board[move.to] = move.promotion ? move.promotion * us : piece;

    if (move.flag === FLAG_KCASTLE) {
      board[move.to + 1] = EMPTY;
      board[move.to - 1] = us * ROOK;
    } else if (move.flag === FLAG_QCASTLE) {
      board[move.to - 2] = EMPTY;
      board[move.to + 1] = us * ROOK;
    }

    if (type === KING) state.kings[us] = move.to;

    if (type === KING) {
      state.castling &= us === WHITE ? ~(CASTLE_WK | CASTLE_WQ) : ~(CASTLE_BK | CASTLE_BQ);
    }
    if (move.from === 0 || move.to === 0) state.castling &= ~CASTLE_WQ;
    if (move.from === 7 || move.to === 7) state.castling &= ~CASTLE_WK;
    if (move.from === 112 || move.to === 112) state.castling &= ~CASTLE_BQ;
    if (move.from === 119 || move.to === 119) state.castling &= ~CASTLE_BK;

    state.ep = move.flag === FLAG_DOUBLE ? move.from + 16 * us : -1;
    state.halfmove = type === PAWN || move.captured ? 0 : state.halfmove + 1;
    if (us === BLACK) state.fullmove++;
    state.turn = them;
  }

  function unmakeMove(state) {
    const undo = state.history.pop();
    if (!undo) return;
    const move = undo.move;
    const us = state.turn === WHITE ? BLACK : WHITE;
    const board = state.board;

    board[move.to] = EMPTY;
    board[move.from] = move.piece;

    if (undo.captured && move.flag !== FLAG_EP) {
      board[move.to] = undo.captured;
    }
    if (move.flag === FLAG_EP) {
      board[move.to - 16 * us] = -us * PAWN;
    }
    if (move.flag === FLAG_KCASTLE) {
      board[move.to + 1] = us * ROOK;
      board[move.to - 1] = EMPTY;
    } else if (move.flag === FLAG_QCASTLE) {
      board[move.to - 2] = us * ROOK;
      board[move.to + 1] = EMPTY;
    }

    state.castling = undo.castling;
    state.ep = undo.ep;
    state.halfmove = undo.halfmove;
    if (us === BLACK) state.fullmove--;
    state.kings[WHITE] = undo.kingsW;
    state.kings[BLACK] = undo.kingsB;
    state.turn = us;
  }

  function isAttacked(board, sq, by) {
    const pawnFrom = by === WHITE ? -16 : 16;
    let i = sq + pawnFrom - 1;
    if (isOnBoard(i) && board[i] === by * PAWN) return true;
    i = sq + pawnFrom + 1;
    if (isOnBoard(i) && board[i] === by * PAWN) return true;

    for (const off of KNIGHT_OFFSETS) {
      const t = sq + off;
      if (isOnBoard(t) && board[t] === by * KNIGHT) return true;
    }

    for (const off of QUEEN_DIRS) {
      const t = sq + off;
      if (isOnBoard(t) && board[t] === by * KING) return true;
    }

    for (const dir of BISHOP_DIRS) {
      for (let t = sq + dir; isOnBoard(t); t += dir) {
        const p = board[t];
        if (!p) continue;
        if (p === by * BISHOP || p === by * QUEEN) return true;
        break;
      }
    }

    for (const dir of ROOK_DIRS) {
      for (let t = sq + dir; isOnBoard(t); t += dir) {
        const p = board[t];
        if (!p) continue;
        if (p === by * ROOK || p === by * QUEEN) return true;
        break;
      }
    }

    return false;
  }

  function inCheck(state, color) {
    const kingSq = state.kings[color];
    if (kingSq < 0) return false;
    return isAttacked(state.board, kingSq, -color);
  }

  function makeMoveObj(from, to, piece, captured, promotion, flag) {
    return {
      from,
      to,
      piece,
      captured: captured || 0,
      promotion: promotion || 0,
      flag: flag || FLAG_NORMAL
    };
  }

  function addPawnMove(moves, from, to, piece, captured, color) {
    const promoRank = color === WHITE ? 7 : 0;
    if (rankOf(to) === promoRank) {
      for (const type of [QUEEN, ROOK, BISHOP, KNIGHT]) {
        moves.push(makeMoveObj(from, to, piece, captured, type, FLAG_NORMAL));
      }
    } else {
      moves.push(makeMoveObj(from, to, piece, captured, 0, FLAG_NORMAL));
    }
  }

  function generateMoves(state, capturesOnly) {
    const moves = [];
    const us = state.turn;
    const them = -us;
    const board = state.board;

    for (let sq = 0; sq < 128; sq++) {
      if ((sq & 0x88) !== 0) continue;
      const piece = board[sq];
      if (!piece || colorOf(piece) !== us) continue;
      const type = Math.abs(piece);

      if (type === PAWN) {
        const dir = us * 16;
        const one = sq + dir;
        if (!capturesOnly && isOnBoard(one) && board[one] === EMPTY) {
          addPawnMove(moves, sq, one, piece, 0, us);
          const startRank = us === WHITE ? 1 : 6;
          const two = sq + dir * 2;
          if (rankOf(sq) === startRank && board[two] === EMPTY) {
            moves.push(makeMoveObj(sq, two, piece, 0, 0, FLAG_DOUBLE));
          }
        }
        for (const dc of [-1, 1]) {
          const to = sq + dir + dc;
          if (!isOnBoard(to)) continue;
          const target = board[to];
          if (target && colorOf(target) === them) {
            addPawnMove(moves, sq, to, piece, target, us);
          } else if (to === state.ep) {
            moves.push(makeMoveObj(sq, to, piece, them * PAWN, 0, FLAG_EP));
          }
        }
      } else if (type === KNIGHT || type === KING) {
        const offsets = type === KNIGHT ? KNIGHT_OFFSETS : QUEEN_DIRS;
        for (const off of offsets) {
          const to = sq + off;
          if (!isOnBoard(to)) continue;
          const target = board[to];
          if (target && colorOf(target) === us) continue;
          if (capturesOnly && !target) continue;
          moves.push(makeMoveObj(sq, to, piece, target, 0, FLAG_NORMAL));
        }
      } else {
        const dirs = type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : QUEEN_DIRS;
        for (const dir of dirs) {
          for (let to = sq + dir; isOnBoard(to); to += dir) {
            const target = board[to];
            if (!target) {
              if (!capturesOnly) moves.push(makeMoveObj(sq, to, piece, 0, 0, FLAG_NORMAL));
              continue;
            }
            if (colorOf(target) === them) moves.push(makeMoveObj(sq, to, piece, target, 0, FLAG_NORMAL));
            break;
          }
        }
      }
    }

    if (!capturesOnly) {
      if (us === WHITE) {
        if ((state.castling & CASTLE_WK) && board[5] === EMPTY && board[6] === EMPTY &&
            !isAttacked(board, 4, BLACK) && !isAttacked(board, 5, BLACK) &&
            board[7] === WHITE * ROOK && board[4] === WHITE * KING) {
          moves.push(makeMoveObj(4, 6, WHITE * KING, 0, 0, FLAG_KCASTLE));
        }
        if ((state.castling & CASTLE_WQ) && board[3] === EMPTY && board[2] === EMPTY && board[1] === EMPTY &&
            !isAttacked(board, 4, BLACK) && !isAttacked(board, 3, BLACK) &&
            board[0] === WHITE * ROOK && board[4] === WHITE * KING) {
          moves.push(makeMoveObj(4, 2, WHITE * KING, 0, 0, FLAG_QCASTLE));
        }
      } else {
        if ((state.castling & CASTLE_BK) && board[117] === EMPTY && board[118] === EMPTY &&
            !isAttacked(board, 116, WHITE) && !isAttacked(board, 117, WHITE) &&
            board[119] === BLACK * ROOK && board[116] === BLACK * KING) {
          moves.push(makeMoveObj(116, 118, BLACK * KING, 0, 0, FLAG_KCASTLE));
        }
        if ((state.castling & CASTLE_BQ) && board[115] === EMPTY && board[114] === EMPTY && board[113] === EMPTY &&
            !isAttacked(board, 116, WHITE) && !isAttacked(board, 115, WHITE) &&
            board[112] === BLACK * ROOK && board[116] === BLACK * KING) {
          moves.push(makeMoveObj(116, 114, BLACK * KING, 0, 0, FLAG_QCASTLE));
        }
      }
    }

    return moves;
  }

  function generateLegalMoves(state, capturesOnly) {
    const us = state.turn;
    const pseudo = generateMoves(state, capturesOnly);
    const legal = [];
    for (const move of pseudo) {
      makeMove(state, move);
      if (!inCheck(state, us)) legal.push(move);
      unmakeMove(state);
    }
    return legal;
  }

  function insufficientMaterial(state) {
    const pieces = [];
    for (let sq = 0; sq < 128; sq++) {
      if ((sq & 0x88) !== 0) continue;
      const p = state.board[sq];
      if (!p) continue;
      const type = Math.abs(p);
      if (type === KING) continue;
      pieces.push({ type, color: colorOf(p), sq });
    }
    if (pieces.length === 0) return true;
    if (pieces.length === 1 && (pieces[0].type === KNIGHT || pieces[0].type === BISHOP)) return true;
    if (pieces.length === 2 && pieces[0].type === BISHOP && pieces[1].type === BISHOP &&
        pieces[0].color !== pieces[1].color) {
      const a = (fileOf(pieces[0].sq) + rankOf(pieces[0].sq)) % 2;
      const b = (fileOf(pieces[1].sq) + rankOf(pieces[1].sq)) % 2;
      if (a === b) return true;
    }
    return false;
  }

  function gameStatus(state, repetitionCount) {
    const legal = generateLegalMoves(state);
    const check = inCheck(state, state.turn);
    if (!legal.length) {
      if (check) {
        return { over: true, result: state.turn === WHITE ? 'black' : 'white', reason: 'checkmate', check: true };
      }
      return { over: true, result: 'draw', reason: 'stalemate', check: false };
    }
    if (state.halfmove >= 100) return { over: true, result: 'draw', reason: 'fifty', check };
    if (insufficientMaterial(state)) return { over: true, result: 'draw', reason: 'material', check };
    if (repetitionCount >= 3) return { over: true, result: 'draw', reason: 'repetition', check };
    return { over: false, result: null, reason: null, check };
  }

  function moveToSan(state, move, skipCheckSuffix) {
    const type = Math.abs(move.piece);
    let san;

    if (move.flag === FLAG_KCASTLE) {
      san = 'O-O';
    } else if (move.flag === FLAG_QCASTLE) {
      san = 'O-O-O';
    } else if (type === PAWN) {
      san = move.captured ? 'abcdefgh'[fileOf(move.from)] + 'x' + alg(move.to) : alg(move.to);
      if (move.promotion) san += '=' + PIECE_CHARS[move.promotion];
    } else {
      const legal = generateLegalMoves(state);
      const rivals = legal.filter(function (m) {
        return m.to === move.to && Math.abs(m.piece) === type && m.from !== move.from;
      });
      let disamb = '';
      if (rivals.length) {
        const sameFile = rivals.some(function (m) { return fileOf(m.from) === fileOf(move.from); });
        const sameRank = rivals.some(function (m) { return rankOf(m.from) === rankOf(move.from); });
        if (!sameFile) disamb = 'abcdefgh'[fileOf(move.from)];
        else if (!sameRank) disamb = String(rankOf(move.from) + 1);
        else disamb = alg(move.from);
      }
      san = PIECE_CHARS[type] + disamb + (move.captured ? 'x' : '') + alg(move.to);
    }

    if (skipCheckSuffix) return san;

    makeMove(state, move);
    const check = inCheck(state, state.turn);
    if (check) {
      san += generateLegalMoves(state).length ? '+' : '#';
    }
    unmakeMove(state);
    return san;
  }

  function perft(state, depth) {
    if (depth === 0) return 1;
    const moves = generateLegalMoves(state);
    if (depth === 1) return moves.length;
    let nodes = 0;
    for (const move of moves) {
      makeMove(state, move);
      nodes += perft(state, depth - 1);
      unmakeMove(state);
    }
    return nodes;
  }

  function findMove(state, from, to, promotion) {
    const legal = generateLegalMoves(state);
    return legal.find(function (m) {
      return m.from === from && m.to === to && (!promotion || m.promotion === promotion);
    }) || null;
  }

  return {
    WHITE, BLACK, EMPTY, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
    FLAG_NORMAL, FLAG_DOUBLE, FLAG_EP, FLAG_KCASTLE, FLAG_QCASTLE,
    CASTLE_WK, CASTLE_WQ, CASTLE_BK, CASTLE_BQ,
    START_FEN, KIWIPETE_FEN,
    PIECE_CHARS, CHAR_PIECES,
    createState, loadFen, fenOf, positionKey,
    makeMove, unmakeMove,
    isOnBoard, fileOf, rankOf, sqOf, alg, fromAlg, colorOf, isAttacked, inCheck,
    generateMoves, generateLegalMoves, gameStatus, insufficientMaterial,
    moveToSan, perft, findMove
  };
});
