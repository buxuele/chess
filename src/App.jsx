import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame } from './game/store.js';
import Board from './components/Board.jsx';
import SettingsDrawer from './components/SettingsDrawer.jsx';
import ResultBar from './components/ResultBar.jsx';
import Toast from './components/Toast.jsx';

export default function App() {
  const storeRef = useRef(null);
  if (!storeRef.current) storeRef.current = createGame();
  const store = storeRef.current;

  const [view, setView] = useState(function () { return store.getView(); });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtnRef = useRef(null);

  useEffect(function () {
    store.attach(setView);
    return function () { store.destroy(); };
  }, [store]);

  useEffect(function () {
    document.documentElement.dataset.theme = view.theme === 'melon' ? 'melon' : '';
  }, [view.theme]);

  const openSettings = useCallback(function () {
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(function () {
    setSettingsOpen(false);
    if (settingsBtnRef.current) settingsBtnRef.current.focus();
  }, []);

  useEffect(function () {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        if (settingsOpen) {
          closeSettings();
          return;
        }
        store.clearSelection();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (settingsOpen) return;
      if (event.target && /input|textarea/i.test(event.target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        openSettings();
        return;
      }
      if (key === 'u' || key === 'n' || key === 'f' || key === 'h' || key === 'r') {
        event.preventDefault();
        store.handleKey(key);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return function () { document.removeEventListener('keydown', onKeyDown); };
  }, [settingsOpen, closeSettings, openSettings, store]);

  return (
    <div className="shell">
      <main className="layout">
        <div className="top-actions">
          <button className="top-btn" type="button" ref={settingsBtnRef} onClick={openSettings}>设置</button>
          <button className="top-btn top-btn-primary" type="button" onClick={store.newGame}>新对局</button>
        </div>

        <div className="board-column">
          <Board
            view={view}
            onSelect={store.selectSquare}
            onPoint={store.pointSquare}
            onMove={store.attemptMove}
            onActivate={store.activateSquare}
            onBusy={function () { store.pointSquare(-1); }}
          />
          <ResultBar
            visible={view.resultVisible}
            status={view.status}
            mode={view.mode}
            humanColor={view.humanColor}
            onAgain={store.newGame}
          />
        </div>
      </main>

      <SettingsDrawer
        open={settingsOpen}
        view={view}
        onClose={closeSettings}
        onMode={store.setMode}
        onSide={store.setSide}
        onDifficulty={store.setDifficulty}
        onSpeed={store.setSpeed}
        onTheme={store.setTheme}
        onSound={store.setSound}
        onExport={store.exportHistory}
        onClear={store.clearHistory}
      />

      <Toast text={view.toast} visible={view.toastVisible} />
      <p className="sr-only" role="status" aria-live="polite">{view.statusText}</p>
    </div>
  );
}
