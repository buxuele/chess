import Engine from './engine.js';
import AI from './ai.js';
import { playSound } from './sound.js';

const SETTINGS_KEY = 'chess.settings.v1';
const HISTORY_KEY = 'chess.history.v1';
const HISTORY_LIMIT = 200;
const SPEED_DUR = { fast: 0.4, normal: 0.8, slow: 1.2 };
const THINK_MIN = { easy: 450, normal: 700, hard: 1000 };
const PIECE_NAMES = { 1: '兵', 2: '马', 3: '象', 4: '车', 5: '后', 6: '王' };
const REASON_TEXT = {
  checkmate: '将杀',
  stalemate: '逼和',
  fifty: '五十回合规则',
  material: '子力不足',
  repetition: '三次重复局面',
  resign: '一方认输'
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (err) {
    console.warn('设置读取失败', err);
    return {};
  }
}

function saveSettings(state) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      mode: state.mode,
      difficulty: state.difficulty,
      speed: state.speed,
      sound: state.sound,
      flipped: state.flipped,
      side: state.humanColor === Engine.BLACK ? 'black' : 'white',
      theme: state.theme
    }));
  } catch (err) {
    console.warn('设置保存失败', err);
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('对局历史读取失败', err);
    return [];
  }
}

let saveHistoryTimer = null;
let pendingHistory = null;

function writeHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
  } catch (err) {
    console.warn('对局历史保存失败', err);
  }
}

function saveHistory(list) {
  pendingHistory = list;
  window.clearTimeout(saveHistoryTimer);
  saveHistoryTimer = window.setTimeout(function () {
    if (!pendingHistory) return;
    writeHistory(pendingHistory);
    pendingHistory = null;
  }, 120);
}

function flushHistory() {
  if (!pendingHistory) return;
  window.clearTimeout(saveHistoryTimer);
  writeHistory(pendingHistory);
  pendingHistory = null;
}

