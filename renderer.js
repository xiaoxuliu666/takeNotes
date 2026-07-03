const api = window.floatingNotes;

const elements = {
  saveState: document.getElementById('saveState'),
  settingsButton: document.getElementById('settingsButton'),
  pinButton: document.getElementById('pinButton'),
  loginButton: document.getElementById('loginButton'),
  minimizeButton: document.getElementById('minimizeButton'),
  closeButton: document.getElementById('closeButton'),
  addColumnButton: document.getElementById('addColumnButton'),
  columnList: document.getElementById('columnList'),
  columnNameInput: document.getElementById('columnNameInput'),
  deleteColumnButton: document.getElementById('deleteColumnButton'),
  searchInput: document.getElementById('searchInput'),
  itemTextInput: document.getElementById('itemTextInput'),
  noteModeButton: document.getElementById('noteModeButton'),
  todoModeButton: document.getElementById('todoModeButton'),
  noteCount: document.getElementById('noteCount'),
  todoCount: document.getElementById('todoCount'),
  composerLabel: document.getElementById('composerLabel'),
  addItemButton: document.getElementById('addItemButton'),
  itemList: document.getElementById('itemList'),
  settingsPanel: document.getElementById('settingsPanel'),
  closeSettingsButton: document.getElementById('closeSettingsButton'),
  currentStoragePath: document.getElementById('currentStoragePath'),
  chooseStorageButton: document.getElementById('chooseStorageButton'),
  migrateStorageButton: document.getElementById('migrateStorageButton'),
  storageFolderList: document.getElementById('storageFolderList')
};

let store;
let storageInfo;
let currentMode = 'note';
let saveTimer;
let editingItemId = null;
let highlightedItemId = null;

const linkPattern = /https?:\/\/[^\s<>"']+/gi;

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
  return Date.now();
}

function formatTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(timestamp));
}

function createItemTimeMeta(item) {
  const meta = document.createElement('div');
  meta.className = 'item-time-meta';

  const created = document.createElement('span');
  created.textContent = `创建：${formatTimestamp(item.createdAt)}`;

  const updated = document.createElement('span');
  updated.textContent = `修改：${formatTimestamp(item.updatedAt)}`;

  meta.append(created, updated);
  return meta;
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function fuzzyScore(query, target) {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTarget = normalizeSearchText(target);

  if (!normalizedQuery) {
    return 0;
  }

  if (normalizedTarget.includes(normalizedQuery)) {
    return 100 + normalizedQuery.length;
  }

  const terms = normalizedQuery.split(' ').filter(Boolean);
  if (terms.length > 1) {
    let total = 0;
    for (const term of terms) {
      const score = fuzzyScore(term, normalizedTarget);
      if (!score) {
        return 0;
      }
      total += score;
    }
    return total;
  }

  let queryIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;

  for (let targetIndex = 0; targetIndex < normalizedTarget.length && queryIndex < normalizedQuery.length; targetIndex += 1) {
    if (normalizedTarget[targetIndex] === normalizedQuery[queryIndex]) {
      if (firstMatch === -1) {
        firstMatch = targetIndex;
      }
      lastMatch = targetIndex;
      queryIndex += 1;
    }
  }

  if (queryIndex !== normalizedQuery.length) {
    return 0;
  }

  const spreadPenalty = Math.max(0, lastMatch - firstMatch - normalizedQuery.length);
  return Math.max(1, 60 - spreadPenalty);
}

function searchItems(query) {
  const results = [];

  store.columns.forEach((column) => {
    column.items.forEach((item) => {
      const searchable = `${column.name || ''} ${item.type === 'todo' ? '待办' : '笔记'} ${item.text || ''}`;
      const score = fuzzyScore(query, searchable);

      if (score > 0) {
        results.push({
          score,
          columnId: column.id,
          columnName: column.name || '未命名',
          item
        });
      }
    });
  });

  return results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return (b.item.updatedAt || 0) - (a.item.updatedAt || 0);
  });
}

function trimLinkPunctuation(url) {
  let cleanUrl = url;
  let suffix = '';

  while (/[),.;:!?，。；：！？）]$/.test(cleanUrl)) {
    suffix = `${cleanUrl.slice(-1)}${suffix}`;
    cleanUrl = cleanUrl.slice(0, -1);
  }

  return { cleanUrl, suffix };
}

