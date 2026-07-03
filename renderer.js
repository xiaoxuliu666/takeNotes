const api = window.floatingNotes;

const elements = {
  saveState: document.getElementById('saveState'),
  pinButton: document.getElementById('pinButton'),
  loginButton: document.getElementById('loginButton'),
  minimizeButton: document.getElementById('minimizeButton'),
  closeButton: document.getElementById('closeButton'),
  addColumnButton: document.getElementById('addColumnButton'),
  columnList: document.getElementById('columnList'),
  columnNameInput: document.getElementById('columnNameInput'),
  deleteColumnButton: document.getElementById('deleteColumnButton'),
  itemTextInput: document.getElementById('itemTextInput'),
  noteModeButton: document.getElementById('noteModeButton'),
  todoModeButton: document.getElementById('todoModeButton'),
  noteCount: document.getElementById('noteCount'),
  todoCount: document.getElementById('todoCount'),
  composerLabel: document.getElementById('composerLabel'),
  addItemButton: document.getElementById('addItemButton'),
  itemList: document.getElementById('itemList')
};

let store;
let currentMode = 'note';
let saveTimer;
let editingItemId = null;

const linkPattern = /https?:\/\/[^\s<>"']+/gi;

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
  return Date.now();
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

function renderItems() {
  const column = activeColumn();
  const visibleItems = column.items.filter((item) => item.type === currentMode);
  const sectionName = currentMode === 'todo' ? '待办' : '笔记';

  elements.columnNameInput.value = column.name || '';
  elements.deleteColumnButton.disabled = store.columns.length <= 1;
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
      row.className = `note-item ${item.type}${item.completed ? ' completed' : ''}`;
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
  store = loaded;
  render();
}).catch((error) => {
  setSaveState('加载失败');
  console.error(error);
});
