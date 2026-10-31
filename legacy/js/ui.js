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
    resign: '一方认输'
  };
  const SETTINGS_KEY = 'chess.settings.v1';
  const PIECE_NAMES = { 1: '兵', 2: '马', 3: '象', 4: '车', 5: '后', 6: '王' };
  const THINK_MIN = { easy: 450, normal: 700, hard: 1000 };

  const boardEl = document.getElementById('board');
  const statusLive = document.getElementById('statusLive');
  const resultBar = document.getElementById('resultBar');
  const resultTitle = document.getElementById('resultTitle');
  const resultReason = document.getElementById('resultReason');
  const toastEl = document.getElementById('toast');
  const settingsModal = document.getElementById('settingsModal');
  const modeGroup = document.getElementById('modeGroup');
  const sideGroup = document.getElementById('sideGroup');
  const difficultyGroup = document.getElementById('difficultyGroup');
  const themeGroup = document.getElementById('themeGroup');
  const speedGroup = document.getElementById('speedGroup');
  const SPEED_DUR = { fast: 0.4, normal: 0.8, slow: 1.2 };
  const soundToggle = document.getElementById('soundToggle');

  const game = {
    engine: E.createState(),
    mode: 'ai',
    difficulty: 'normal',
    speed: 'slow',
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
    requestSeq: 0,
    activeRequest: 0,
    hintRequest: 0,
    aiStart: 0,
    aiThinkTarget: 600,
    resignArmed: false
  };

  let pendingAnim = null;
  let kbSquare = -1;
  let dragState = null;
  let aiWorker = null;
  let toastTimer = null;
  let resignTimer = null;

  let hintFen = '';
  let hintTimer = null;

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.mode === 'ai' || saved.mode === 'human') game.mode = saved.mode;
      if (DIFFICULTY_LABEL[saved.difficulty]) game.difficulty = saved.difficulty;
      if (SPEED_DUR[saved.speed]) game.speed = saved.speed;
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
        speed: game.speed,
        sound: game.sound,
        flipped: game.flipped,
        side: game.humanColor === E.BLACK ? 'black' : 'white',
        theme: game.theme
      }));
    } catch (err) {
      console.warn('设置保存失败', err);
    }
  }

  function repetitionCount() {
    const key = E.positionKey(game.engine);
    return game.positionKeys.filter(function (k) { return k === key; }).length;
  }

  function currentTurn() {
    return game.engine.turn;
  }

  function myTurn() {
    return game.mode === 'human' || currentTurn() === game.humanColor;
  }

  function renderBoard() {
    const frag = document.createDocumentFragment();
    const board = game.engine.board;
    const turn = currentTurn();
    const checkSq = game.status && game.status.check ? game.engine.kings[turn] : -1;
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
        if (sq === checkSq && game.gameOver) cell.classList.add('is-mate');
        if (game.gameOver && game.status.reason === 'checkmate' && game.lastMove && game.lastMove.to === sq) {
          cell.classList.add('mate-source');
        }
        if (sq === kbSquare) {
          cell.classList.add('kbfocus');
          boardEl.setAttribute('aria-activedescendant', cell.id);
        }

        if (game.legal.some(function (m) { return m.to === sq; })) {
          cell.classList.add(board[sq] ? 'target-capture' : 'target');
        }

        const piece = board[sq];
        if (piece) {
          const el = document.createElement('div');
          el.className = 'piece ' + (piece > 0 ? 'w' : 'b');
          el.innerHTML = Pieces.svg(Math.abs(piece), piece > 0);
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
    if (!pieceEl.animate) return;
    pieceEl.classList.add('gliding');
    const motion = pieceEl.animate(
      [
        { transform: 'translate(' + dx + 'px, ' + dy + 'px)' },
        { transform: 'translate(0px, 0px)' }
      ],
      {
        duration: Math.round((anim.dur || 0.19) * 1000),
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        fill: 'none'
      }
    );
    motion.onfinish = function () { pieceEl.classList.remove('gliding'); };
    motion.oncancel = function () { pieceEl.classList.remove('gliding'); };
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
    renderStatus();
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

  function attemptMove(from, to, instant) {
    const candidates = game.legal.filter(function (m) { return m.from === from && m.to === to; });
    if (!candidates.length) return;
    const chosen = candidates.find(function (m) { return m.promotion === E.QUEEN; }) || candidates[0];
    applyMove(chosen, instant);
  }

  function sanListLastSan(mate) {
    const last = game.sanList[game.sanList.length - 1];
    if (last) last.san += mate ? '#' : '+';
  }

  function applyMove(move, instant) {
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

    if (move.flag === E.FLAG_KCASTLE || move.flag === E.FLAG_QCASTLE) playSound('castle');
    else playSound(move.captured ? 'capture' : 'move');
    if (status.check && !status.over) playSound('check');

    pendingAnim = instant ? null : {
      from: move.from,
      to: move.to,
      dur: SPEED_DUR[game.speed] || 1.2
    };
    if (status.over) {
      conclude(status);
    } else {
      renderAll();
      maybeAI();
    }
  }

  function conclude(status) {
    game.status = status;
    game.gameOver = true;
    game.thinking = false;
    game.activeRequest = 0;
    hideToast();
    playSound('end');
    renderAll();
    window.setTimeout(showResult, 420);
  }

  function showResult() {
    if (!game.gameOver || !game.status) return;
    const s = game.status;
    resultTitle.textContent = resultTitleText(s);
    resultReason.textContent = REASON_TEXT[s.reason] || '';
    resultBar.classList.toggle('is-white', s.result === 'white');
    resultBar.classList.toggle('is-black', s.result === 'black');
    resultBar.classList.toggle('is-draw', s.result === 'draw');
    resultBar.hidden = false;
    window.scrollTo(0, document.documentElement.scrollHeight);
  }

  function resultTitleText(s) {
    if (s.result === 'draw') return '和棋';
    if (game.mode === 'human') return s.result === 'white' ? '白方胜' : '黑方胜';
    const won = (s.result === 'white') === (game.humanColor === E.WHITE);
    return won ? '你赢了' : '你输了';
  }

  function hideResult() {
    resultBar.hidden = true;
    window.scrollTo(0, 0);
  }

  function maybeAI() {
    if (game.mode !== 'ai' || game.gameOver) return;
    if (game.engine.turn === game.humanColor) return;
    if (game.thinking) return;

    game.thinking = true;
    game.aiStart = Date.now();
    game.aiThinkTarget = THINK_MIN[game.difficulty] || 700;
    const id = ++game.requestSeq;
    game.activeRequest = id;
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

  function newGame() {
    cancelAI();
    hideResult();
    game.engine = E.createState();
    game.positionKeys = [E.positionKey(game.engine)];
    game.sanList = [];
    game.lastMove = null;
    game.selected = -1;
    game.legal = [];
    game.hint = null;
    game.thinking = false;
    game.gameOver = false;
    game.status = E.gameStatus(game.engine, 1);
    game.resignArmed = false;
    disarmResign();
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

    game.gameOver = false;
    game.status = E.gameStatus(game.engine, repetitionCount());
    game.lastMove = game.sanList.length ? game.sanList[game.sanList.length - 1].move : null;
    pendingAnim = { from: undoneMove.to, to: undoneMove.from, dur: SPEED_DUR[game.speed] || 1.2 };
    game.selected = -1;
    game.legal = [];
    game.hint = null;
    game.thinking = false;
    game.resignArmed = false;
    disarmResign();
    renderAll();
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
    if (game.gameOver) return;
    if (game.thinking) { toast('等电脑走完这一步'); return; }
    if (!myTurn()) return;
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
    }
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

    const to = squareAtPoint(event.clientX, event.clientY);
    if (to >= 0 && game.legal.some(function (m) { return m.to === to; })) {
      attemptMove(state.sq, to, true);
    }
  }

  function squareAtPoint(clientX, clientY) {
    const rect = boardEl.getBoundingClientRect();
    if (!rect.width) return -1;
    const size = rect.width / 8;
    const col = Math.floor((clientX - rect.left) / size);
    const row = Math.floor((clientY - rect.top) / size);
    if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
    const file = game.flipped ? 7 - col : col;
    const rank = game.flipped ? row : 7 - row;
    return rank * 16 + file;
  }

  function onPointerCancel() {
    if (!dragState) return;
    if (dragState.el) {
      dragState.el.classList.remove('dragging');
      dragState.el.style.transform = '';
    }
    dragState = null;
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
    toastTimer = window.setTimeout(hideToast, 2200);
  }

  function hideToast() {
    window.clearTimeout(toastTimer);
    toastEl.classList.remove('is-visible');
  }

  function applyTheme() {
    document.documentElement.dataset.theme = game.theme === 'melon' ? 'melon' : '';
  }

  function syncControls() {
    for (const [group, attr] of [[modeGroup, 'mode'], [sideGroup, 'side'], [difficultyGroup, 'difficulty'], [themeGroup, 'theme'], [speedGroup, 'speed']]) {
      group.querySelectorAll('button').forEach(function (btn) {
        const active = btn.dataset[attr] === (
          attr === 'mode' ? game.mode
          : attr === 'side' ? (game.humanColor === E.BLACK ? 'black' : 'white')
          : attr === 'theme' ? game.theme
          : attr === 'speed' ? game.speed
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

    document.getElementById('fabNew').addEventListener('click', function () { newGame(); });
    document.getElementById('resultAgain').addEventListener('click', function () { newGame(); });
    document.getElementById('btnSettings').addEventListener('click', openSettings);
    document.getElementById('settingsDone').addEventListener('click', closeSettings);

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
      newGame();
    });

    difficultyGroup.addEventListener('click', function (event) {
      const btn = event.target.closest('button[data-difficulty]');
      if (!btn) return;
      game.difficulty = btn.dataset.difficulty;
      saveSettings();
      syncControls();
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

    speedGroup.addEventListener('click', function (event) {
      const btn = event.target.closest('button[data-speed]');
      if (!btn || !SPEED_DUR[btn.dataset.speed]) return;
      game.speed = btn.dataset.speed;
      saveSettings();
      syncControls();
    });

    soundToggle.addEventListener('click', function () {
      game.sound = !game.sound;
      saveSettings();
      syncControls();
      if (game.sound) playSound('move');
    });

    settingsModal.addEventListener('click', function (event) {
      if (event.target === settingsModal) closeSettings();
    });
    settingsModal.addEventListener('keydown', function (event) {
      trapModalTab(settingsModal, event);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        disarmResign();
        if (!settingsModal.hidden) closeSettings();
        else {
          clearSelection();
          kbClear();
          renderBoard();
        }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!settingsModal.hidden) return;
      if (event.target && /input|textarea/i.test(event.target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === 'u') undoMove();
      else if (key === 'n') newGame();
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
    newGame();
  }

  boot();
})();
