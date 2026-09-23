const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.commandLine.appendSwitch('force-device-scale-factor', '2');
app.whenReady().then(async () => {
  const W = 1180;
  const win = new BrowserWindow({ width: W, height: 900, show: false, useContentSize: true });
  await win.loadFile(path.resolve('.scratch/readme-preview-zh.html'));
  const n = await win.webContents.executeJavaScript(`new Promise(r => {
    const imgs = [...document.images];
    if (!imgs.length) return r('no-imgs');
    let c = 0; imgs.forEach(i => i.complete ? ++c : (i.onload = i.onerror = () => ++c));
    setTimeout(() => r('timeout ' + c + '/' + imgs.length), 15000);
  })`);
  console.log('imgs:', n);
  const h = await win.webContents.executeJavaScript('document.documentElement.scrollHeight');
  const H = Math.min(h, 16000);
  win.setContentSize(W, H);
  await new Promise(r => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
  fs.writeFileSync(path.resolve('.scratch/visual/readme-preview-zh.png'), img.toPNG());
  console.log('zh written', W + 'x' + H);
  app.quit();
}).catch(e => { console.error(e); app.quit(); });
