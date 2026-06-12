const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

ipcMain.handle("app:get-state", () => ({ defaultDownloadFolder: "C:/Users/test/Downloads", platform: "win32", ytDlpAvailable: true, ffmpegAvailable: true, impersonateAvailable: true }));
ipcMain.handle("app:set-theme", () => ({ ok: true }));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200, height: 900, show: false, frame: false,
    webPreferences: { preload: path.join(__dirname, "..", "src", "preload.js") },
  });
  await win.loadFile(path.join(__dirname, "..", "src", "index.html"));
  await new Promise(r => setTimeout(r, 7000));

  for (let i = 0; i < 6; i++) {
    await win.webContents.executeJavaScript(`document.querySelector('.settings-btn').dispatchEvent(new MouseEvent('click',{bubbles:true,view:window})); true;`);
    await new Promise(r => setTimeout(r, 400));
    if (await win.webContents.executeJavaScript(`!!document.querySelector('.settings-overlay')`)) break;
  }
  const info = await win.webContents.executeJavaScript(`
    (() => {
      const sels = [...document.querySelectorAll('select')];
      const cookies = sels.find(s => [...s.options].some(o => /Brave|Vivaldi|Whale/.test(o.textContent)));
      const enc = sels.find(s => [...s.options].some(o => /UTF-8/.test(o.textContent)));
      return { selects: sels.length, cookiesOpts: cookies ? cookies.options.length : 0, encOpts: enc ? enc.options.length : 0 };
    })();
  `);
  console.error('INFO ' + JSON.stringify(info));
  await new Promise(r => setTimeout(r, 1500));
  await win.webContents.capturePage();
  await new Promise(r => setTimeout(r, 300));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, "shot-settings.png"), img.toPNG());
  app.quit();
});
