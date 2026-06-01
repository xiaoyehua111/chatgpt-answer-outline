# ChatGPT Answer Outline

中文名：ChatGPT 当前回答目录

ChatGPT Answer Outline is a Chrome Extension Manifest V3 project for ChatGPT. It adds a movable floating navigator to ChatGPT pages, showing the current conversation's user prompts and expandable Markdown heading outlines for AI answers.

## Features

- Manifest V3 Chrome extension.
- Works on `https://chatgpt.com/*` and `https://chat.openai.com/*`.
- Native JavaScript, HTML, and CSS only.
- No third-party dependencies.
- Search current conversation prompts.
- Show prompts as a numbered list.
- Expand answer headings for prompts with Markdown `h1`, `h2`, or `h3`.
- Nested outline display for heading structures such as `h1 -> h2` or `h2 -> h3`.
- Click a prompt to jump to that turn.
- Click an answer heading to jump to that heading.
- Movable and resizable floating panel.
- Collapsible panel; the collapsed button can also be moved.
- Light mode and dark mode support.

## Privacy

This extension runs locally in your browser.

It does not upload your conversations.

It does not call external APIs.

It does not read cookies.

It does not read browser history.

It does not request network permissions.

## How It Works

The extension first tries to read ChatGPT's current-conversation turn DOM using stable attributes such as:

```text
[data-turn-id]
[data-turn="user"]
```

For virtualized user turns that exist in the DOM but have no visible text, the extension injects a tiny local `fiber-bridge.js` script into the page context to read React fiber turn text. This is used only locally inside the current browser page.

The extension intentionally ignores ChatGPT's left sidebar conversation history. If turn metadata is unavailable, it falls back to ChatGPT's right-side current-conversation prompt navigation, and then to currently rendered message DOM.

## Local Installation

1. Open Chrome.
2. Go to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this folder:

```text
chatgpt-answer-outline/
```

6. Open or refresh ChatGPT:
   - `https://chatgpt.com/`
   - `https://chat.openai.com/`

The floating navigator should appear on the page.

## Project Structure

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

## Development

No build step is required.

You can validate JavaScript syntax with:

```powershell
node --check content.js
node --check fiber-bridge.js
```

Then reload the extension in `chrome://extensions/`.

## Current Limitations

- ChatGPT DOM structures may change. If ChatGPT changes turn metadata or React internals, selectors and fiber extraction logic may need updates.
- Complete prompt extraction depends on ChatGPT retaining virtualized turn nodes or exposing prompt navigation data in the page.
- The extension is intended for local use and has not been packaged for the Chrome Web Store yet.

## License

No license has been selected yet. Add a license before publishing for public reuse.
