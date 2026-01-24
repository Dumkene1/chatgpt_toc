# ChatGPT Floating TOC Extension

A lightweight browser extension that adds a **floating Table of Contents (TOC)** panel to ChatGPT conversations.

Built for **long technical chats** where scrolling becomes painful.

## Screenshots

### Floating TOC

![TOC panel](sc1.png)


### Floating TOC

![TOC panel](sc2.png)



## Features
- Floating TOC panel for ChatGPT responses
- Auto-detects markdown headings (h1–h6)
- Smart fallback titles when no headings are present
- Click a TOC entry to instantly scroll to the corresponding section in the chat and briefly highlight it for easy visual tracking.
- Draggable panel
- Resizable from bottom-right **and bottom-left**
- Minimize / close with quick reopen
- Persists size between reloads
- No external services
- No API keys
- No build step

## Supported sites
- https://chatgpt.com
- https://chat.openai.com

## Installation (Unpacked)

### Edge / Chrome
1. Open `edge://extensions` or `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder

### Firefox
1. Open `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on**
4. Select `manifest.json`

## Notes
- Designed to work perfectly inside an **Edge PWA**
- Optimized for long conversations
- Intended primarily for personal productivity

## License
MIT 
