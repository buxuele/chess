const REASON_TEXT = {
  checkmate: '将杀',
  stalemate: '逼和',
  fifty: '五十回合规则',
  material: '子力不足',
  repetition: '三次重复局面',
  resign: '一方认输'
};

export default function ResultBar({ visible, status, mode, humanColor, quote, onAgain }) {
  if (!visible || !status) return null;

  const draw = status.result === 'draw';
  let title;
  if (draw) title = '和棋';
  else if (mode === 'human') title = status.result === 'white' ? '白方胜' : '黑方胜';
  else {
    const won = (status.result === 'white') === (humanColor === 1);
    title = won ? '你赢了' : '你输了';
  }

  const cls = draw ? 'is-draw' : (status.result === 'white' ? 'is-white' : 'is-black');

  return (
    <div className={'result-bar ' + cls} id="resultBar">
      <span className="result-dot" aria-hidden="true"></span>
      <div className="result-main">
        <span className="result-title" id="resultTitle">{title}</span>
        <span className="result-reason" id="resultReason">{REASON_TEXT[status.reason] || ''}</span>
        {quote ? <span className="result-quote">{quote}</span> : null}
      </div>
      <button className="result-again" type="button" onClick={onAgain}>不服再来</button>
    </div>
  );
}
