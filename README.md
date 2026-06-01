# ChatGPT 当前回答目录

一个用于 ChatGPT 网页的 Chrome 扩展。它会在页面右侧显示可移动、可缩放的悬浮导航，帮助你快速浏览当前会话里的问题，并展开查看对应回答里的 Markdown 标题目录。

## 亮点

- 当前会话问题自动编号，支持搜索。
- 可展开查看回答中的标题目录。
- 点击问题或标题可快速跳转。
- 悬浮窗支持拖动、缩放、折叠。
- 折叠后的小按钮也可以移动。
- 自动适配 ChatGPT 浅色 / 深色主题。
- 本地运行，不上传聊天内容。

## 安装

1. 打开 Chrome，进入 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目文件夹：

```text
chatgpt-answer-outline/
```

5. 打开或刷新 ChatGPT 页面：

```text
https://chatgpt.com/
https://chat.openai.com/
```

## 使用

- 左键点击问题：跳转到对应对话位置。
- 点击问题右上角 `+ / -`：展开或收起该回答目录。
- 点击目录标题：跳转到回答中的对应标题。
- 拖动顶部栏：移动悬浮窗。
- 拖动窗口边缘：调整悬浮窗大小。
- 点击顶部 `+ / -`：折叠或展开悬浮窗。

## 隐私

This extension runs locally in your browser.

It does not upload your conversations.

It does not call external APIs.

它不读取 cookies，不读取浏览器历史，也不请求网络权限。

## 技术说明

- Chrome Extension Manifest V3
- 原生 JavaScript / HTML / CSS
- 无第三方依赖
- 匹配页面：
  - `https://chatgpt.com/*`
  - `https://chat.openai.com/*`

## 项目结构

```text
chatgpt-answer-outline/
├── manifest.json
├── content.js
├── content.css
├── fiber-bridge.js
├── popup.html
├── popup.js
├── README.md
└── icons/
```

## 注意

ChatGPT 页面结构可能会变化。如果后续 ChatGPT 修改 DOM 或渲染逻辑，问题提取和跳转逻辑可能需要同步调整。
