const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('force-device-scale-factor', '2');

app.whenReady().then(async () => {
  const jobs = [
    ['.scratch/readme-preview-en.html', '.scratch/visual/readme-preview-en.png'],
    ['.scratch/readme-preview-zh.html', '.scratch/visual/readme-preview-zh.png'],
  ];
  const W = 1180;
  for (const [html, out] of jobs) {
    const win = new BrowserWindow({ width: W, height: 900, show: false, useContentSize: true });
    await win.loadFile(path.resolve(html));
    await win.webContents.executeJavaScript(`new Promise(r => {
      const imgs = [...document.images];
      if (!imgs.length) return r(0);
      let n = 0; const done = () => r(n);
      imgs.forEach(i => i.complete ? ++n : (i.onload = i.onerror = () => ++n));
      setTimeout(() => r(n), 15000);
    })`).catch(() => {});
    const h = await win.webContents.executeJavaScript('document.documentElement.scrollHeight');
    const H = Math.min(h, 16000);
    win.setContentSize(W, H);
    await new Promise(r => setTimeout(r, 500));
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
    fs.writeFileSync(path.resolve(out), img.toPNG());
    console.log(out, `${W}x${H}`);
    win.destroy();
  }
  app.quit();
});
