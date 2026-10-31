export default function Toast({ text, visible }) {
  return (
    <div className={'toast' + (visible ? ' is-visible' : '')} role="status" aria-live="polite">
      {text}
    </div>
  );
}
