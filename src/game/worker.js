import Engine from './engine.js';
import AI from './ai.js';

self.onmessage = function (event) {
  const data = event.data || {};
  if (data.type !== 'search') return;

  let result = null;
  try {
    const state = Engine.createState(data.fen);
    result = AI.search(state, data.options || {});
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: data.id,
      message: String((error && error.message) || error)
    });
    return;
  }

  self.postMessage({
    type: 'result',
    id: data.id,
    purpose: data.purpose,
    move: result
      ? {
          from: result.move.from,
          to: result.move.to,
          promotion: result.move.promotion,
          flag: result.move.flag
        }
      : null,
    score: result ? result.score : 0,
    depth: result ? result.depth : 0,
    nodes: result ? result.nodes : 0
  });
};
