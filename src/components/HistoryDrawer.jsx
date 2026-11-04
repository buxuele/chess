import { useEffect, useRef, useState } from 'react';

const RESULT_TEXT = {
  white: '白方胜',
  black: '黑方胜',
  draw: '和棋',
  aborted: '未完成',
  'in-progress': '进行中'
};

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function pairMoves(moves) {
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      no: i / 2 + 1,
      white: moves[i] ? moves[i].san : '',
      black: moves[i + 1] ? moves[i + 1].san : ''
    });
  }
  return rows;
}

export default function HistoryDrawer({ open, games, onClose, onClear }) {
  const cardRef = useRef(null);
  const [expanded, setExpanded] = useState('');

  useEffect(function () {
    if (open && cardRef.current) cardRef.current.focus();
    if (open) setExpanded('');
  }, [open]);

  if (!open) return null;

  function handleBackdrop(event) {
    if (event.target === event.currentTarget) onClose();
  }

  function handleKeyDown(event) {
    if (event.key !== 'Tab' || !cardRef.current) return;
    const nodes = cardRef.current.querySelectorAll('button');
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (!cardRef.current.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && (active === first || active === cardRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal drawer" onClick={handleBackdrop}>
      <div
        className="modal-card drawer-card history-card"
        role="dialog"
        aria-modal="true"
        aria-label="对局历史"
        tabIndex={-1}
        ref={cardRef}
        onKeyDown={handleKeyDown}
      >
        <div className="drawer-head">
          <span className="card-label">对局历史</span>
          <button className="ghost-btn" type="button" onClick={onClose}>关闭</button>
        </div>

        <div className="history-list">
          {games.length === 0 ? (
            <p className="history-empty">还没有记录</p>
          ) : games.map(function (game) {
            const isOpen = expanded === game.id;
            return (
              <div className="history-item" key={game.id}>
                <button
                  type="button"
                  className="history-row"
                  aria-expanded={isOpen}
                  onClick={function () { setExpanded(isOpen ? '' : game.id); }}
                >
                  <span className="history-time">{formatTime(game.startedAt)}</span>
                  <span className="history-result">{game.statusText || RESULT_TEXT[game.result] || ''}</span>
                  <span className="history-meta">{game.moveCount} 步</span>
                </button>
                {isOpen ? (
                  <div className="history-moves">
                    {pairMoves(game.moves || []).map(function (row) {
                      return (
                        <div className="history-move-row" key={row.no}>
                          <span className="history-move-no">{row.no}.</span>
                          <span>{row.white}</span>
                          <span>{row.black}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="history-foot">
          <span className="history-count">共 {games.length} 局</span>
          <button
            className="ghost-btn ghost-danger"
            type="button"
            onClick={onClear}
            disabled={games.length === 0}
          >清空</button>
        </div>
      </div>
    </div>
  );
}
