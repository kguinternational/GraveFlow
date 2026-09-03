const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell, dialog } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─────────────────────────────────────────
// Keep single instance
// ─────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

// ─────────────────────────────────────────
// State
// ─────────────────────────────────────────
let mainWindow = null;
let tray = null;
let serverProc = null;
let csuiteProc = null;
let serversReady = false;

const VIEWS = {
  home:    { label: '🏠 Home',         file: 'index.html' },
  rider:   { label: '🌹 Rider',        file: 'rider.html' },
  driver:  { label: '🚗 Driver',       file: 'driver.html' },
  admin:   { label: '📡 Operations',   file: 'admin.html' },
  csuite:  { label: '👑 C-Suite',      file: 'csuite.html' },
};

// ─────────────────────────────────────────
// Start backend servers as child processes
// ─────────────────────────────────────────
function startServers() {
  const base = path.join(__dirname);

  serverProc = fork(path.join(base, 'server.js'), [], {
    env: { ...process.env },
    silent: true
  });
  serverProc.stdout.on('data', d => console.log('[SERVER]', d.toString().trim()));
  serverProc.stderr.on('data', d => console.error('[SERVER ERR]', d.toString().trim()));
  serverProc.on('exit', code => console.log('[SERVER] exited', code));

  csuiteProc = fork(path.join(base, 'csuite.js'), [], {
    env: { ...process.env },
    silent: true
  });
  csuiteProc.stdout.on('data', d => console.log('[CSUITE]', d.toString().trim()));
  csuiteProc.stderr.on('data', d => console.error('[CSUITE ERR]', d.toString().trim()));
  csuiteProc.on('exit', code => console.log('[CSUITE] exited', code));

  // Give servers 2s to boot then mark ready
  setTimeout(() => { serversReady = true; }, 2000);
}

function stopServers() {
  if (serverProc) { serverProc.kill(); serverProc = null; }
  if (csuiteProc) { csuiteProc.kill(); csuiteProc = null; }
}

// ─────────────────────────────────────────
// Create main window
// ─────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',  // native macOS look
    backgroundColor: '#08080a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false  // allow loading local files + localhost APIs
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false  // show after ready-to-show
  });

  // Show splash while servers boot
  mainWindow.loadFile(path.join(__dirname, 'splash.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Navigate to real app once servers are ready
    setTimeout(() => {
      mainWindow.loadFile(path.join(__dirname, 'app.html'));
    }, 2500);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─────────────────────────────────────────
// App menu
// ─────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'GraveFlow',
      submenu: [
        { label: 'About GraveFlow', click: () => dialog.showMessageBox({ title: 'GraveFlow', message: 'GraveFlow v1.0\nAI-powered cemetery care platform.\n\nPowered by Ollama + Llama 3.2', buttons: ['OK'] }) },
        { type: 'separator' },
        { label: 'Quit GraveFlow', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: '🏠 Home',       accelerator: 'CmdOrCtrl+1', click: () => navigate('home') },
        { label: '🌹 Rider UI',   accelerator: 'CmdOrCtrl+2', click: () => navigate('rider') },
        { label: '🚗 Driver PWA', accelerator: 'CmdOrCtrl+3', click: () => navigate('driver') },
        { label: '📡 Operations', accelerator: 'CmdOrCtrl+4', click: () => navigate('admin') },
        { label: '👑 C-Suite',    accelerator: 'CmdOrCtrl+5', click: () => navigate('csuite') },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { label: 'Dev Tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow?.webContents.toggleDevTools() },
      ]
    },
    {
      label: 'Servers',
      submenu: [
        { label: 'Server Status', click: () => shell.openExternal('http://localhost:8002/health') },
        { label: 'C-Suite Status', click: () => shell.openExternal('http://localhost:8003/health') },
        { label: 'Ledger (JSON)', click: () => shell.openExternal('http://localhost:8002/ledger') },
      ]
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: 'Zoom',     role: 'zoom' },
        { label: 'Close',    accelerator: 'CmdOrCtrl+W', role: 'close' },
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function navigate(view) {
  if (!mainWindow) return;
  const v = VIEWS[view];
  if (v) mainWindow.webContents.send('navigate', view);
}

// ─────────────────────────────────────────
// IPC handlers
// ─────────────────────────────────────────
ipcMain.handle('get-views', () => VIEWS);
ipcMain.handle('servers-ready', () => serversReady);
ipcMain.on('navigate', (_, view) => navigate(view));

// ─────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────
app.on('ready', () => {
  startServers();
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopServers();
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

app.on('before-quit', () => stopServers());

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
