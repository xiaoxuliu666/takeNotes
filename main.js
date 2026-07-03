const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const STORE_FILE = 'notes-store.json';
const CONFIG_FILE = 'storage-config.json';

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultDataDir() {
  return app.getPath('userData');
}

function configPath() {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

function normalizeDir(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') {
    return defaultDataDir();
  }

  return path.resolve(dirPath);
}

function normalizeConfig(config) {
  const currentDataDir = normalizeDir(config && config.currentDataDir);
  const rawRecent = Array.isArray(config && config.recentDataDirs) ? config.recentDataDirs : [];
  const recentDataDirs = [currentDataDir]
    .concat(rawRecent.map(normalizeDir))
    .filter((dir, index, list) => list.indexOf(dir) === index)
    .slice(0, 10);

  return {
    currentDataDir,
    recentDataDirs
  };
}

function readConfig() {
  try {
    const filePath = configPath();
    if (!fs.existsSync(filePath)) {
      const config = normalizeConfig({ currentDataDir: defaultDataDir(), recentDataDirs: [defaultDataDir()] });
      writeConfig(config);
      return config;
    }

    return normalizeConfig(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (_) {
    return normalizeConfig({ currentDataDir: defaultDataDir(), recentDataDirs: [defaultDataDir()] });
  }
}

function writeConfig(config) {
  const normalized = normalizeConfig(config);
  const filePath = configPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function updateConfig(change) {
  const config = readConfig();
  change(config);
  return writeConfig(config);
}

function currentDataDir() {
  return readConfig().currentDataDir;
}

function storePath(dataDir = currentDataDir()) {
  return path.join(normalizeDir(dataDir), STORE_FILE);
}

function rememberDataDir(dataDir) {
  const nextDir = normalizeDir(dataDir);
  return updateConfig((config) => {
    config.currentDataDir = nextDir;
    config.recentDataDirs = [nextDir]
      .concat(config.recentDataDirs || [])
      .map(normalizeDir)
      .filter((dir, index, list) => list.indexOf(dir) === index)
      .slice(0, 10);
  });
}

function createEmptyStore(baseStore) {
  const base = normalizeStore(baseStore || defaultStore);
  return {
    version: 1,
    settings: Object.assign({}, base.settings, { activeColumnId: 'inbox' }),
    columns: [
      {
        id: 'inbox',
        name: '默认',
        items: []
      }
    ],
    window: base.window
  };
}

function readStore(dataDir = currentDataDir()) {
  const filePath = storePath(dataDir);

  try {
    if (!fs.existsSync(filePath)) {
      writeStore(defaultStore, dataDir);
      return normalizeStore(defaultStore);
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch (error) {
    const backupPath = `${filePath}.broken-${Date.now()}`;
    try {
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, backupPath);
      }
    } catch (_) {
      // Best effort backup only.
    }
    writeStore(defaultStore, dataDir);
    return normalizeStore(defaultStore);
  }
}

function normalizeStore(store) {
  const rawStore = store || {};
  const settings = Object.assign({}, defaultStore.settings, rawStore.settings || {});
  const windowState = Object.assign({}, defaultStore.window, rawStore.window || {});
  const columns = Array.isArray(rawStore.columns) && rawStore.columns.length > 0
    ? clone(rawStore.columns)
    : clone(defaultStore.columns);
  const fallbackTime = Date.now();

  columns.forEach((column) => {
    if (!Array.isArray(column.items)) {
      column.items = [];
      return;
    }

    column.items.forEach((item) => {
      const updatedAt = Number(item.updatedAt);
      const createdAt = Number(item.createdAt);

      item.updatedAt = Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : fallbackTime;
      item.createdAt = Number.isFinite(createdAt) && createdAt > 0 ? createdAt : item.updatedAt;
    });
  });

  return {
    version: 1,
    settings,
    columns,
    window: windowState
  };
}

function writeStore(data, dataDir = currentDataDir()) {
  const filePath = storePath(dataDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(normalizeStore(data), null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
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
  return {
    store,
    storage: getStorageInfo()
  };
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

function getStorageInfo() {
  const config = readConfig();
  return {
    currentDataDir: config.currentDataDir,
    recentDataDirs: config.recentDataDirs,
    storeFileName: STORE_FILE
  };
}

ipcMain.handle('storage:get', () => {
  return getStorageInfo();
});

ipcMain.handle('storage:choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择笔记存储文件夹',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  return normalizeDir(result.filePaths[0]);
});

ipcMain.handle('storage:switch', (_event, dataDir) => {
  const nextDir = normalizeDir(dataDir);
  rememberDataDir(nextDir);
  const store = readStore(nextDir);
  const loginSettings = app.getLoginItemSettings();
  store.settings.openAtLogin = Boolean(loginSettings.openAtLogin);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(Boolean(store.settings.alwaysOnTop), 'floating');
  }

  return {
    store,
    storage: getStorageInfo()
  };
});

ipcMain.handle('storage:migrate', (_event, targetDataDir) => {
  const sourceDir = currentDataDir();
  const targetDir = normalizeDir(targetDataDir);

  if (sourceDir === targetDir) {
    throw new Error('目标文件夹不能和当前文件夹相同');
  }

  const currentStore = readStore(sourceDir);
  writeStore(currentStore, targetDir);
  writeStore(createEmptyStore(currentStore), sourceDir);
  rememberDataDir(targetDir);

  return {
    store: readStore(targetDir),
    storage: getStorageInfo()
  };
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

ipcMain.handle('link:open', (_event, url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    shell.openExternal(parsed.toString());
    return true;
  } catch (_) {
    return false;
  }
});
