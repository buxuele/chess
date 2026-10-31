import { useEffect, useRef } from 'react';

const DIFFICULTY_LABEL = { easy: '简单', normal: '普通', hard: '困难' };

export default function SettingsDrawer({
  open,
  view,
  onClose,
  onMode,
  onSide,
  onDifficulty,
  onSpeed,
  onTheme,
  onSound,
  onExport,
  onClear
}) {
  const cardRef = useRef(null);

  useEffect(function () {
    if (open && cardRef.current) cardRef.current.focus();
  }, [open]);

  if (!open) return null;

  const aiMode = view.mode === 'ai';

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
        className="modal-card drawer-card settings-card"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        tabIndex={-1}
        ref={cardRef}
        onKeyDown={handleKeyDown}
      >
        <div className="drawer-head">
          <span className="card-label">设置</span>
          <button className="ghost-btn" type="button" onClick={onClose}>关闭</button>
        </div>

        <div className="setting-row">
          <span className="setting-name">模式</span>
          <div className="segmented" role="group" aria-label="模式">
            <button
              type="button"
              className={view.mode === 'ai' ? 'is-active' : ''}
              aria-pressed={view.mode === 'ai'}
              onClick={function () { onMode('ai'); }}
            >人机</button>
            <button
              type="button"
              className={view.mode === 'human' ? 'is-active' : ''}
              aria-pressed={view.mode === 'human'}
              onClick={function () { onMode('human'); }}
            >双人</button>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-name">执子</span>
          <div className={'segmented' + (aiMode ? '' : ' is-disabled')} role="group" aria-label="执子">
            <button
              type="button"
              className={view.humanColor === 1 ? 'is-active' : ''}
              aria-pressed={view.humanColor === 1}
              onClick={function () { onSide('white'); }}
            >白</button>
            <button
              type="button"
              className={view.humanColor === -1 ? 'is-active' : ''}
              aria-pressed={view.humanColor === -1}
              onClick={function () { onSide('black'); }}
            >黑</button>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-name">难度</span>
          <div className={'segmented' + (aiMode ? '' : ' is-disabled')} role="group" aria-label="难度">
            {['easy', 'normal', 'hard'].map(function (level) {
              return (
                <button
                  key={level}
                  type="button"
                  className={view.difficulty === level ? 'is-active' : ''}
                  aria-pressed={view.difficulty === level}
                  onClick={function () { onDifficulty(level); }}
                >{DIFFICULTY_LABEL[level]}</button>
              );
            })}
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-name">主题颜色</span>
          <div className="segmented" role="group" aria-label="主题颜色">
            <button
              type="button"
              className={view.theme === 'olive' ? 'is-active' : ''}
              aria-pressed={view.theme === 'olive'}
              onClick={function () { onTheme('olive'); }}
            >橄榄绿</button>
            <button
              type="button"
              className={view.theme === 'melon' ? 'is-active' : ''}
              aria-pressed={view.theme === 'melon'}
              onClick={function () { onTheme('melon'); }}
            >西瓜红</button>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-name">移动速度</span>
          <div className="segmented" role="group" aria-label="移动速度">
            <button
              type="button"
              className={view.speed === 'fast' ? 'is-active' : ''}
              aria-pressed={view.speed === 'fast'}
              onClick={function () { onSpeed('fast'); }}
            >快</button>
            <button
              type="button"
              className={view.speed === 'normal' ? 'is-active' : ''}
              aria-pressed={view.speed === 'normal'}
              onClick={function () { onSpeed('normal'); }}
            >中</button>
            <button
              type="button"
              className={view.speed === 'slow' ? 'is-active' : ''}
              aria-pressed={view.speed === 'slow'}
              onClick={function () { onSpeed('slow'); }}
            >慢</button>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-name">音效</span>
          <button
            className={'switch' + (view.sound ? ' is-on' : '')}
            type="button"
            aria-pressed={view.sound}
            aria-label="音效开关"
            onClick={function () { onSound(!view.sound); }}
          ><span></span></button>
        </div>

        <div className="setting-row">
          <span className="setting-name">对局历史</span>
          <div className="setting-actions">
            <span className="setting-count">{view.historyCount} 局</span>
            <button
              className="ghost-btn"
              type="button"
              onClick={onExport}
              disabled={view.historyCount === 0}
            >导出 JSON</button>
            <button
              className="ghost-btn ghost-danger"
              type="button"
              onClick={onClear}
              disabled={view.finishedCount === 0}
            >清空</button>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-name">个人链接</span>
          <div className="setting-actions">
            <a
              className="link-btn"
              href="https://x.com/fanchuangwater"
              target="_blank"
              rel="noreferrer noopener"
            >X</a>
            <a
              className="link-btn"
              href="https://github.com/buxuele"
              target="_blank"
              rel="noreferrer noopener"
            >GitHub</a>
          </div>
        </div>
      </div>
    </div>
  );
}
