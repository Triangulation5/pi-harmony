# Pi Harmony 🎨

> Enhance your Pi coding assistant with polished UI, smart grouping, beautiful diffs, and customizable workflows.

A [Pi](https://github.com/earendil-works/pi) extension that transforms the default terminal experience with:

- ✨ **Beautiful terminal UI** with syntax-highlighted diffs and labeled commands
- 🎮 **30+ configuration options** via `/tools` and `/theme` commands
- 🧩 **Rich features** — spinners, startup animations, live thinking, subagents support
- 🌈 **Theme-aware** — follows your terminal colors or Pi's built-in themes
- 🔧 **Bundled tools** — `web-search-cli` skill and interactive questionnaires

---

## 🚀 Quick Start

```bash
# Install globally
pi install git:github.com/Triangulation5/pi-harmony

# Or for development
pi install /path/to/pi-harmony
```

**Requirements:** Pi 1.4+ for full terminal color support

---

## ✨ Core Features

| Feature | Description |
|---------|-------------|
| **Polished UI** | Grouped tool calls, syntax-highlighted diffs, labeled bash commands, theme-aware spinner |
| **30+ Config Options** | Control every aspect of the interface via `/tools` and `/theme` commands |
| **Live Thinking** | Watch thoughts stream, collapse them, or toggle advanced settings |
| **Startup Animation** | Optional Tetris-style piece assembly (toggle with `/tools startup`) |
| **Theme Harmony** | Automatic terminal color adaptation or custom Pi theming |
| **Subagents** | Unified UI for parallel and parent/child agent workflows |
| **Bundled Tools** | `web-search-cli` skill and `rpiv-ask-user-question` questionnaire |

---

## 📖 What It Does

### 🎯 Tool Call Grouping
Consecutive tool calls automatically collapse into a single, readable row:

```
📊 Read config.json, Analyzed (grep), Found 12 services
├─ Read config.json
├─ Bash grep -rn "service" src/
└─ Find package.json
```

- **Running:** Shows status like `🕒 Reading files... · 3s`
- **Failed:** Red dot + `· 1 failed`
- **Expand:** `Ctrl+O` for details, `Ctrl+Shift+O` for extended output

### 📝 Beautiful Diffs
`edit` and `write` show changes with syntax highlighting, word-level marks, and side-by-side layouts:

![Edit diff example](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/edit-diff.png)

### 🔄 Spinner Customization
While a tool runs, the loading indicator shows the action:

```
🔄 Building project...   ├─ Installing dependencies
✨ Ready!               ├─ Build complete
```

**Spin off by default.** Toggle with `/spinner dots on|off|toggle`:

- Three styles: default asterisk, breathing stars, orbital circles
- Three movement speeds: slow, medium, fast
- Six shimmer effects: sweep, flash, sparkle, pulse
- Optional wandering tips during longer tasks

![Spinner in action](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/spinner.gif)

### 🏷️ Bash Labels
**With labels enabled**, commands show their purpose instead of raw commands:

```
Bash · Run the test suite   ├─ npm test
Bash · Fix linting errors   ├─ npm run lint:fix
Bash · Run Docker container ├─ docker-compose up
```

**Label source:** Model writes labels (default) → plain commands → local model:

```bash
# Show labels from model
/tools intent model

# Plain commands
/tools intent off

# Local model (Ollama by default)
/tools intent local
```

![Labelled bash rows](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/bash-labels.gif)

### 💭 Live Thinking
**Default:** View thinking as it streams, collapse when done

```
Thought for 3s
```

**Three modes:**
- `live` — stream and collapse (default)
- `latest` — only latest message (merges tool rows)
- `full` — keep all expanded

**Toggle label:** `/tools thinking-label on|off|toggle`

![Thinking modes](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/thinking-modes.png)

---

## 🌈 Theme Awareness

### Terminal Colors
On Pi 1.4+, the extension automatically detects your terminal's color palette:

**Supported terminals:**
- Ghostty
- Rex
- kitty
- WezTerm
- And others that respond to color queries

**How it works:** Pi switches to the `system` theme, adapts diff colors, syntax highlighting, and spinner themes to match your terminal's look and feel.

![Terminal theme integration](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/terminal-themes.gif)

### Custom Pi Themes
Follow Pi's built-in themes or use a fixed Claude-style palette:

```
# Use Pi's colors from the current theme
/theme on

# Use a fixed palette instead
/theme off

# Check current status
/theme status
```

---

## 🤖 Subagents Integration

With [pi-subagents](https://github.com/tintinweb/pi-subagents), `Agent` calls get the same polished treatment:

```
Launching 2 agents...   ├─ Agent 1: Code review
                       ├─ Agent 2: Security audit
✅ Complete!            ├─ Agent 2 done in 45s
                       └─ Agent 1 done in 32s
```

Expanded rows show each agent's tool usage, tokens, time, and result.

![Subagents UI](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/subagents.gif)

---

## 📋 Commands Reference

### `/tools` — Main Configuration
```bash
/tools header on|off|toggle|status     # Show/hide startup resource details
/tools outlines|transparent|default   # Tool row border style
/tools group on|off|toggle              # Group consecutive tool calls
/tools activity breathe|blink|status   # Pending tool animation
/tools thinking live|full|latest       # How thinking is displayed
/tools thinking-label on|off|toggle    # Show "∴ Thinking:" label
/tools intent off|model|local|status   # Bash label source
/tools detail on|off|toggle            # High preview limits
```

### `/theme` — Visual Customization
```bash
/theme on|off|toggle|status            # Use Pi colors or fixed palette
/theme terminal on|off|toggle|status   # Follow terminal colors
```

### `/spinner` — Animation Control
```bash
/spinner preview                          # Show available colors
/spinner verb <key> status <key>          # Recolor text
/spinner dots on|off|disabled|toggle      # Animate dots
/spinner tips on|off|toggle               # Show tips below spinner
/spinner style asterisk|breathing|orbit   # Animation cycle
/spinner speed slow|medium|fast           # Movement speed
/spinner shimmer-direction left|right     # Text sweep direction
/spinner shimmer-style sweep|flash|sparkle # Text effect
/spinner shimmer-color #RGB|#RRGGBB      # Custom highlight color
```

### `/tools startup` — Startup Animation
```bash
/tools startup on|off|toggle|status               # Toggle animation
/tools startup tetris|matrix|fireworks|wave|retro # Choose style
```

---

## ⚙️ Settings

Settings are saved to:

**Project-level:** `.pi/settings.json`

**Agent-level:** `$PI_CODING_AGENT_DIR/settings.json` (`~/.pi/agent/settings.json`)

### Default Configuration
```json
{
  "toolBackground": "transparent",
  "groupToolCalls": true,
  "toolStatusAnimation": "breathe",
  "thinkingMode": "live",
  "thinkingLabel": false,
  "headerDetails": true,
  "quietStartup": false,
  "terminalTheme": true,
  "themeAdaptive": true,
  "readOutputMode": "preview",
  "searchOutputMode": "preview",
  "mcpOutputMode": "preview",
  "bashOutputMode": "opencode",
  "bashIntent": "model",
  "previewLines": 8,
  "expandedPreviewMaxLines": 4000,
  "extraExpandedPreviewMaxLines": 12000,
  "bashCollapsedLines": 10,
  "bashCommandPreviewLines": 0,
  "liveToolPreview": false,
  "liveToolPreviewLines": 5,
  "diffCollapsedLines": 24,
  "diffLayout": "auto"
}
```

### Key Settings

| Category | Setting | Options | Default |
|----------|---------|---------|---------|
| **Layout** | `toolBackground` | `transparent`, `outlines`, `border`, `default` | `transparent` |
| | `groupToolCalls` | `true`, `false` | `true` |
| | `previewLines` | 1-50 | `8` |
| **Tool Output** | `readOutputMode` | `hidden`, `summary`, `preview` | `preview` |
| | `bashOutputMode` | `opencode`, `summary`, `preview` | `opencode` |
| | `bashIntent` | `off`, `model`, `local` | `model` |
| **Thinking** | `thinkingMode` | `live`, `full`, `latest` | `live` |
| | `thinkingLabel` | `true`, `false` | `false` |
| **Colors** | `terminalTheme` | `true`, `false` | `true` |
| | `themeAdaptive` | `true`, `false` | `true` |
| | `spinnerAnimatedDots` | `true`, `false` | `false` |
| | `spinnerTips` | `true`, `false` | `true` |
| | `spinnerStyle` | `asterisk`, `breathing`, `orbit` | `asterisk` |

---

## 🔧 Bundled Tools

### Web Search CLI (`/skill:web-search-cli`)
Search DuckDuckGo Lite using the bundled Python script. Useful when native web search is unavailable.

### Ask User Question (`rpiv-ask-user-question`)
Interactive questionnaire tool that presents structured prompts when the agent needs input.

See:
- [Package README](packages/rpiv-ask-user-question/README.md)
- [Configuration Documentation](packages/rpiv-ask-user-question/docs/configuration.md)
- [Localization](packages/rpiv-ask-user-question/locales/)

---

## 🎆 Startup Animation

**Optional Tetris-style piece assembly** that assembles the Pi logo on startup.

**Toggle with:** `/tools startup on|off|toggle|status`

**Styles:**
- `tetris` — default piece assembly (default)
- `matrix` — digital rain effect
- `fireworks` — explosion pieces
- `wave` — flowing wave pattern
- `retro` — 8-bit pixel art style

**Bonus:** Press any keybind to skip the animation!

![Startup animation](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/startup-tetris.gif)

---

## 🎨 Additional Polish

- **Prompt markers:** Previous prompts and the input line both use `❯`
- **Clickable selections:** Fullscreen mode copies only text, preserving code block borders
- **LaTeX math:** Display Unicode symbols (fallback if MathJax unavailable)
- **RTK badges:** RTK command rewrites appear as `(RTK)` on bash rows
- **Patch previews:** `apply_patch` calls show parsed patch as diff before execution

---

## ⚡ Performance Optimizations

Recent updates include:
- **Async file I/O** for faster startup
- **Reduced chat re-renders** - cached render results skip unnecessary updates
- **Bounded render caches** - LRU eviction policy prevents memory bloat
- **Lazy Shiki loading** - only loads syntax highlighting on demand (vs always-on)

---

## 🤝 Credits

Built on the excellent work of:

- [@heyhuynhgiabuu/pi-pretty](https://github.com/buddingnewinsights/pi-pretty) — syntax-highlighted file reads
- [@heyhuynhgiabuu/pi-diff](https://github.com/buddingnewinsights/pi-diff) — Shiki diff renderer
- [pi-tool-display](https://github.com/MasuRii/pi-tool-display) — compact tool rows
- [pi-polish](https://github.com/Pringled/pi-extensions/tree/main/packages/pi-polish) — one-sentence tool groups, spinner, prompt markers

---

## 📝 License

MIT © [Triangulation5](https://github.com/Triangulation5)

---

## 🛠 Development

```bash
# Run tests
npm test

# Type check
npm run typecheck

# Test package packaging
npm run pack:dry-run
npm run publish:dry-run
```

---

**Made with ❤️ for the Pi community**