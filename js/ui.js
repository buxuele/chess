(function () {
  'use strict';

  const E = window.ChessEngine;
  const Pieces = window.ChessPieces;
  const AI = window.ChessAI;

  const DIFFICULTY_LABEL = { easy: '简单', normal: '普通', hard: '困难' };
  const REASON_TEXT = {
    checkmate: '将杀',
    stalemate: '逼和',
    fifty: '五十回合规则',
    material: '子力不足',
    repetition: '三次重复局面',
    resign: '一方认输',
    timeout: '超时'
  };
  const HIST_PAGE_ROWS = 15;
  const SETTINGS_KEY = 'chess.settings.v1';
  const GAME_KEY = 'chess.game.v1';
  const PIECE_NAMES = { 1: '兵', 2: '马', 3: '象', 4: '车', 5: '后', 6: '王' };

  const boardEl = document.getElementById('board');
  const statusLive = document.getElementById('statusLive');
  const overlay = document.getElementById('boardOverlay');
  const resultTitle = document.getElementById('resultTitle');
  const resultReason = document.getElementById('resultReason');
  const toastEl = document.getElementById('toast');
  const promoModal = document.getElementById('promoModal');
  const promoGrid = document.getElementById('promoGrid');
  const settingsModal = document.getElementById('settingsModal');
  const modeGroup = document.getElementById('modeGroup');
  const sideGroup = document.getElementById('sideGroup');
  const difficultyGroup = document.getElementById('difficultyGroup');
  const themeGroup = document.getElementById('themeGroup');
  const soundToggle = document.getElementById('soundToggle');
  const historyDrawer = document.getElementById('historyDrawer');
  const historyOpen = document.getElementById('historyOpen');
  const historyClose = document.getElementById('historyClose');
  const historyMoves = document.getElementById('historyMoves');
  const historyCount = document.getElementById('historyCount');
  const historyPager = document.getElementById('historyPager');

  const strips = {
    top: {
      root: document.getElementById('topPlayer'),
      name: document.getElementById('topName'),
      state: document.getElementById('topState'),
      captures: document.getElementById('topCaptures')
    },
    bottom: {
      root: document.getElementById('bottomPlayer'),
      name: document.getElementById('bottomName'),
      state: document.getElementById('bottomState'),
      captures: document.getElementById('bottomCaptures')
    }
  };

  const game = {
    engine: E.createState(),
    mode: 'ai',
    difficulty: 'normal',
    humanColor: E.WHITE,
    flipped: false,
    theme: 'olive',
    selected: -1,
    legal: [],
    lastMove: null,
    sanList: [],
    positionKeys: [],
    thinking: false,
    gameOver: false,
    status: null,
    sound: true,
    hint: null,
    captured: { 1: [], '-1': [] },
    newArmed: false,
    requestSeq: 0,
    activeRequest: 0,
    hintRequest: 0,
    aiStart: 0,
    aiThinkTarget: 600,
    resignArmed: false,
    resultShown: false
  };

  let arriveSq = -1;
  let pendingAnim = null;
  let kbSquare = -1;
  let dragState = null;
  let promoResolve = null;
  let aiWorker = null;
  let toastTimer = null;
  let resignTimer = null;
  let newGameTimer = null;
  let hintFen = '';
  let histPage = 0;
  let hintTimer = null;

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.mode === 'ai' || saved.mode === 'human') game.mode = saved.mode;
      if (DIFFICULTY_LABEL[saved.difficulty]) game.difficulty = saved.difficulty;
      if (typeof saved.sound === 'boolean') game.sound = saved.sound;
      if (typeof saved.flipped === 'boolean') game.flipped = saved.flipped;
      if (saved.side === 'black') {
        game.humanColor = E.BLACK;
        game.flipped = true;
      }
      if (saved.theme === 'melon') game.theme = 'melon';
    } catch (err) {
      console.warn('设置读取失败', err);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        mode: game.mode,
        difficulty: game.difficulty,
        sound: game.sound,
        flipped: game.flipped,
        side: game.humanColor === E.BLACK ? 'black' : 'white',
        theme: game.theme
      }));
    } catch (err) {
      console.warn('设置保存失败', err);
    }
  }

  function saveGame() {
    try {
      localStorage.setItem(GAME_KEY, JSON.stringify({
        fen: E.fenOf(game.engine),
        sans: game.sanList.map(function (x) { return x.san; }),
        moves: game.sanList.map(function (x) {
          return x.move
            ? { f: x.move.from, t: x.move.to, p: x.move.promotion, l: x.move.flag }
            : null;
        }),
        last: game.lastMove,
        keys: game.positionKeys
      }));
    } catch (err) {
      console.warn('棋局保存失败', err);
    }
  }

  function clearGame() {
    try {
      localStorage.removeItem(GAME_KEY);
    } catch (err) {
      console.warn('棋局清理失败', err);
    }
  }

  function restoreGame() {
    let restored = false;
    try {
      const raw = localStorage.getItem(GAME_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved.fen === 'string' && Array.isArray(saved.sans) && Array.isArray(saved.keys)) {
          game.engine = E.createState(E.START_FEN);
          let replayed = null;
          let keys2 = null;
          if (Array.isArray(saved.moves) && saved.moves.length === saved.sans.length && saved.moves.length) {
            replayed = [];
            keys2 = [E.positionKey(game.engine)];
            for (const mv of saved.moves) {
              const m = mv ? E.findMove(game.engine, mv.f, mv.t, mv.p || 0) : null;
              if (!m) { replayed = null; keys2 = null; break; }
              E.makeMove(game.engine, m);
              replayed.push(m);
              keys2.push(E.positionKey(game.engine));
            }
          }
          if (replayed && E.fenOf(game.engine) === saved.fen) {
            game.sanList = saved.sans.map(function (san, i) {
              return { san: san, color: replayed[i].piece > 0 ? E.WHITE : E.BLACK, move: replayed[i] };
            });
            game.positionKeys = keys2;
            game.lastMove = { from: replayed[replayed.length - 1].from, to: replayed[replayed.length - 1].to };
          } else {
            game.engine = E.createState(saved.fen);
            game.sanList = saved.sans.map(function (san) { return { san: san, color: 0, move: null }; });
            game.positionKeys = saved.keys;
            game.lastMove = saved.last || null;
          }
          game.status = E.gameStatus(game.engine, repetitionCount());
          game.gameOver = Boolean(game.status.over);
          rebuildCaptured();
          restored = true;
        }
      }
    } catch (err) {
      console.warn('棋局恢复失败', err);
    }
    game.selected = -1;
    game.legal = [];
    game.hint = null;
    game.thinking = false;
    return restored;
  }

  function rebuildCaptured() {
    game.captured = { 1: [], '-1': [] };
    for (const entry of game.sanList) {
      if (entry.move && entry.move.captured) {
        game.captured[entry.color].push(Math.abs(entry.move.captured));
      }
    }
  }

  function repetitionCount() {
    const key = E.positionKey(game.engine);
    return game.positionKeys.filter(function (k) { return k === key; }).length;
  }

  function playerLabel(color) {
    if (game.mode !== 'ai') return color === E.WHITE ? '白方' : '黑方';
    if (color === game.humanColor) return '你';
    return '电脑 · ' + DIFFICULTY_LABEL[game.difficulty];
  }

  function currentTurn() {
    return game.engine.turn;
  }

  function myTurn() {
    return game.mode === 'human' || currentTurn() === game.humanColor;
  }

  function countPieces(color) {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (let sq = 0; sq < 128; sq++) {
      if ((sq & 0x88) !== 0) continue;
      const p = game.engine.board[sq];
      if (p && E.colorOf(p) === color) counts[Math.abs(p)]++;
    }
    return counts;
  }

  function materialValue(color) {
    const counts = countPieces(color);
    return counts[1] + counts[2] * 3 + counts[3] * 3 + counts[4] * 5 + counts[5] * 9;
  }

  function renderBoard() {
    const frag = document.createDocumentFragment();
    const board = game.engine.board;
    const turn = currentTurn();
    const checkSq = game.status && game.status.check && !game.gameOver ? game.engine.kings[turn] : -1;
    const isFlipped = game.flipped;

    for (let vr = 0; vr < 8; vr++) {
      const row = document.createElement('div');
      row.className = 'srow';
      row.setAttribute('role', 'row');

      for (let vf = 0; vf < 8; vf++) {
        const rank = isFlipped ? vr : 7 - vr;
        const file = isFlipped ? 7 - vf : vf;
        const sq = rank * 16 + file;
        const cell = document.createElement('div');
        cell.className = 'sq ' + ((rank + file) % 2 === 0 ? 'dark' : 'light');
        cell.dataset.sq = String(sq);
        cell.id = 'cell-' + E.alg(sq);
        cell.setAttribute('role', 'gridcell');
        const piece0 = board[sq];
        cell.setAttribute('aria-label', piece0
          ? E.alg(sq) + ' ' + (piece0 > 0 ? '白' : '黑') + PIECE_NAMES[Math.abs(piece0)]
          : E.alg(sq));

        if (game.selected === sq) cell.classList.add('selected');
        if (game.lastMove && (game.lastMove.from === sq || game.lastMove.to === sq)) cell.classList.add('last');
        if (game.hint && (game.hint.from === sq || game.hint.to === sq)) cell.classList.add('hint');
        if (sq === checkSq) cell.classList.add('in-check');
        if (sq === kbSquare) {
          cell.classList.add('kbfocus');
          boardEl.setAttribute('aria-activedescendant', cell.id);
        }

        if (game.legal.some(function (m) { return m.to === sq; })) {
          cell.classList.add(board[sq] ? 'target-capture' : 'target');
        }

        if (vf === 0) {
          const coord = document.createElement('span');
          coord.className = 'coord coord-rank';
          coord.textContent = String(rank + 1);
          cell.appendChild(coord);
        }
        if (vr === 7) {
          const coord = document.createElement('span');
          coord.className = 'coord coord-file';
          coord.textContent = 'abcdefgh'[file];
          cell.appendChild(coord);
        }

        const piece = board[sq];
        if (piece) {
          const el = document.createElement('div');
          el.className = 'piece ' + (piece > 0 ? 'w' : 'b');
          el.innerHTML = Pieces.svg(Math.abs(piece), piece > 0);
          if (arriveSq === sq && !(pendingAnim && pendingAnim.to === sq)) el.classList.add('arrive');
          if (pendingAnim && pendingAnim.to === sq) el.dataset.glide = '1';
          cell.appendChild(el);
        }

        row.appendChild(cell);
      }

      frag.appendChild(row);
    }

    boardEl.replaceChildren(frag);
    applyGlide();
  }

  function applyGlide() {
    if (!pendingAnim) return;
    const anim = pendingAnim;
    pendingAnim = null;
    const pieceEl = boardEl.querySelector('.sq[data-sq="' + anim.to + '"] .piece[data-glide="1"]');
    const toCell = boardEl.querySelector('.sq[data-sq="' + anim.to + '"]');
    const fromCell = boardEl.querySelector('.sq[data-sq="' + anim.from + '"]');
    if (!pieceEl || !toCell || !fromCell) return;
    const fr = fromCell.getBoundingClientRect();
    const tr = toCell.getBoundingClientRect();
    const dx = fr.left - tr.left;
    const dy = fr.top - tr.top;
    pieceEl.style.transition = 'none';
    pieceEl.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
    void pieceEl.offsetWidth;
    pieceEl.style.transition = 'transform ' + (anim.dur || 0.18) + 's ease-out';
    pieceEl.style.transform = '';
    pieceEl.addEventListener('transitionend', function () {
      pieceEl.style.transition = '';
    }, { once: true });
  }

  function renderStrips() {
    const topColor = game.flipped ? E.WHITE : E.BLACK;
    const bottomColor = -topColor;
    const active = game.gameOver ? 0 : currentTurn();

    renderStrip(strips.top, topColor, active);
    renderStrip(strips.bottom, bottomColor, active);
  }

  function renderStrip(strip, color, active) {
    strip.root.classList.toggle('is-active', color === active);
    strip.name.textContent = playerLabel(color);

    let state = '';
    if (!game.gameOver && game.status && game.status.check && color === currentTurn()) {
      state = '将军';
    } else if (!game.gameOver && game.thinking && game.mode === 'ai' && color !== game.humanColor) {
      state = '思考中';
    }
    strip.state.textContent = state;
    strip.state.hidden = !state;
    strip.state.className = 'player-state' + (state === '将军' ? ' state-check' : state ? ' state-thinking' : '');

    const chips = game.captured[color].slice().sort(function (a, b) { return b - a; });
    strip.captures.replaceChildren();
    const diff = materialValue(color) - materialValue(-color);
    if (diff > 0) {
      const badge = document.createElement('span');
      badge.className = 'material-badge';
      badge.textContent = '+' + diff;
      strip.captures.appendChild(badge);
    }
    chips.forEach(function (type) {
      const chip = document.createElement('span');
      chip.className = 'capture-piece piece ' + (color === E.WHITE ? 'b' : 'w');
      chip.innerHTML = Pieces.svg(type, color === E.BLACK);
      strip.captures.appendChild(chip);
    });
  }

  function statusSentence() {
    const side = currentTurn() === E.WHITE ? '白方' : '黑方';
    if (game.gameOver && game.status) {
      const title = game.status.result === 'draw'
        ? '和棋'
        : (game.status.result === 'white' ? '白方胜' : '黑方胜');
      const reason = REASON_TEXT[game.status.reason] || '';
      return title + (reason ? '，' + reason : '');
    }
    if (game.status && game.status.check) return '将军，' + side + '必须应将';
    if (game.thinking) return '电脑思考中';
    return side + '走棋';
  }

  function renderStatus() {
    boardEl.classList.toggle('is-thinking', game.thinking);
    statusLive.textContent = statusSentence();
  }

  function renderAll() {
    renderBoard();
    renderStrips();
    renderStatus();
    renderHistory();
  }

  function selectSquare(sq) {
    game.selected = sq;
    game.legal = E.generateLegalMoves(game.engine).filter(function (m) { return m.from === sq; });
    game.hint = null;
    renderBoard();
  }

  function clearSelection() {
    if (game.selected < 0 && !game.hint) return;
    game.selected = -1;
    game.legal = [];
    game.hint = null;
    renderBoard();
  }

  function attemptMove(from, to) {
    const candidates = game.legal.filter(function (m) { return m.from === from && m.to === to; });
    if (!candidates.length) return;
    if (candidates.length > 1) {
      openPromotion(game.engine.turn).then(function (type) {
        if (!type) { renderBoard(); return; }
        const chosen = candidates.find(function (m) { return m.promotion === type; });
        if (chosen) applyMove(chosen);
      });
      return;
    }
    applyMove(candidates[0]);
  }

  function sanListLastSan(mate) {
    const last = game.sanList[game.sanList.length - 1];
    if (last) last.san += mate ? '#' : '+';
  }

  function applyMove(move) {
    const mover = game.engine.turn;
    const san = E.moveToSan(game.engine, move, true);
    E.makeMove(game.engine, move);
    game.sanList.push({ san: san, color: mover, move: move });
    game.positionKeys.push(E.positionKey(game.engine));
    game.lastMove = { from: move.from, to: move.to };
    game.selected = -1;
    game.legal = [];
    game.hint = null;
    const status = E.gameStatus(game.engine, repetitionCount());
    game.status = status;
    if (status.check) sanListLastSan(status.reason === 'checkmate');
    saveGame();

    if (move.flag === E.FLAG_KCASTLE || move.flag === E.FLAG_QCASTLE) playSound('castle');
    else playSound(move.captured ? 'capture' : 'move');
    if (status.check && !status.over) playSound('check');

    if (move.captured) game.captured[mover].push(Math.abs(move.captured));
    histPage = 0;

    arriveSq = move.to;
    pendingAnim = {
      from: move.from,
      to: move.to,
      dur: (game.mode === 'ai' && mover !== game.humanColor) ? 0.34 : 0.16
    };
    if (status.over) {
      conclude(status);
    } else {
      renderAll();
      maybeAI();
    }
    arriveSq = -1;
  }

  function conclude(status) {
    game.status = status;
    game.gameOver = true;
    game.thinking = false;
    game.activeRequest = 0;
    playSound('end');
    renderAll();
    saveGame();
    window.setTimeout(showResult, 420);
  }

  function showResult() {
    if (!game.gameOver || !game.status) return;
    const s = game.status;
    resultTitle.textContent = s.result === 'draw' ? '和棋' : (s.result === 'white' ? '白方胜' : '黑方胜');
    resultReason.textContent = REASON_TEXT[s.reason] || '';
    overlay.hidden = false;
    game.resultShown = true;
  }

  function hideResult() {
    overlay.hidden = true;
    game.resultShown = false;
  }

  function maybeAI() {
    if (game.mode !== 'ai' || game.gameOver) return;
    if (game.engine.turn === game.humanColor) return;
    if (game.thinking) return;

    game.thinking = true;
    game.aiStart = Date.now();
    game.aiThinkTarget = 500 + Math.floor(Math.random() * 501);
    const id = ++game.requestSeq;
    game.activeRequest = id;
    renderStrips();
    renderStatus();
    requestSearch({
      type: 'search',
      id: id,
      purpose: 'move',
      fen: E.fenOf(game.engine),
      options: AI ? AI.DIFFICULTIES[game.difficulty] : { depth: 3, timeLimit: 900 }
    });
  }

  function cancelAI() {
    game.activeRequest = 0;
    game.thinking = false;
    renderStrips();
    renderStatus();
  }

  let lastSearchPayload = null;
  let lastSearchRetried = false;

  function requestSearch(payload) {
    lastSearchPayload = payload;
    lastSearchRetried = false;
    if (aiWorker) {
      aiWorker.postMessage(payload);
      return;
    }
    if (!AI) return;
    runMainThreadSearch(payload);
  }

  function runMainThreadSearch(payload) {
    const state = E.createState(payload.fen);
    const result = AI.search(state, payload.options);
    handleSearchResult({
      type: 'result',
      id: payload.id,
      purpose: payload.purpose,
      move: result ? {
        from: result.move.from,
        to: result.move.to,
        promotion: result.move.promotion,
        flag: result.move.flag
      } : null,
      score: result ? result.score : 0,
      depth: result ? result.depth : 0,
      nodes: result ? result.nodes : 0
    });
  }

  function retrySearchOnMain() {
    if (!lastSearchPayload || lastSearchRetried) return;
    if (lastSearchPayload.id !== game.activeRequest && lastSearchPayload.id !== game.hintRequest) return;
    if (!AI) {
      if (lastSearchPayload.id === game.activeRequest) cancelAI();
      return;
    }
    lastSearchRetried = true;
    requestSearch(lastSearchPayload);
  }

  function handleSearchResult(data) {
    if (data.type === 'error') {
      if (data.id === game.activeRequest || data.id === game.hintRequest) {
        aiWorker = null;
        toast('AI 出错，已切换为主线程计算');
        retrySearchOnMain();
      }
      return;
    }
    if (data.purpose === 'hint') {
      handleHint(data);
      return;
    }
    if (data.id !== game.activeRequest) return;
    const delay = Math.max(0, (game.aiThinkTarget || 600) - (Date.now() - game.aiStart));
    window.setTimeout(function () {
      if (data.id !== game.activeRequest) return;
      if (game.gameOver || game.mode !== 'ai') return;
      game.thinking = false;
      renderStrips();
      if (!data.move) { renderStatus(); return; }
      const move = E.findMove(game.engine, data.move.from, data.move.to, data.move.promotion);
      if (!move) { renderStatus(); return; }
      applyMove(move);
    }, delay);
  }

  function handleHint(data) {
    if (data.id !== game.hintRequest || !data.move) return;
    if (E.fenOf(game.engine) !== hintFen) return;
    if (game.gameOver || !myTurn()) return;
    const move = E.findMove(game.engine, data.move.from, data.move.to, data.move.promotion);
    if (!move) return;
    game.hint = { from: move.from, to: move.to };
    game.selected = -1;
    game.legal = [];
    renderBoard();
    toast('建议走法：' + E.moveToSan(game.engine, move));
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(function () {
      game.hint = null;
      renderBoard();
    }, 3200);
  }

  function requestHint() {
    if (game.gameOver || game.thinking || !myTurn()) return;
    game.hintRequest = ++game.requestSeq;
    hintFen = E.fenOf(game.engine);
    requestSearch({
      type: 'search',
      id: game.hintRequest,
      purpose: 'hint',
      fen: hintFen,
      options: { depth: 3, timeLimit: 1200 }
    });
    toast('正在计算最佳着法');
  }

  function armNewGame() {
    game.newArmed = true;
    toast('再按一次确认开始新对局，当前棋局将被清空');
    window.clearTimeout(newGameTimer);
    newGameTimer = window.setTimeout(disarmNewGame, 3000);
  }

  function disarmNewGame() {
    game.newArmed = false;
    window.clearTimeout(newGameTimer);
  }

  function newGame(force) {
    if (!force && game.sanList.length && !game.gameOver) {
      if (!game.newArmed) {
        armNewGame();
        return;
      }
      disarmNewGame();
    }
    disarmNewGame();
    cancelAI();
    hideResult();
    clearGame();
    game.engine = E.createState();
    game.positionKeys = [E.positionKey(game.engine)];
    game.sanList = [];
    game.captured = { 1: [], '-1': [] };
    game.lastMove = null;
    game.selected = -1;
    game.legal = [];
    game.hint = null;
    game.thinking = false;
    game.gameOver = false;
    game.status = E.gameStatus(game.engine, 1);
    game.resignArmed = false;
    disarmResign();
    histPage = 0;
    renderAll();
    maybeAI();
  }

  function undoMove() {
    if (!game.sanList.length) {
      toast('还没有落子，无可悔棋');
      return;
    }
    const wasThinking = game.thinking;
    if (game.mode === 'ai' && !wasThinking && game.engine.turn === game.humanColor && game.sanList.length < 2) {
      toast('还没有你的落子，暂不可悔棋');
      return;
    }
    if (!game.engine.history.length) {
      toast('该局缺少走子历史，暂不可悔棋');
      return;
    }
    cancelAI();
    hideResult();
    window.clearTimeout(hintTimer);

    let steps = 1;
    if (game.mode === 'ai') {
      if (game.engine.turn === game.humanColor) steps = 2;
      if (wasThinking) steps = 1;
    }
    steps = Math.min(steps, game.sanList.length, game.engine.history.length);

    const tail = game.sanList[game.sanList.length - steps];
    if (!tail || !tail.move) {
      toast('该局缺少走子历史，暂不可悔棋');
      return;
    }
    const undoneMove = tail.move;
    for (let i = 0; i < steps; i++) {
      E.unmakeMove(game.engine);
      game.sanList.pop();
      game.positionKeys.pop();
    }
    rebuildCaptured();
    histPage = 0;

    game.gameOver = false;
    game.status = E.gameStatus(game.engine, repetitionCount());
    game.lastMove = game.sanList.length ? game.sanList[game.sanList.length - 1].move : null;
    pendingAnim = { from: undoneMove.to, to: undoneMove.from };
    game.selected = -1;
    game.legal = [];
    game.hint = null;
    game.thinking = false;
    game.resignArmed = false;
    disarmResign();
    renderAll();
    saveGame();
    maybeAI();
  }

  function resign() {
    if (game.gameOver) return;
    if (!game.resignArmed) {
      game.resignArmed = true;
      const note = game.mode === 'human' && !game.thinking
        ? '（当前行棋方认输）'
        : '';
      toast('再按一次 R 键确认认输' + note);
      window.clearTimeout(resignTimer);
      resignTimer = window.setTimeout(disarmResign, 3000);
      return;
    }
    disarmResign();
    cancelAI();
    const loser = game.mode === 'ai' ? game.humanColor : game.engine.turn;
    conclude({
      over: true,
      result: loser === E.WHITE ? 'black' : 'white',
      reason: 'resign',
      check: false
    });
  }

  function disarmResign() {
    game.resignArmed = false;
    window.clearTimeout(resignTimer);
  }

  let promoPrevFocus = null;

  function openPromotion(color) {
    return new Promise(function (resolve) {
      promoGrid.replaceChildren();
      [E.QUEEN, E.ROOK, E.BISHOP, E.KNIGHT].forEach(function (type) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'promo-btn piece ' + (color === E.WHITE ? 'w' : 'b');
        btn.innerHTML = Pieces.svg(type, color === E.WHITE);
        btn.setAttribute('aria-label', PIECE_NAMES[type]);
        btn.addEventListener('click', function () { closePromotion(type); });
        promoGrid.appendChild(btn);
      });
      promoPrevFocus = document.activeElement;
      promoResolve = resolve;
      promoModal.hidden = false;
      const first = promoGrid.querySelector('button');
      if (first) first.focus();
    });
  }

  function closePromotion(value) {
    promoModal.hidden = true;
    const resolve = promoResolve;
    promoResolve = null;
    if (promoPrevFocus && promoPrevFocus.focus) promoPrevFocus.focus();
    promoPrevFocus = null;
    if (resolve) resolve(value);
  }

  function activateSquare(sq) {
    if (sq < 0 || game.gameOver || game.thinking || !myTurn()) return;
    if (game.selected >= 0 && game.legal.some(function (m) { return m.to === sq; })) {
      attemptMove(game.selected, sq);
      return;
    }
    const piece = game.engine.board[sq];
    if (piece && E.colorOf(piece) === game.engine.turn) {
      kbSquare = sq;
      selectSquare(sq);
      return;
    }
    clearSelection();
  }

  function kbClear() {
    kbSquare = -1;
    const cur = boardEl.querySelector('.kbfocus');
    if (cur) cur.classList.remove('kbfocus');
  }

  function kbFocusSquare() {
    const cur = boardEl.querySelector('.kbfocus');
    if (cur) cur.classList.remove('kbfocus');
    if (kbSquare < 0) return;
    const cell = boardEl.querySelector('.sq[data-sq="' + kbSquare + '"]');
    if (!cell) { kbSquare = -1; return; }
    cell.classList.add('kbfocus');
    boardEl.setAttribute('aria-activedescendant', cell.id);
  }

  function onBoardKeydown(event) {
    const flip = game.flipped;
    const key = event.key;
    const isArrow = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
    const isActivate = key === 'Enter' || key === ' ';
    if (!isArrow && !isActivate) return;

    let vr;
    let vf;
    if (kbSquare < 0) {
      if (!isArrow) return;
      vr = flip ? 0 : 7;
      vf = 0;
    } else {
      const rank = kbSquare >> 4;
      const file = kbSquare & 7;
      vr = flip ? rank : 7 - rank;
      vf = flip ? 7 - file : file;
    }

    if (isActivate) {
      event.preventDefault();
      activateSquare(kbSquare);
      return;
    }
    event.preventDefault();
    if (key === 'ArrowUp') vr += flip ? 1 : -1;
    else if (key === 'ArrowDown') vr += flip ? -1 : 1;
    else if (key === 'ArrowLeft') vf -= 1;
    else if (key === 'ArrowRight') vf += 1;
    if (vr < 0 || vr > 7 || vf < 0 || vf > 7) return;
    const rank2 = flip ? vr : 7 - vr;
    const file2 = flip ? 7 - vf : vf;
    kbSquare = rank2 * 16 + file2;
    kbFocusSquare();
  }

  function onPointerDown(event) {
    if (game.gameOver || game.thinking || !myTurn()) return;
    const cell = event.target.closest('.sq');
    if (!cell) return;
    const sq = Number(cell.dataset.sq);

    if (game.selected >= 0 && game.legal.some(function (m) { return m.to === sq; })) {
      attemptMove(game.selected, sq);
      return;
    }

    const piece = game.engine.board[sq];
    if (piece && E.colorOf(piece) === game.engine.turn) {
      selectSquare(sq);
      startDrag(event, sq);
      return;
    }

    clearSelection();
  }

  function startDrag(event, sq) {
    const pieceEl = boardEl.querySelector('.sq[data-sq="' + sq + '"] .piece');
    dragState = {
      sq: sq,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      el: pieceEl
    };
    if (boardEl.setPointerCapture) {
      try {
        boardEl.setPointerCapture(event.pointerId);
      } catch (err) {
        dragState = null;
      }
    }
  }

  function onPointerMove(event) {
    if (!dragState) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    if (!dragState.moved && Math.sqrt(dx * dx + dy * dy) < 6) return;
    dragState.moved = true;
    if (dragState.el) {
      dragState.el.classList.add('dragging');
      dragState.el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(1.08)';
    }
  }

  function onPointerUp(event) {
    if (!dragState) return;
    const state = dragState;
    dragState = null;
    if (!state.moved) return;

    if (state.el) {
      state.el.classList.remove('dragging');
      state.el.style.transform = '';
    }

    const target = document.elementFromPoint(event.clientX, event.clientY);
    const cell = target && target.closest ? target.closest('.sq') : null;
    if (!cell) {
      clearSelection();
      return;
    }
    const to = Number(cell.dataset.sq);
    if (game.legal.some(function (m) { return m.to === to; })) {
      attemptMove(state.sq, to);
    } else {
      clearSelection();
    }
  }

  function onPointerCancel() {
    if (!dragState) return;
    if (dragState.el) {
      dragState.el.classList.remove('dragging');
      dragState.el.style.transform = '';
    }
    dragState = null;
    clearSelection();
  }

  let audioContext = null;

  function audio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioContext) audioContext = new Ctx();
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }

  function tone(ctx, freq, when, duration, type, volume, endFreq) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, when + duration);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.03);
  }

  function playSound(kind) {
    if (!game.sound) return;
    const ctx = audio();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (kind === 'move') {
      tone(ctx, 430, now, 0.07, 'triangle', 0.05, 260);
    } else if (kind === 'capture') {
      tone(ctx, 240, now, 0.1, 'square', 0.045, 120);
      tone(ctx, 95, now + 0.01, 0.16, 'sine', 0.07, 60);
    } else if (kind === 'castle') {
      tone(ctx, 380, now, 0.06, 'triangle', 0.045, 280);
      tone(ctx, 380, now + 0.09, 0.06, 'triangle', 0.045, 280);
    } else if (kind === 'check') {
      tone(ctx, 740, now, 0.09, 'triangle', 0.05);
      tone(ctx, 980, now + 0.1, 0.12, 'triangle', 0.045);
    } else if (kind === 'end') {
      [523, 659, 784].forEach(function (freq, i) {
        tone(ctx, freq, now + i * 0.1, 0.34, 'sine', 0.045);
      });
    }
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove('is-visible');
    }, 2200);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = game.theme === 'melon' ? 'melon' : '';
  }

  function renderHistory(scrollToEnd) {
    const total = game.sanList.length;
    const rows = Math.ceil(total / 2);
    const pages = Math.max(1, Math.ceil(rows / HIST_PAGE_ROWS));
    const page = histPage ? Math.min(histPage, pages) : pages;
    historyCount.hidden = total === 0;
    historyCount.textContent = total + ' 步';

    if (!total) {
      historyMoves.innerHTML = '<p class="moves-empty">尚未落子</p>';
      historyPager.hidden = true;
      return;
    }

    const start = (page - 1) * HIST_PAGE_ROWS * 2;
    const end = Math.min(total, start + HIST_PAGE_ROWS * 2);
    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i += 2) {
      const row = document.createElement('div');
      row.className = 'move-row';
      if (i + 1 >= total - 1) row.classList.add('is-last');

      const no = document.createElement('span');
      no.className = 'move-no';
      no.textContent = (i / 2 + 1) + '.';
      row.appendChild(no);

      const white = document.createElement('span');
      white.className = 'move-san';
      white.textContent = game.sanList[i].san;
      row.appendChild(white);

      const black = document.createElement('span');
      black.className = 'move-san';
      black.textContent = game.sanList[i + 1] ? game.sanList[i + 1].san : '';
      row.appendChild(black);

      frag.appendChild(row);
    }
    historyMoves.replaceChildren(frag);
    if (!historyDrawer.hidden) {
      historyMoves.scrollTop = scrollToEnd === false ? 0 : historyMoves.scrollHeight;
    }

    if (pages <= 1) {
      historyPager.hidden = true;
      return;
    }
    historyPager.hidden = false;
    historyPager.replaceChildren(buildPager(page, pages, total));
  }

  let historyPrevFocus = null;

  function openHistory() {
    histPage = 0;
    historyPrevFocus = document.activeElement;
    historyDrawer.hidden = false;
    renderHistory();
    const card = historyDrawer.querySelector('.modal-card');
    if (card) card.focus();
  }

  function closeHistory() {
    historyDrawer.hidden = true;
    if (historyPrevFocus && historyPrevFocus.focus) historyPrevFocus.focus();
    historyPrevFocus = null;
  }

  function buildPager(page, pages, total) {
    const frag = document.createDocumentFragment();

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.textContent = '‹';
    prev.setAttribute('aria-label', '上一页');
    prev.disabled = page <= 1;
    prev.dataset.page = String(page - 1);
    frag.appendChild(prev);

    const label = document.createElement('span');
    label.className = 'pager-label';
    label.textContent = '第 ' + page + '/' + pages + ' 页，共 ' + total + ' 步';
    frag.appendChild(label);

    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = '›';
    next.setAttribute('aria-label', '下一页');
    next.disabled = page >= pages;
    next.dataset.page = String(page + 1);
    frag.appendChild(next);

    return frag;
  }

  function syncControls() {
    for (const [group, attr] of [[modeGroup, 'mode'], [sideGroup, 'side'], [difficultyGroup, 'difficulty'], [themeGroup, 'theme']]) {
      group.querySelectorAll('button').forEach(function (btn) {
        const active = btn.dataset[attr] === (
          attr === 'mode' ? game.mode
          : attr === 'side' ? (game.humanColor === E.BLACK ? 'black' : 'white')
          : attr === 'theme' ? game.theme
          : game.difficulty
        );
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }
    soundToggle.classList.toggle('is-on', game.sound);
    soundToggle.setAttribute('aria-pressed', String(game.sound));
    difficultyGroup.classList.toggle('is-disabled', game.mode !== 'ai');
    sideGroup.classList.toggle('is-disabled', game.mode !== 'ai');
  }

  function openSettings() {
    syncControls();
    prevFocus = document.activeElement;
    settingsModal.hidden = false;
    const card = settingsModal.querySelector('.modal-card');
    if (card) card.focus();
  }

  function closeSettings() {
    settingsModal.hidden = true;
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    prevFocus = null;
  }

  let prevFocus = null;

  function trapModalTab(modal, event) {
    if (event.key !== 'Tab') return;
    const focusables = modal.querySelectorAll('button');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    const card = modal.querySelector('.modal-card');
    if (!modal.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && (active === first || active === card)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function setupWorker() {
    if (!window.Worker) return;
    try {
      aiWorker = new Worker('js/worker.js');
      aiWorker.onmessage = function (event) { handleSearchResult(event.data || {}); };
      aiWorker.onerror = function () {
        aiWorker = null;
        toast('AI 工作线程不可用，已切换为主线程计算');
        retrySearchOnMain();
      };
    } catch (err) {
      aiWorker = null;
      console.warn('Worker 创建失败', err);
    }
  }

  function bindEvents() {
    boardEl.addEventListener('pointerdown', onPointerDown);
    boardEl.addEventListener('pointermove', onPointerMove);
    boardEl.addEventListener('pointerup', onPointerUp);
    boardEl.addEventListener('pointercancel', onPointerCancel);
    boardEl.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    boardEl.tabIndex = 0;
    boardEl.addEventListener('keydown', onBoardKeydown);
    boardEl.addEventListener('blur', function () { kbClear(); });

    document.getElementById('fabNew').addEventListener('click', function () { newGame(false); });
    document.getElementById('resultAgain').addEventListener('click', function () { newGame(true); });
    document.getElementById('btnSettings').addEventListener('click', openSettings);
    document.getElementById('settingsDone').addEventListener('click', closeSettings);

    historyOpen.addEventListener('click', openHistory);
    historyClose.addEventListener('click', closeHistory);
    historyDrawer.addEventListener('click', function (event) {
      if (event.target === historyDrawer) closeHistory();
    });
    historyDrawer.addEventListener('keydown', function (event) {
      trapModalTab(historyDrawer, event);
    });

    modeGroup.addEventListener('click', function (event) {
      const btn = event.target.closest('button[data-mode]');
      if (!btn || btn.dataset.mode === game.mode) return;
      if (game.thinking) cancelAI();
      game.mode = btn.dataset.mode;
      game.hint = null;
      game.selected = -1;
      game.legal = [];
      saveSettings();
      syncControls();
      renderAll();
      if (game.mode === 'ai') maybeAI();
    });

    sideGroup.addEventListener('click', function (event) {
      const btn = event.target.closest('button[data-side]');
      if (!btn || game.mode !== 'ai') return;
      const side = btn.dataset.side === 'black' ? E.BLACK : E.WHITE;
      if (side === game.humanColor) return;
      game.humanColor = side;
      game.flipped = side === E.BLACK;
      saveSettings();
      newGame(true);
    });

    difficultyGroup.addEventListener('click', function (event) {
      const btn = event.target.closest('button[data-difficulty]');
      if (!btn) return;
      game.difficulty = btn.dataset.difficulty;
      saveSettings();
      syncControls();
      renderStrips();
      renderStatus();
    });

    themeGroup.addEventListener('click', function (event) {
      const btn = event.target.closest('button[data-theme]');
      if (!btn || btn.dataset.theme === game.theme) return;
      game.theme = btn.dataset.theme;
      saveSettings();
      syncControls();
      applyTheme();
    });

    soundToggle.addEventListener('click', function () {
      game.sound = !game.sound;
      saveSettings();
      syncControls();
      if (game.sound) playSound('move');
    });

    historyPager.addEventListener('click', function (event) {
      const btn = event.target.closest('button[data-page]');
      if (!btn || btn.disabled) return;
      histPage = Number(btn.dataset.page) || 1;
      renderHistory(false);
    });

    settingsModal.addEventListener('click', function (event) {
      if (event.target === settingsModal) closeSettings();
    });
    settingsModal.addEventListener('keydown', function (event) {
      trapModalTab(settingsModal, event);
    });

    document.getElementById('promoCancel').addEventListener('click', function () { closePromotion(null); });
    promoModal.addEventListener('click', function (event) {
      if (event.target === promoModal) closePromotion(null);
    });
    promoModal.addEventListener('keydown', function (event) {
      trapModalTab(promoModal, event);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        disarmResign();
        disarmNewGame();
        if (!settingsModal.hidden) closeSettings();
        else if (!promoModal.hidden) closePromotion(null);
        else if (!historyDrawer.hidden) closeHistory();
        else {
          clearSelection();
          kbClear();
          renderBoard();
        }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!settingsModal.hidden || !promoModal.hidden || !historyDrawer.hidden) return;
      if (event.target && /input|textarea/i.test(event.target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === 'u') undoMove();
      else if (key === 'n') newGame(false);
      else if (key === 'f') {
        game.flipped = !game.flipped;
        saveSettings();
        renderAll();
      } else if (key === 'h') requestHint();
      else if (key === 'r') resign();
      else if (key === 's') openSettings();
    });
  }

  function boot() {
    loadSettings();
    syncControls();
    applyTheme();
    bindEvents();
    setupWorker();
    const restored = restoreGame();
    if (!restored) {
      game.positionKeys = [E.positionKey(game.engine)];
      game.status = E.gameStatus(game.engine, 1);
    } else {
      toast('已恢复上一局，走新的一步会自动续存');
    }
    renderAll();
    if (restored && game.gameOver) showResult();
    maybeAI();
    window.setInterval(function () {
      if (game.sanList.length && !game.gameOver) saveGame();
    }, 15000);
  }

  boot();
})();
