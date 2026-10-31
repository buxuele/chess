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

export function playSound(kind) {
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
