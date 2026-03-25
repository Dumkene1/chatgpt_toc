# ChatGPT Floating TOC Extension

A lightweight browser extension that adds a **floating Table of Contents (TOC)** panel to ChatGPT conversations.

Built for long conversations where scrolling becomes inefficient and frustrating.

Ever lost your place in a long ChatGPT response? This extension solves that.



## Screenshots

### TOC Panel Overview

![TOC panel](sc1.png)



### Navigation + Highlight Example

![TOC panel](sc2.png)



### Closed TOC

![TOC panel](sc3.png)



## Features

- Floating TOC panel for ChatGPT responses
- Auto-detects markdown headings (h1–h6)
- Smart fallback titles when no headings are present
- Click a TOC entry to instantly scroll to the corresponding section in the chat and briefly highlight it for easy visual tracking.
- Draggable panel
- Resizable from bottom-right and bottom-left
- Minimize / close with quick reopen
- Persists size between reloads
- No external services
- No API keys
- No build step

## Privacy

- No data collection  
- No external requests  
- Runs entirely locally in your browser  
- No tracking

## Use Case

Perfect for:  

- Long ChatGPT conversations  
- Tutorials  
- Code explanations  
- Structured outputs

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

## Updates

### Recent improvements

This version includes several usability improvements:

- User messages now appear in the Table of Contents
- User entries are visually highlighted for easier navigation
- Includes user messages ("You: ...") so you can jump back to your own prompts
- The panel can now be resized more flexibly
- Existing features remain intact, including live updates, smooth scrolling, dragging, and section highlighting

## 