function appendTextWithLinks(container, text) {
  const value = text || '';
  let lastIndex = 0;
  linkPattern.lastIndex = 0;

  for (const match of value.matchAll(linkPattern)) {
    const rawUrl = match[0];
    const start = match.index;
    const { cleanUrl, suffix } = trimLinkPunctuation(rawUrl);

    if (start > lastIndex) {
      container.appendChild(document.createTextNode(value.slice(lastIndex, start)));
    }

    if (cleanUrl) {
      const link = document.createElement('a');
      link.className = 'item-link';
      link.href = cleanUrl;
      link.textContent = cleanUrl;
      link.title = cleanUrl;
      link.rel = 'noreferrer';
      container.appendChild(link);
    }

    if (suffix) {
      container.appendChild(document.createTextNode(suffix));
    }

    lastIndex = start + rawUrl.length;
  }

  if (lastIndex < value.length) {
    container.appendChild(document.createTextNode(value.slice(lastIndex)));
  }
}

function activeColumn() {
  if (!store.columns.length) {
    const column = { id: uid('column'), name: '默认', items: [] };
    store.columns.push(column);
    store.settings.activeColumnId = column.id;
    return column;
  }

  return store.columns.find((column) => column.id === store.settings.activeColumnId) || store.columns[0];
}

function setSaveState(text) {
  elements.saveState.textContent = text;
}

function shortPath(folderPath) {
  if (!folderPath) {
    return '';
  }

  const parts = folderPath.split('/').filter(Boolean);
  if (parts.length <= 3) {
    return folderPath;
  }

  return `.../${parts.slice(-3).join('/')}`;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setSaveState('保存中...');
  saveTimer = setTimeout(async () => {
    try {
      store = await api.saveStore(store);
      setSaveState('已保存');
      renderChrome();
    } catch (error) {
      setSaveState('保存失败');
      console.error(error);
    }
  }, 220);
}

function renderChrome() {
  elements.pinButton.classList.toggle('active', Boolean(store.settings.alwaysOnTop));
  elements.pinButton.title = store.settings.alwaysOnTop ? '已置顶，点击取消' : '未置顶，点击固定到最顶层';
  elements.loginButton.classList.toggle('active', Boolean(store.settings.openAtLogin));
  elements.loginButton.title = store.settings.openAtLogin ? '已开机自启，点击取消' : '未开机自启，点击开启';
}

function renderStorageSettings() {
  if (!storageInfo) {
    return;
  }

  elements.currentStoragePath.textContent = storageInfo.currentDataDir;
  elements.currentStoragePath.title = storageInfo.currentDataDir;
  elements.storageFolderList.innerHTML = '';

  storageInfo.recentDataDirs.forEach((folderPath) => {
    const row = document.createElement('div');
    row.className = `folder-row${folderPath === storageInfo.currentDataDir ? ' active' : ''}`;

    const pathText = document.createElement('div');
    pathText.className = 'folder-path';
    pathText.textContent = shortPath(folderPath);
    pathText.title = folderPath;

    const action = document.createElement('button');
    action.className = 'text-button folder-switch-button';
    action.type = 'button';
    action.dataset.folderPath = folderPath;
    action.textContent = folderPath === storageInfo.currentDataDir ? '当前' : '切换';
    action.disabled = folderPath === storageInfo.currentDataDir;

    row.append(pathText, action);
    elements.storageFolderList.appendChild(row);
  });
}

function renderColumns() {
  elements.columnList.innerHTML = '';
  const selected = activeColumn();

  store.columns.forEach((column) => {
    const button = document.createElement('button');
    button.className = `column-item${column.id === selected.id ? ' active' : ''}`;
    button.type = 'button';
    button.dataset.columnId = column.id;

    const label = document.createElement('span');
    label.className = 'column-label';
    label.textContent = column.name || '未命名';

    const count = document.createElement('span');
    count.className = 'column-count';
    count.textContent = String(column.items.length);

    button.append(label, count);
    elements.columnList.appendChild(button);
  });
}

