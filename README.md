# Floating Notes

一个小型桌面浮窗笔记/待办应用。

## 功能

- 多栏目管理笔记和待办
- 窗口可拖动、可调整大小
- 可切换固定到桌面最顶层
- 可切换开机自启
- 输入、编辑、勾选、删除都会实时保存到本地 JSON 文件
- 关闭应用、关机、再次打开后数据仍会保留

## 运行

```bash
npm install
npm start
```

数据保存在 Electron 的用户数据目录中，文件名为 `notes-store.json`。
