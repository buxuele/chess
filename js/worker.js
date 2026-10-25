importScripts('engine.js', 'openings.js', 'ai.js');

self.onmessage = function (event) {
  const data = event.data || {};
  if (data.type !== 'search') return;

  let result = null;
  try {
    const state = ChessEngine.createState(data.fen);
    result = ChessAI.search(state, data.options || {});
  } catch (error) {
    self.postMessage({ type: 'error', id: data.id, message: String(error && error.message || error) });
    return;
  }

  self.postMessage({
    type: 'result',
    id: data.id,
    purpose: data.purpose,
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
};