function renderSearchResults(query) {
  const results = searchItems(query);
  elements.itemList.innerHTML = '';

  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '没有找到匹配内容';
    elements.itemList.appendChild(empty);
    return;
  }

  results.forEach((result) => {
    const row = document.createElement('article');
    row.className = `search-result ${result.item.type}`;
    row.dataset.columnId = result.columnId;
    row.dataset.itemId = result.item.id;
    row.dataset.itemType = result.item.type;

    const meta = document.createElement('div');
    meta.className = 'search-meta';

    const type = document.createElement('span');
    type.className = 'search-type';
    type.textContent = result.item.type === 'todo' ? '待办' : '笔记';

    const column = document.createElement('span');
    column.className = 'search-column';
    column.textContent = result.columnName;

    meta.append(type, column);

    const preview = document.createElement('div');
    preview.className = 'search-preview';
    appendTextWithLinks(preview, result.item.text || '');

    row.append(meta, preview);
    elements.itemList.appendChild(row);
  });
}

function renderItems() {
  const column = activeColumn();
  const searchQuery = elements.searchInput.value.trim();
  const visibleItems = column.items.filter((item) => item.type === currentMode);
  const sectionName = currentMode === 'todo' ? '待办' : '笔记';

  elements.columnNameInput.value = column.name || '';
  elements.deleteColumnButton.disabled = store.columns.length <= 1;

  if (searchQuery) {
    renderSearchResults(searchQuery);
    return;
  }

  elements.itemList.innerHTML = '';

  if (!visibleItems.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = `这个栏目还没有${sectionName}`;
    elements.itemList.appendChild(empty);
    return;
  }

  visibleItems
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .forEach((item) => {
      const row = document.createElement('article');
      row.className = `note-item ${item.type}${item.completed ? ' completed' : ''}${highlightedItemId === item.id ? ' highlighted' : ''}`;
      row.dataset.itemId = item.id;

      if (item.type === 'todo') {
        const checkbox = document.createElement('input');
        checkbox.className = 'todo-check';
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(item.completed);
        checkbox.title = '完成状态';
        row.appendChild(checkbox);
      } else {
        const type = document.createElement('div');
        type.className = 'note-type';
        type.textContent = 'N';
        row.appendChild(type);
      }

      const body = document.createElement('div');
      body.className = 'item-body';

      if (editingItemId === item.id) {
        const text = document.createElement('textarea');
        text.className = 'item-text';
        text.value = item.text || '';
        text.rows = Math.min(8, Math.max(2, Math.ceil((item.text || '').length / 28)));
        text.maxLength = 2000;
        text.ariaLabel = item.type === 'todo' ? '待办内容' : '笔记内容';
        body.appendChild(text);
      } else {
        const preview = document.createElement('div');
        preview.className = 'item-preview';
        preview.tabIndex = 0;
        preview.title = '点击空白处编辑，点击链接跳转';
        appendTextWithLinks(preview, item.text || '');
        body.appendChild(preview);
      }

      body.appendChild(createItemTimeMeta(item));

      const del = document.createElement('button');
      del.className = 'icon-button danger delete-item-button';
      del.type = 'button';
      del.title = '删除';
      del.ariaLabel = '删除';
      del.textContent = 'X';

      row.append(body, del);
      elements.itemList.appendChild(row);
    });
}

function renderMode() {
  const column = activeColumn();
  const noteCount = column.items.filter((item) => item.type === 'note').length;
  const todoCount = column.items.filter((item) => item.type === 'todo').length;
  const isNoteMode = currentMode === 'note';

  elements.noteCount.textContent = String(noteCount);
  elements.todoCount.textContent = String(todoCount);
  elements.noteModeButton.classList.toggle('active', isNoteMode);
  elements.todoModeButton.classList.toggle('active', !isNoteMode);
  elements.noteModeButton.setAttribute('aria-selected', String(isNoteMode));
  elements.todoModeButton.setAttribute('aria-selected', String(!isNoteMode));
  elements.itemTextInput.placeholder = isNoteMode ? '写笔记...' : '写待办...';
  elements.composerLabel.textContent = isNoteMode ? '新增笔记' : '新增待办';
}

function render() {
  renderChrome();
  renderStorageSettings();
  renderMode();
  renderColumns();
  renderItems();
}

function mutate(change, shouldRender = true) {
  change();
  scheduleSave();
  if (shouldRender) {
    render();
  }
}

