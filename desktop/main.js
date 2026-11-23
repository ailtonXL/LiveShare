'use strict';

const { app, BrowserWindow, desktopCapturer, dialog, session } = require('electron');
const { networkInterfaces } = require('node:os');
const path = require('node:path');
const server = require('../server');

app.setName('LiveForge Studio');

function shareOrigin(port) {
  if (process.env.LIVEFORGE_PUBLIC_URL) {
    const url = new URL(process.env.LIVEFORGE_PUBLIC_URL);
    if (url.protocol !== 'https:' || url.href !== url.origin + '/') {
      throw new Error('LIVEFORGE_PUBLIC_URL deve ser uma origem HTTPS, sem caminho.');
    }
    return url.origin;
  }
  const address = Object.values(networkInterfaces()).flat()
    .find(entry => entry.family === 'IPv4' && !entry.internal);
  return `http://${address?.address ?? '127.0.0.1'}:${port}`;
}

async function pickSource(parent, sources) {
  const picker = new BrowserWindow({
    parent,
    modal: true,
    show: false,
    width: 680,
    height: 510,
    title: 'Escolher fonte de captura',
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  picker.webContents.on('will-navigate', event => event.preventDefault());
  picker.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const closed = new Promise(resolve => picker.once('closed', () => resolve(-1)));

  try {
    await picker.loadFile(path.join(__dirname, 'picker.html'));
    const choices = sources.map(source => ({
      name: source.name,
      thumbnail: source.thumbnail.isEmpty() ? '' : source.thumbnail.toDataURL(),
    }));
    const selected = picker.webContents.executeJavaScript(`chooseSource(${JSON.stringify(choices)})`);
    picker.show();
    return sources[await Promise.race([selected, closed])];
  } finally {
    if (!picker.isDestroyed()) picker.destroy();
  }
}

async function start() {
  const requestedPort = Number(process.env.PORT || 0);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, '0.0.0.0', resolve);
  });

  const port = server.address().port;
  const localOrigin = `http://127.0.0.1:${port}`;
  const win = new BrowserWindow({
    title: 'LiveForge Studio',
    width: 1320,
    height: 900,
    minWidth: 480,
    minHeight: 540,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--liveforge-share-origin=${shareOrigin(port)}`],
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== localOrigin) event.preventDefault();
  });

  let picking = false;
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (picking || !request.userGesture || !request.videoRequested ||
        request.securityOrigin !== localOrigin || request.frame !== win.webContents.mainFrame) {
      callback({});
      return;
    }

    picking = true;
    let selection = {};
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 240, height: 135 },
      });
      if (sources.length && !win.isDestroyed()) {
        const source = await pickSource(win, sources);
        if (source) {
          selection.video = source;
          if (process.platform === 'win32' && request.audioRequested && source.id.startsWith('screen:')) {
            selection.audio = 'loopback';
          }
        }
      }
    } catch (error) {
      console.error('Falha ao selecionar a fonte de captura:', error);
    } finally {
      picking = false;
      callback(selection);
    }
  });

  await win.loadURL(localOrigin);
}

app.on('window-all-closed', () => app.quit());
app.whenReady().then(start).catch(error => {
  dialog.showErrorBox('Não foi possível iniciar o LiveForge Studio', error.message);
  app.quit();
});
