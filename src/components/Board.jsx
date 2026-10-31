import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Engine from '../game/engine.js';
import { pieceSvg } from '../game/pieces.js';

const PIECE_NAMES = { 1: '兵', 2: '马', 3: '象', 4: '车', 5: '后', 6: '王' };

function squareAtPoint(boardEl, clientX, clientY, flipped) {
  const rect = boardEl.getBoundingClientRect();
  if (!rect.width) return -1;
  const size = rect.width / 8;
  const col = Math.floor((clientX - rect.left) / size);
  const row = Math.floor((clientY - rect.top) / size);
  if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
  const file = flipped ? 7 - col : col;
  const rank = flipped ? row : 7 - row;
  return rank * 16 + file;
}

export default function Board({ view, onSelect, onPoint, onMove, onActivate, onBusy }) {
  const boardRef = useRef(null);
  const dragRef = useRef(null);
  const [kbSquare, setKbSquare] = useState(-1);

  const canMove = view.mode === 'human' || view.turn === view.humanColor;
  const checkSq = view.status && view.status.check ? view.kingSquare : -1;

  useLayoutEffect(() => {
    const anim = view.anim;
    const root = boardRef.current;
    if (!anim || !root) return;
    const pieceEl = root.querySelector('.sq[data-sq="' + anim.to + '"] .piece');
    const toCell = root.querySelector('.sq[data-sq="' + anim.to + '"]');
    const fromCell = root.querySelector('.sq[data-sq="' + anim.from + '"]');
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
    return function () { motion.cancel(); };
  }, [view.anim]);

  useEffect(function () {
    if (kbSquare < 0) return;
    const cell = boardRef.current && boardRef.current.querySelector('.sq[data-sq="' + kbSquare + '"]');
    if (cell) cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [kbSquare]);

  useEffect(function () {
    function onEscape(event) {
      if (event.key === 'Escape') setKbSquare(-1);
    }
    document.addEventListener('keydown', onEscape);
    return function () { document.removeEventListener('keydown', onEscape); };
  }, []);

  function isTarget(sq) {
    return view.legal.some(function (m) { return m.to === sq; });
  }

  function handlePointerDown(event) {
    const cell = event.target.closest('.sq');
    if (!cell || view.gameOver) return;
    const sq = Number(cell.dataset.sq);

    if (view.thinking) {
      onBusy();
      return;
    }
    if (!canMove) return;
    if (view.selected >= 0 && isTarget(sq)) {
      onPoint(sq, false);
      return;
    }

    const piece = view.board[sq];
    if (piece && Engine.colorOf(piece) === view.turn) {
      onSelect(sq);
      dragRef.current = {
        sq: sq,
        x: event.clientX,
        y: event.clientY,
        moved: false
      };
      if (boardRef.current && boardRef.current.setPointerCapture) {
        try {
          boardRef.current.setPointerCapture(event.pointerId);
        } catch (err) {
          dragRef.current = null;
        }
      }
      return;
    }

    onPoint(sq, false);
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.sqrt(dx * dx + dy * dy) < 6) return;
    drag.moved = true;
    const el = boardRef.current.querySelector('.sq[data-sq="' + drag.sq + '"] .piece');
    if (el) {
      el.classList.add('dragging');
      el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(1.08)';
    }
  }

  function releaseDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return null;
    const el = boardRef.current.querySelector('.sq[data-sq="' + drag.sq + '"] .piece');
    if (el) {
      el.classList.remove('dragging');
      el.style.transform = '';
    }
    return drag;
  }

  function handlePointerUp(event) {
    const drag = releaseDrag();
    if (!drag || !drag.moved) return;
    const to = squareAtPoint(boardRef.current, event.clientX, event.clientY, view.flipped);
    if (to >= 0 && isTarget(to)) onMove(drag.sq, to, true);
  }

  function handlePointerCancel() {
    releaseDrag();
  }

  function handleKeyDown(event) {
    const key = event.key;
    const isArrow = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
    const isActivate = key === 'Enter' || key === ' ';
    if (!isArrow && !isActivate) return;

    if (isActivate) {
      event.preventDefault();
      if (kbSquare >= 0) onActivate(kbSquare);
      return;
    }

    event.preventDefault();
    let vr;
    let vf;
    if (kbSquare < 0) {
      vr = view.flipped ? 0 : 7;
      vf = 0;
    } else {
      const rank = kbSquare >> 4;
      const file = kbSquare & 7;
      vr = view.flipped ? rank : 7 - rank;
      vf = view.flipped ? 7 - file : file;
    }
    if (key === 'ArrowUp') vr += view.flipped ? 1 : -1;
    else if (key === 'ArrowDown') vr += view.flipped ? -1 : 1;
    else if (key === 'ArrowLeft') vf -= 1;
    else if (key === 'ArrowRight') vf += 1;
    if (vr < 0 || vr > 7 || vf < 0 || vf > 7) return;
    const rank = view.flipped ? vr : 7 - vr;
    const file = view.flipped ? 7 - vf : vf;
    setKbSquare(rank * 16 + file);
  }

  const rows = [];
  for (let vr = 0; vr < 8; vr++) {
    const cells = [];
    for (let vf = 0; vf < 8; vf++) {
      const rank = view.flipped ? vr : 7 - vr;
      const file = view.flipped ? 7 - vf : vf;
      const sq = rank * 16 + file;
      const piece = view.board[sq];
      const classes = ['sq', (rank + file) % 2 === 0 ? 'dark' : 'light'];
      if (view.selected === sq) classes.push('selected');
      if (view.lastMove && (view.lastMove.from === sq || view.lastMove.to === sq)) classes.push('last');
      if (view.hint && (view.hint.from === sq || view.hint.to === sq)) classes.push('hint');
      if (sq === checkSq) classes.push('in-check');
      if (sq === checkSq && view.gameOver) classes.push('is-mate');
      if (view.gameOver && view.status && view.status.reason === 'checkmate' && view.lastMove && view.lastMove.to === sq) {
        classes.push('mate-source');
      }
      if (sq === kbSquare) classes.push('kbfocus');
      if (isTarget(sq)) classes.push(piece ? 'target-capture' : 'target');

      const label = piece
        ? Engine.alg(sq) + ' ' + (piece > 0 ? '白' : '黑') + PIECE_NAMES[Math.abs(piece)]
        : Engine.alg(sq);

      cells.push(
        <div
          key={sq}
          className={classes.join(' ')}
          data-sq={sq}
          id={'cell-' + Engine.alg(sq)}
          role="gridcell"
          aria-label={label}
        >
          {piece ? (
            <div
              className={'piece ' + (piece > 0 ? 'w' : 'b')}
              dangerouslySetInnerHTML={{ __html: pieceSvg(Math.abs(piece), piece > 0) }}
            />
          ) : null}
        </div>
      );
    }
    rows.push(
      <div className="srow" role="row" key={vr}>
        {cells}
      </div>
    );
  }

  return (
    <div className="board-frame">
      <div
        className={'board' + (view.thinking ? ' is-thinking' : '')}
        id="board"
        role="grid"
        aria-label="国际象棋棋盘"
        aria-rowcount={8}
        aria-colcount={8}
        aria-activedescendant={kbSquare >= 0 ? 'cell-' + Engine.alg(kbSquare) : undefined}
        tabIndex={0}
        ref={boardRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={function (e) { e.preventDefault(); }}
        onKeyDown={handleKeyDown}
        onBlur={function () { setKbSquare(-1); }}
      >
        {rows}
      </div>
    </div>
  );
}