function addColumn() {
  const column = {
    id: uid('column'),
    name: `栏目 ${store.columns.length + 1}`,
    items: []
  };

  mutate(() => {
    store.columns.push(column);
    store.settings.activeColumnId = column.id;
  });

  elements.columnNameInput.focus();
  elements.columnNameInput.select();
}

function deleteActiveColumn() {
  if (store.columns.length <= 1) {
    return;
  }

  const column = activeColumn();
  const confirmed = window.confirm(`删除栏目“${column.name || '未命名'}”？其中内容也会删除。`);
  if (!confirmed) {
    return;
  }

  mutate(() => {
    const index = store.columns.findIndex((item) => item.id === column.id);
    store.columns.splice(index, 1);
    store.settings.activeColumnId = store.columns[Math.max(0, index - 1)].id;
  });
}

function addItem() {
  const text = elements.itemTextInput.value.trim();
  if (!text) {
    elements.itemTextInput.focus();
    return;
  }

  mutate(() => {
    activeColumn().items.unshift({
      id: uid('item'),
      type: currentMode,
      text,
      completed: false,
      createdAt: now(),
      updatedAt: now()
    });
    elements.itemTextInput.value = '';
  });

  elements.itemTextInput.focus();
}

function findItem(itemId) {
  const column = activeColumn();
  return column.items.find((item) => item.id === itemId);
}

function enterEditMode(itemId) {
  editingItemId = itemId;
  renderItems();

  const row = elements.itemList.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`);
  const text = row && row.querySelector('.item-text');
  if (text) {
    text.focus();
    text.selectionStart = text.value.length;
    text.selectionEnd = text.value.length;
  }
}

function focusItem(itemId) {
  const row = elements.itemList.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`);
  if (!row) {
    return;
  }

  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function openSearchResult(row) {
  const itemId = row.dataset.itemId;
  store.settings.activeColumnId = row.dataset.columnId;
  currentMode = row.dataset.itemType;
  editingItemId = null;
  highlightedItemId = itemId;
  elements.searchInput.value = '';
  render();
  scheduleSave();
  setTimeout(() => focusItem(itemId), 0);
  setTimeout(() => {
    if (highlightedItemId === itemId) {
      highlightedItemId = null;
      renderItems();
    }
  }, 1600);
}

function applyLoadedData(payload) {
  store = payload.store || payload;
  storageInfo = payload.storage || storageInfo;
  editingItemId = null;
  highlightedItemId = null;
  elements.searchInput.value = '';
  currentMode = 'note';
  render();
}

async function saveImmediately() {
  clearTimeout(saveTimer);
  if (store) {
    store = await api.saveStore(store);
  }
}

function openSettings() {
  renderStorageSettings();
  elements.settingsPanel.hidden = false;
}

function closeSettings() {
  elements.settingsPanel.hidden = true;
}

async function chooseAndSwitchStorage() {
  const folderPath = await api.chooseStorageFolder();
  if (!folderPath) {
    return;
  }

  await saveImmediately();
  const payload = await api.switchStorageFolder(folderPath);
  applyLoadedData(payload);
  openSettings();
  setSaveState('已切换');
}

async function migrateStorage() {
  const folderPath = await api.chooseStorageFolder();
  if (!folderPath) {
    return;
  }

  const confirmed = window.confirm('迁移会把当前笔记复制到新文件夹，并清空旧文件夹里的笔记数据。继续？');
  if (!confirmed) {
    return;
  }

  await saveImmediately();
  const payload = await api.migrateStorageFolder(folderPath);
  applyLoadedData(payload);
  openSettings();
  setSaveState('已迁移');
}

async function switchStorage(folderPath) {
  await saveImmediately();
  const payload = await api.switchStorageFolder(folderPath);
  applyLoadedData(payload);
  openSettings();
  setSaveState('已切换');
}

elements.pinButton.addEventListener('click', () => {
  mutate(() => {
    store.settings.alwaysOnTop = !store.settings.alwaysOnTop;
  });
});

elements.loginButton.addEventListener('click', () => {
  mutate(() => {
    store.settings.openAtLogin = !store.settings.openAtLogin;
  });
});

elements.minimizeButton.addEventListener('click', () => {
  api.minimize();
});

