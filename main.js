const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const defaultStore = {
  version: 1,
  settings: {
    alwaysOnTop: true,
    openAtLogin: false,
    activeColumnId: 'inbox'
  },
  columns: [
    {
      id: 'inbox',
      name: '默认',
      items: [
        {
          id: 'welcome-note',
          type: 'note',
          text: '这里可以记录临时想法、会议纪要或剪贴内容。',
          completed: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        {
          id: 'welcome-todo',
          type: 'todo',
          text: '待办事项可以勾选完成，也会实时保存。',
          completed: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    }
  ],
  window: {
    width: 460,
    height: 640
  }
};

let mainWindow;
let storePath;

function ensureStorePath() {
  storePath = path.join(app.getPath('userData'), 'notes-store.json');
}

function readStore() {
  ensureStorePath();

  try {
    if (!fs.existsSync(storePath)) {
      writeStore(defaultStore);
      return defaultStore;
    }

    const raw = fs.readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch (error) {
    const backupPath = `${storePath}.broken-${Date.now()}`;
    try {
      if (fs.existsSync(storePath)) {
        fs.copyFileSync(storePath, backupPath);
      }
    } catch (_) {
      // Best effort backup only.
    }
    writeStore(defaultStore);
    return defaultStore;
  }
}

function normalizeStore(store) {
  const settings = Object.assign({}, defaultStore.settings, store.settings || {});
  const windowState = Object.assign({}, defaultStore.window, store.window || {});
  const columns = Array.isArray(store.columns) && store.columns.length > 0
    ? store.columns
    : defaultStore.columns;

  return {
    version: 1,
    settings,
    columns,
    window: windowState
  };
}

function writeStore(data) {
  ensureStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const tempPath = `${storePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(normalizeStore(data), null, 2), 'utf8');
  fs.renameSync(tempPath, storePath);
}

function applyLoginSettings(openAtLogin) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(openAtLogin),
    path: process.execPath,
    args: process.defaultApp ? [path.resolve(process.argv[1])] : []
  });
}

function createWindow() {
  const store = readStore();
  const bounds = store.window || defaultStore.window;

  mainWindow = new BrowserWindow({
    width: Math.max(340, bounds.width || defaultStore.window.width),
    height: Math.max(420, bounds.height || defaultStore.window.height),
    x: Number.isInteger(bounds.x) ? bounds.x : undefined,
    y: Number.isInteger(bounds.y) ? bounds.y : undefined,
    minWidth: 340,
    minHeight: 420,
    frame: false,
    resizable: true,
    show: false,
    alwaysOnTop: Boolean(store.settings.alwaysOnTop),
    title: '浮窗笔记',
    backgroundColor: '#f6f4ef',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  applyLoginSettings(store.settings.openAtLogin);

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('resize', persistWindowBounds);
  mainWindow.on('move', persistWindowBounds);
}

function persistWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const store = readStore();
  store.window = mainWindow.getBounds();
  writeStore(store);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('store:load', () => {
  const store = readStore();
  const loginSettings = app.getLoginItemSettings();
  store.settings.openAtLogin = Boolean(loginSettings.openAtLogin);
  return store;
});

ipcMain.handle('store:save', (_event, data) => {
  const normalized = normalizeStore(data);
  writeStore(normalized);
  applyLoginSettings(normalized.settings.openAtLogin);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(Boolean(normalized.settings.alwaysOnTop), 'floating');
  }

  return normalized;
});

ipcMain.on('store:save-sync', (event, data) => {
  const normalized = normalizeStore(data);
  writeStore(normalized);
  applyLoginSettings(normalized.settings.openAtLogin);
  event.returnValue = normalized;
});

ipcMain.handle('window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});