export function createGame() {
  let engine = Engine.createState();
  const saved = loadSettings();

  const s = {
    mode: saved.mode === 'human' ? 'human' : 'ai',
    difficulty: AI.DIFFICULTIES[saved.difficulty] ? saved.difficulty : 'normal',
    speed: SPEED_DUR[saved.speed] ? saved.speed : 'slow',
    humanColor: saved.side === 'black' ? Engine.BLACK : Engine.WHITE,
    flipped: false,
    theme: saved.theme === 'melon' ? 'melon' : 'olive',
    sound: typeof saved.sound === 'boolean' ? saved.sound : true,
    selected: -1,
    legal: [],
    lastMove: null,
    hint: null,
    sanList: [],
    positionKeys: [Engine.positionKey(engine)],
    thinking: false,
    gameOver: false,
    status: Engine.gameStatus(engine, 1),
    resignArmed: false,
    toast: '',
    toastVisible: false,
    resultVisible: false,
    anim: null
  };

  if (saved.side === 'black') s.flipped = true;
  else if (typeof saved.flipped === 'boolean') s.flipped = saved.flipped;

  let render = null;
  let worker = null;
  let seq = 0;
  let activeRequest = 0;
  let hintRequest = 0;
  let hintFen = '';
  let aiStart = 0;
  let aiTarget = 700;
  let lastPayload = null;
  let lastRetried = false;
  let toastTimer = null;
  let hintTimer = null;
  let resignTimer = null;
  let resultTimer = null;
  let history = loadHistory();
  let current = createRecord();
  let lastFinished = null;

  function createRecord() {
    return {
      id: 'game-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: 0,
      mode: s.mode,
      difficulty: s.difficulty,
      humanColor: s.humanColor === Engine.BLACK ? 'black' : 'white',
      result: null,
      reason: null,
      statusText: null,
      startFen: Engine.START_FEN,
      finalFen: null,
      moveCount: 0,
      moves: []
    };
  }

  function recordSnapshot(record) {
    const copy = Object.assign({}, record, { moves: record.moves.slice() });
    copy.moveCount = copy.moves.length;
    copy.endedAt = new Date().toISOString();
    copy.durationMs = Math.max(0, new Date(copy.endedAt).getTime() - new Date(copy.startedAt).getTime());
    return copy;
  }

  function exportHistory() {
    const games = history.slice();
    if (current.moves.length) {
      games.unshift({
        id: current.id,
        startedAt: current.startedAt,
        endedAt: null,
        durationMs: Math.max(0, Date.now() - new Date(current.startedAt).getTime()),
        mode: current.mode,
        difficulty: current.difficulty,
        humanColor: current.humanColor,
        result: 'in-progress',
        reason: null,
        statusText: '进行中',
        startFen: current.startFen,
        finalFen: Engine.fenOf(engine),
        moveCount: current.moves.length,
        moves: current.moves.slice()
      });
    }
    if (!games.length) {
      toast('还没有可导出的对局');
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'chess',
      version: 1,
      count: games.length,
      games: games
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'chess-history-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('已导出 ' + games.length + ' 局');
    } catch (err) {
      console.warn('导出失败', err);
      toast('导出失败，请稍后重试');
    }
  }

  function clearHistory() {
    const count = history.length;
    history = [];
    lastFinished = null;
    pendingHistory = null;
    window.clearTimeout(saveHistoryTimer);
    writeHistory([]);
    commit();
    toast(count ? '已清空 ' + count + ' 局' : '暂无历史');
  }

  function finishRecord(result, reason, statusText) {
    if (!current || !current.moves.length) {
      current = createRecord();
      return;
    }
    current.result = result;
    current.reason = reason;
    current.statusText = statusText;
    current.finalFen = Engine.fenOf(engine);
    const record = recordSnapshot(current);
    history = [record].concat(history).slice(0, HISTORY_LIMIT);
    saveHistory(history);
    lastFinished = record;
    current = createRecord();
  }

  function getView() {
    return {
      board: engine.board,
      turn: engine.turn,
      selected: s.selected,
      legal: s.legal,
      lastMove: s.lastMove,
      hint: s.hint,
      status: s.status,
      kingSquare: engine.kings[engine.turn],
      gameOver: s.gameOver,
      thinking: s.thinking,
      mode: s.mode,
      difficulty: s.difficulty,
      speed: s.speed,
      humanColor: s.humanColor,
      flipped: s.flipped,
      theme: s.theme,
      sound: s.sound,
      toast: s.toast,
      toastVisible: s.toastVisible,
      resultVisible: s.resultVisible,
      anim: s.anim,
      historyCount: history.length + (current.moves.length ? 1 : 0),
      finishedCount: history.length,
      statusText: statusSentence()
    };
  }

  function commit() {
    if (render) render(getView());
  }

  function statusSentence() {
    const side = engine.turn === Engine.WHITE ? '白方' : '黑方';
    if (s.gameOver && s.status) {
      const title = s.status.result === 'draw'
        ? '和棋'
        : (s.status.result === 'white' ? '白方胜' : '黑方胜');
      const reason = REASON_TEXT[s.status.reason] || '';
      return title + (reason ? '，' + reason : '');
    }
    if (s.status && s.status.check) return '将军，' + side + '必须应将';
    if (s.thinking) return '电脑思考中';
    return side + '走棋';
  }

  function myTurn() {
    return s.mode === 'human' || engine.turn === s.humanColor;
  }

  function repetitionCount() {
    const key = Engine.positionKey(engine);
    return s.positionKeys.filter(function (k) { return k === key; }).length;
  }

  function toast(message) {
    s.toast = message;
    s.toastVisible = true;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      s.toastVisible = false;
      commit();
    }, 2200);
    commit();
  }

  function hideToast() {
    window.clearTimeout(toastTimer);
    s.toastVisible = false;
  }

  function selectSquare(sq) {
    s.selected = sq;
    s.legal = Engine.generateLegalMoves(engine).filter(function (m) { return m.from === sq; });
    s.hint = null;
    commit();
  }

  function clearSelection() {
    if (s.selected < 0 && !s.hint) return;
    s.selected = -1;
    s.legal = [];
    s.hint = null;
    commit();
  }

  function attemptMove(from, to, instant) {
    const candidates = s.legal.filter(function (m) { return m.from === from && m.to === to; });
    if (!candidates.length) return;
    const chosen = candidates.find(function (m) { return m.promotion === Engine.QUEEN; }) || candidates[0];
    applyMove(chosen, instant);
  }

  function applyMove(move, instant) {
    const mover = engine.turn;
    const san = Engine.moveToSan(engine, move, true);
    Engine.makeMove(engine, move);
    s.sanList.push({ san: san, color: mover, move: move });
    s.positionKeys.push(Engine.positionKey(engine));
    s.lastMove = { from: move.from, to: move.to };
    s.selected = -1;
    s.legal = [];
    s.hint = null;
    const status = Engine.gameStatus(engine, repetitionCount());
    s.status = status;
    current.moves.push({
      ply: current.moves.length + 1,
      san: san,
      from: Engine.alg(move.from),
      to: Engine.alg(move.to),
      promotion: move.promotion || 0,
      captured: move.captured ? Math.abs(move.captured) : 0,
      capturedName: move.captured ? PIECE_NAMES[Math.abs(move.captured)] : ''
    });
    if (status.check) {
      const last = s.sanList[s.sanList.length - 1];
      if (last) last.san += status.reason === 'checkmate' ? '#' : '+';
      const rec = current.moves[current.moves.length - 1];
      if (rec) rec.san = last.san;
    }

    if (s.sound) {
      if (move.flag === Engine.FLAG_KCASTLE || move.flag === Engine.FLAG_QCASTLE) playSound('castle');
      else playSound(move.captured ? 'capture' : 'move');
      if (status.check && !status.over) playSound('check');
    }

    s.anim = instant ? null : {
      from: move.from,
      to: move.to,
      dur: SPEED_DUR[s.speed] || 1.2
    };

    if (status.over) {
      conclude(status);
      return;
    }
    commit();
    maybeAI();
  }

  function conclude(status) {
    s.status = status;
    s.gameOver = true;
    s.thinking = false;
    activeRequest = 0;
    hideToast();
    if (s.sound) playSound('end');
    finishRecord(status.result, status.reason, statusSentence());
    commit();
    window.clearTimeout(resultTimer);
    resultTimer = window.setTimeout(function () {
      s.resultVisible = true;
      commit();
    }, 420);
  }

  function hideResult() {
    s.resultVisible = false;
    window.clearTimeout(resultTimer);
    window.scrollTo(0, 0);
  }

  function requestSearch(payload) {
    lastPayload = payload;
    lastRetried = false;
    if (worker) {
      worker.postMessage(payload);
      return;
    }
    runMainThreadSearch(payload);
  }

  function runMainThreadSearch(payload) {
    const state = Engine.createState(payload.fen);
    const result = AI.search(state, payload.options);
    handleResult({
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
    if (!lastPayload || lastRetried) return;
    if (lastPayload.id !== activeRequest && lastPayload.id !== hintRequest) return;
    lastRetried = true;
    requestSearch(lastPayload);
  }

  function handleResult(data) {
    if (data.type === 'error') {
      if (data.id === activeRequest || data.id === hintRequest) {
        worker = null;
        toast('AI 出错，已切换为主线程计算');
        retrySearchOnMain();
      }
      return;
    }
    if (data.purpose === 'hint') {
      handleHint(data);
      return;
    }
    if (data.id !== activeRequest) return;
    const delay = Math.max(0, aiTarget - (Date.now() - aiStart));
    window.setTimeout(function () {
      if (data.id !== activeRequest) return;
      if (s.gameOver || s.mode !== 'ai') return;
      s.thinking = false;
      if (!data.move) {
        commit();
        return;
      }
      const move = Engine.findMove(engine, data.move.from, data.move.to, data.move.promotion);
      if (!move) {
        commit();
        return;
      }
      applyMove(move);
    }, delay);
  }

  function handleHint(data) {
    if (data.id !== hintRequest || !data.move) return;
    if (Engine.fenOf(engine) !== hintFen) return;
    if (s.gameOver || !myTurn()) return;
    const move = Engine.findMove(engine, data.move.from, data.move.to, data.move.promotion);
    if (!move) return;
    s.hint = { from: move.from, to: move.to };
    s.selected = -1;
    s.legal = [];
    commit();
    toast('建议走法：' + Engine.moveToSan(engine, move));
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(function () {
      s.hint = null;
      commit();
    }, 3200);
  }

  function requestHint() {
    if (s.gameOver || s.thinking || !myTurn()) return;
    hintRequest = ++seq;
    hintFen = Engine.fenOf(engine);
    requestSearch({
      type: 'search',
      id: hintRequest,
      purpose: 'hint',
      fen: hintFen,
      options: { depth: 3, timeLimit: 1200 }
    });
    toast('正在计算最佳着法');
  }

  function maybeAI() {
    if (s.mode !== 'ai' || s.gameOver) return;
    if (engine.turn === s.humanColor) return;
    if (s.thinking) return;

    s.thinking = true;
    aiStart = Date.now();
    aiTarget = THINK_MIN[s.difficulty] || 700;
    const id = ++seq;
    activeRequest = id;
    commit();
    requestSearch({
      type: 'search',
      id: id,
      purpose: 'move',
      fen: Engine.fenOf(engine),
      options: AI.DIFFICULTIES[s.difficulty]
    });
  }

  function cancelAI() {
    activeRequest = 0;
    s.thinking = false;
    commit();
  }

  function newGame() {
    cancelAI();
    hideResult();
    if (current.moves.length) {
      finishRecord('aborted', 'new-game', '未完成');
    } else {
      current = createRecord();
    }
    lastFinished = null;
    engine = Engine.createState();
    s.positionKeys = [Engine.positionKey(engine)];
    s.sanList = [];
    s.lastMove = null;
    s.selected = -1;
    s.legal = [];
    s.hint = null;
    s.thinking = false;
    s.gameOver = false;
    s.status = Engine.gameStatus(engine, 1);
    s.resignArmed = false;
    s.anim = null;
    window.clearTimeout(resignTimer);
    window.clearTimeout(hintTimer);
    commit();
    maybeAI();
  }

  function undoMove() {
    if (!s.sanList.length) {
      toast('还没有落子，无可悔棋');
      return;
    }
    const wasThinking = s.thinking;
    if (s.mode === 'ai' && !wasThinking && engine.turn === s.humanColor && s.sanList.length < 2) {
      toast('还没有你的落子，暂不可悔棋');
      return;
    }
    if (!engine.history.length) {
      toast('该局缺少走子历史，暂不可悔棋');
      return;
    }
    cancelAI();
    hideResult();
    window.clearTimeout(hintTimer);

    if (lastFinished) {
      const idx = history.findIndex(function (g) { return g.id === lastFinished.id; });
      if (idx >= 0) history.splice(idx, 1);
      current = Object.assign({}, lastFinished, {
        endedAt: null,
        result: null,
        reason: null,
        statusText: null,
        finalFen: null,
        moves: lastFinished.moves.slice()
      });
      lastFinished = null;
      saveHistory(history);
    }

    let steps = 1;
    if (s.mode === 'ai') {
      if (engine.turn === s.humanColor) steps = 2;
      if (wasThinking) steps = 1;
    }
    steps = Math.min(steps, s.sanList.length, engine.history.length);

    const tail = s.sanList[s.sanList.length - steps];
    if (!tail || !tail.move) {
      toast('该局缺少走子历史，暂不可悔棋');
      return;
    }
    const undoneMove = tail.move;
    for (let i = 0; i < steps; i++) {
      Engine.unmakeMove(engine);
      s.sanList.pop();
      s.positionKeys.pop();
    }
    current.moves.splice(Math.max(0, current.moves.length - steps), steps);

    s.gameOver = false;
    s.status = Engine.gameStatus(engine, repetitionCount());
    s.lastMove = s.sanList.length ? s.sanList[s.sanList.length - 1].move : null;
    s.anim = { from: undoneMove.to, to: undoneMove.from, dur: SPEED_DUR[s.speed] || 1.2 };
    s.selected = -1;
    s.legal = [];
    s.hint = null;
    s.thinking = false;
    s.resignArmed = false;
    window.clearTimeout(resignTimer);
    commit();
    maybeAI();
  }

  function resign() {
    if (s.gameOver) return;
    if (!s.resignArmed) {
      s.resignArmed = true;
      const note = s.mode === 'human' && !s.thinking ? '（当前行棋方认输）' : '';
      toast('再按一次 R 键确认认输' + note);
      window.clearTimeout(resignTimer);
      resignTimer = window.setTimeout(function () {
        s.resignArmed = false;
      }, 3000);
      return;
    }
    s.resignArmed = false;
    window.clearTimeout(resignTimer);
    cancelAI();
    const loser = s.mode === 'ai' ? s.humanColor : engine.turn;
    conclude({
      over: true,
      result: loser === Engine.WHITE ? 'black' : 'white',
      reason: 'resign',
      check: false
    });
  }

  function pointSquare(sq, instant) {
    if (s.gameOver) return;
    if (s.thinking) {
      toast('等电脑走完这一步');
      return;
    }
    if (!myTurn()) return;

    if (s.selected >= 0 && s.legal.some(function (m) { return m.to === sq; })) {
      attemptMove(s.selected, sq, instant);
      return;
    }

    const piece = engine.board[sq];
    if (piece && Engine.colorOf(piece) === engine.turn) {
      selectSquare(sq);
    }
  }

  function activateSquare(sq) {
    if (sq < 0 || s.gameOver || s.thinking || !myTurn()) return;
    if (s.selected >= 0 && s.legal.some(function (m) { return m.to === sq; })) {
      attemptMove(s.selected, sq);
      return;
    }
    const piece = engine.board[sq];
    if (piece && Engine.colorOf(piece) === engine.turn) selectSquare(sq);
  }

  function flip() {
    s.flipped = !s.flipped;
    saveSettings(s);
    commit();
  }

  function setMode(mode) {
    if (mode === s.mode) return;
    if (s.thinking) cancelAI();
    s.mode = mode;
    current.mode = mode;
    s.hint = null;
    s.selected = -1;
    s.legal = [];
    saveSettings(s);
    commit();
    if (mode === 'ai') maybeAI();
  }

  function setSide(side) {
    if (s.mode !== 'ai') return;
    const color = side === 'black' ? Engine.BLACK : Engine.WHITE;
    if (color === s.humanColor) return;
    s.humanColor = color;
    s.flipped = color === Engine.BLACK;
    saveSettings(s);
    newGame();
  }

  function setDifficulty(difficulty) {
    if (!AI.DIFFICULTIES[difficulty]) return;
    s.difficulty = difficulty;
    current.difficulty = difficulty;
    saveSettings(s);
    commit();
  }

  function setSpeed(speed) {
    if (!SPEED_DUR[speed]) return;
    s.speed = speed;
    saveSettings(s);
    commit();
  }

  function setTheme(theme) {
    s.theme = theme === 'melon' ? 'melon' : 'olive';
    saveSettings(s);
    commit();
  }

  function setSound(next) {
    s.sound = typeof next === 'boolean' ? next : !s.sound;
    saveSettings(s);
    commit();
    if (s.sound) playSound('move');
  }

  function handleKey(key) {
    if (key === 'u') undoMove();
    else if (key === 'n') newGame();
    else if (key === 'f') flip();
    else if (key === 'h') requestHint();
    else if (key === 'r') resign();
  }

  function destroy() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    flushHistory();
    window.removeEventListener('pagehide', flushHistory);
    window.removeEventListener('storage', onStorage);
    window.clearTimeout(toastTimer);
    window.clearTimeout(hintTimer);
    window.clearTimeout(resignTimer);
    window.clearTimeout(resultTimer);
  }

  function onStorage(event) {
    if (event.key !== HISTORY_KEY) return;
    history = loadHistory();
    commit();
  }

  function ensureListeners() {
    window.addEventListener('pagehide', flushHistory);
    window.addEventListener('storage', onStorage);
  }

  function ensureWorker() {
    if (worker || typeof Worker === 'undefined') return;
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = function (event) { handleResult(event.data || {}); };
      worker.onerror = function () {
        worker = null;
        toast('AI 工作线程不可用，已切换为主线程计算');
        retrySearchOnMain();
      };
    } catch (err) {
      worker = null;
      console.warn('Worker 创建失败', err);
    }
  }

  function attach(fn) {
    render = fn;
    ensureWorker();
    ensureListeners();
    fn(getView());
  }

  document.documentElement.dataset.theme = s.theme === 'melon' ? 'melon' : '';

  return {
    attach,
    destroy,
    getView,
    pointSquare,
    activateSquare,
    attemptMove,
    selectSquare,
    clearSelection,
    newGame,
    undoMove,
    requestHint,
    resign,
    flip,
    setMode,
    setSide,
    setDifficulty,
    setSpeed,
    setTheme,
    setSound,
    exportHistory,
    clearHistory,
    handleKey,
    myTurn
  };
}