elements.closeButton.addEventListener('click', () => {
  api.close();
});

elements.settingsButton.addEventListener('click', openSettings);
elements.closeSettingsButton.addEventListener('click', closeSettings);
elements.chooseStorageButton.addEventListener('click', () => {
  chooseAndSwitchStorage().catch((error) => {
    setSaveState('切换失败');
    console.error(error);
  });
});

elements.migrateStorageButton.addEventListener('click', () => {
  migrateStorage().catch((error) => {
    setSaveState('迁移失败');
    console.error(error);
  });
});

elements.settingsPanel.addEventListener('click', (event) => {
  if (event.target === elements.settingsPanel) {
    closeSettings();
  }
});

elements.storageFolderList.addEventListener('click', (event) => {
  const button = event.target.closest('.folder-switch-button');
  if (!button || button.disabled) {
    return;
  }

  switchStorage(button.dataset.folderPath).catch((error) => {
    setSaveState('切换失败');
    console.error(error);
  });
});

elements.addColumnButton.addEventListener('click', addColumn);
elements.deleteColumnButton.addEventListener('click', deleteActiveColumn);
elements.addItemButton.addEventListener('click', addItem);

elements.noteModeButton.addEventListener('click', () => {
  currentMode = 'note';
  editingItemId = null;
  render();
});

elements.todoModeButton.addEventListener('click', () => {
  currentMode = 'todo';
  editingItemId = null;
  render();
});

elements.itemTextInput.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    addItem();
  }
});

elements.searchInput.addEventListener('input', () => {
  editingItemId = null;
  renderItems();
});

elements.searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    elements.searchInput.value = '';
    renderItems();
  }
});

elements.columnList.addEventListener('click', (event) => {
  const button = event.target.closest('.column-item');
  if (!button) {
    return;
  }

  mutate(() => {
    store.settings.activeColumnId = button.dataset.columnId;
  });
});

elements.columnNameInput.addEventListener('input', () => {
  const column = activeColumn();
  column.name = elements.columnNameInput.value.trim() || '未命名';
  column.updatedAt = now();
  scheduleSave();
  renderColumns();
});

elements.itemList.addEventListener('input', (event) => {
  if (!event.target.classList.contains('item-text')) {
    return;
  }

  const row = event.target.closest('.note-item');
  const item = findItem(row.dataset.itemId);
  if (!item) {
    return;
  }

  item.text = event.target.value;
  item.updatedAt = now();
  scheduleSave();
});

elements.itemList.addEventListener('focusout', (event) => {
  if (!event.target.classList.contains('item-text')) {
    return;
  }

  const row = event.target.closest('.note-item');
  if (row && editingItemId === row.dataset.itemId) {
    editingItemId = null;
    renderItems();
  }
});

elements.itemList.addEventListener('change', (event) => {
  if (!event.target.classList.contains('todo-check')) {
    return;
  }

  const row = event.target.closest('.note-item');
  const item = findItem(row.dataset.itemId);
  if (!item) {
    return;
  }

  mutate(() => {
    item.completed = event.target.checked;
    item.updatedAt = now();
  });
});

elements.itemList.addEventListener('click', (event) => {
  const link = event.target.closest('.item-link');
  if (link) {
    event.preventDefault();
    api.openLink(link.href);
    return;
  }

  const result = event.target.closest('.search-result');
  if (result) {
    openSearchResult(result);
    return;
  }

  if (!event.target.classList.contains('delete-item-button')) {
    const preview = event.target.closest('.item-preview');
    if (preview) {
      const row = preview.closest('.note-item');
      enterEditMode(row.dataset.itemId);
    }
    return;
  }

  const row = event.target.closest('.note-item');
  const itemId = row.dataset.itemId;

  mutate(() => {
    const column = activeColumn();
    column.items = column.items.filter((item) => item.id !== itemId);
  });
});

window.addEventListener('beforeunload', () => {
  clearTimeout(saveTimer);
  if (store) {
    try {
      api.saveStoreSync(store);
    } catch (error) {
      console.error(error);
    }
  }
});

api.loadStore().then((loaded) => {
  applyLoadedData(loaded);
}).catch((error) => {
  setSaveState('加载失败');
  console.error(error);
});
