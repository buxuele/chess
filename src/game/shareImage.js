function wrapText(ctx, text, centerX, startY, maxWidth, lineHeight) {
  const chars = String(text || '').split('');
  let line = '';
  let y = startY;
  for (const ch of chars) {
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, centerX, y);
      line = ch;
      y += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, centerX, y);
  return y;
}

export function downloadShareImage(info) {
  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#cfd3cd';
  ctx.fillRect(0, 0, size, size);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#4f5852';
  ctx.font = '28px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText('国际象棋', size / 2, 120);

  ctx.fillStyle = '#1b201d';
  ctx.font = '700 128px "Songti SC", "Iowan Old Style", serif';
  ctx.fillText(info.title || '', size / 2, 470);

  ctx.fillStyle = '#4f5852';
  ctx.font = '38px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(info.reason || '', size / 2, 560);

  ctx.fillStyle = '#2a302c';
  ctx.font = '48px -apple-system, "PingFang SC", sans-serif';
  wrapText(ctx, info.quote || '', size / 2, 710, 820, 66);

  ctx.fillStyle = '#626b64';
  ctx.font = '28px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText('chess-beryl-five.vercel.app', size / 2, 990);

  canvas.toBlob(function (blob) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'chess-result.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }, 'image/png');
}
