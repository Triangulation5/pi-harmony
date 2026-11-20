# Pi Harmony

A [Pi](https://github.com/earendil-works/pi) package that brings the terminal UI, practical tools, and interactive workflows together.

![Pi Harmony's terminal UI](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/demo.gif)

```bash
pi install git:github.com/Triangulation5/pi-harmony
```

For local development, install the checkout directly with `pi install /path/to/pi-harmony`.

## What's included

- **A polished terminal UI** — grouped tool calls, syntax-highlighted diffs, labeled bash commands, and a theme-aware spinner.
- **Optional Tetris-style startup animation** — off by default. When enabled, colored pieces assemble the Pi logo before the interface appears. Toggle it with `/tools startup on|off|toggle|status`; it is skipped on macOS Terminal.app and in unsupported terminals.
- **Configurable UI via `/tools`** — toggle startup resource headers (`/tools header`), tool grouping, and extra detail without bloating the root slash command namespace.
- **Structured questions** — the bundled `ask_user_question` tool presents interactive questionnaires when the agent needs your input instead of guessing.
- **Continuation shortcut** — press `Shift+Alt+Enter` while the agent is stopped to send a literal `continue` prompt; works reliably both in modern terminals and inside tmux multiplexers.
- **Web search** — `/skill:web-search-cli` searches DuckDuckGo Lite with the bundled Python script when native web search is unavailable.

Terminal colors need pi 1.4 or newer.

## Tool calls

Consecutive tool calls collapse into one sentence, such as `Read 2 files, ran 1 shell command`. While they run, the row reads `Reading 2 files, running 1 shell command... · 3s` and shows the call in progress below it. A failed call turns the dot red and adds `· 1 failed`.

Click a row (in pi's fullscreen mode) or press `Ctrl+O` to see every call and its output. `Ctrl+Shift+O` raises the preview limits for long outputs. A row stays where you clicked it, and the view scrolls only as far as needed to show what opened.

![Clicking a grouped row and a thinking row to expand them](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/click-to-expand.gif)

Built-in tools (`read`, `bash`, `grep`, `find`, `ls`, `edit`, `write`), MCP tools, OpenAI-style tools such as `apply_patch`, `webfetch` and `web_search`, and any custom tool all use the same row layout.

## Diffs

`edit` and `write` show the change as a diff with syntax highlighting and word-level marks. Several edits to one file are listed one after the other. On wide terminals the diff can also use a side-by-side layout.

![A two-part edit shown as a diff](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/edit-diff.png)

POSIX shell commands that only change files are drawn the same way. `sed -i`, `perl -pi`, heredocs (`cat > file <<EOF`, `tee`) and `echo ... > file` show up as `Edit (sed) pyproject.toml` or `Create (heredoc) CHANGELOG.md`, with a diff of what actually changed on disk. This applies on Unix-like systems and when using Bash on Windows (such as Git Bash); native PowerShell commands are not parsed as Bash edits. The command runs unchanged and the model sees its normal output. Anything ambiguous, like a pipe or a variable, stays a regular bash row.

![sed and heredoc commands shown as edits](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/shell-edits.png)

## Spinner

While a tool runs, the working line names it: `Running npm test...`, `Reading stats.py...`, `Searching for TODO...`, `Waiting for agent: Find edge cases...`. When animated dots are off, a plain `...` remains; `/spinner dots disabled` replaces them with one space. While the model thinks, it shows a playful verb instead; verbs fade briefly before switching and typing in with staggered delays. The spinner can use a traveling text shimmer, a two-pulse flash, or a fast `sparkle` that darts across individual letters with a bright core and dim halo. Toggle animated dots with `/spinner dots on|off|disabled|toggle`; choose the default Pi glyph cycle, a Claude-like star-breathing cycle, or the `orbit` circle-fill cycle (`○ ◎ ◉ ●`) with `/spinner style asterisk|breathing|orbit`. Helpful tips about keybinds, subagents, context, commands, and installed skills can also appear occasionally under the spinner when the agent has been working for a while (`/spinner tips on|off|toggle`). The asterisk style matches the spinner cycle from Pi Harmony. The collapsed `Thinking...` row keeps its own traveling shimmer while it streams.

![The working line during a run](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/spinner.gif)

## Bash labels

With labels on, a bash row shows what the command is for instead of the command itself: `Bash Run the test suite` rather than `Bash npm test`. The label is plain text, so it reads differently from a command. Click the row or press `Ctrl+O` to see the full command and its output.

![Labelled bash rows, and one clicked open to show its command](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/bash-labels.gif)

`/tools intent` picks where labels come from:

- `model` (default since 1.0.112): the model writes the label as an extra argument of each bash call. This adds a field to the bash tool and a line to the model's instructions. There is no extra request; the label costs a few output tokens on each call. Set `"bashIntent": "off"` (or run `/tools intent off`) to go back to plain commands.
- `off`: no labels; rows show the command.
- `local`: a local model writes the label without changing anything the model sees. Supported Apple silicon Macs use Apple's on-device model (macOS 26+, Apple Intelligence, and Xcode command line tools for a one-time helper build). Linux, Android, Windows, other Macs, and any host with an explicitly configured endpoint use an OpenAI-compatible local API. The default is Ollama at `http://127.0.0.1:11434/v1`; install a model first, and the first model returned by `/v1/models` is selected. Set `PI_CC_UI_INTENT_BASE_URL`, `PI_CC_UI_INTENT_MODEL`, and optionally `PI_CC_UI_INTENT_API_KEY` to use another OpenAI-compatible server or choose a model explicitly. Labels are cached, so resumed sessions show them without asking again.

The choice applies on the next start or after `/reload`, because the model mode changes the bash tool itself. Collapsed groups show only the sentence summary; expand a group to see each command's label.

## Thinking

By default (`live`), thinking is shown while it streams and then collapses to `Thought for 3s`. Click the row to read it again.

`/tools thinking latest` goes further: only the latest message keeps its thinking. Earlier messages drop it, so the tool calls that thinking used to separate merge into one row. This changes only what is drawn; the thinking stays in the session and in the model's context. `/tools thinking full` keeps every thinking block expanded, as stock pi does. To label expanded blocks with `∴ Thinking:`, set `"thinkingLabel": true` or run `/tools thinking-label on`.

![The same session in live and latest thinking modes](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/thinking-modes.png)

## Colors from your terminal

On pi 1.4 and newer the extension switches pi to its built-in `system` theme, which builds all of pi's colors from the palette your terminal reports. It works in Ghostty, Rex, kitty, WezTerm and other terminals that answer color queries. pi follows light and dark switches on its own. Terminals send nothing when you switch between two dark themes (or two light ones), so the extension also re-reads the palette whenever the terminal window regains focus.

![pi following the terminal through six themes](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/terminal-themes.gif)

The extension's own colors follow the active theme as well. Diff code uses the theme's syntax colors, diff backgrounds are tinted from the theme's added and removed colors, and connectors keep the same faint contrast on any background.

Your previous theme is saved when the extension switches. `/theme terminal off` restores it and keeps it, and `pi --use-theme <name>` still picks the theme for a single run.

## Subagents

With [pi-subagents](https://github.com/tintinweb/pi-subagents), `Agent` calls get the same treatment. Parallel agents fold into `Launching 2 agents...`, the spinner names the agent it is waiting for, and the expanded row shows each agent's tool uses, tokens, time and result. Completion notices and the Agents panel use the same dots and connectors as tool rows.

![Two agents reviewing a project](https://raw.githubusercontent.com/FammasMaz/pi-cc-tools/master/docs/media/subagents.gif)

## Header details

Pi's interactive mode displays loaded resources on startup:

```text
[Skills]
  commit, council-mode, pdf-reader, pi-subagents, web-search-cli

[Prompts]
  /council, /gather-context-and-clarify, /parallel-cleanup, /parallel-research, /parallel-review, /review-loop

[Extensions]
  @tychenjiajun/pi-voice, btw.ts, continue.ts, extensions, pi-subagents:bundle, rpiv-ask-user-question, spinner.ts
```

If you already know what extensions, skills, and prompts you are using and want a cleaner start, toggle this text on or off anytime with `/tools header`:

- `/tools header` (or `/tools header toggle`): switch between showing and hiding the resource details.
- `/tools header off`: hide `[Skills]`, `[Prompts]`, and `[Extensions]` while keeping the logo, version, and keybinding hints intact (equivalent to Pi's `quietStartup: "header"`).
- `/tools header on`: show all loaded resources on startup.
- `/tools header status`: check whether header details are currently on or off.

You can also configure `"headerDetails": false` (or `"quietStartup": "header"`) in `.pi/settings.json` or the Pi agent settings file (`~/.pi/agent/settings.json`, `%USERPROFILE%\.pi\agent\settings.json` on Windows).

## Smaller things

- Past prompts are a single highlighted line starting with `❯`, and the input line gets the same marker.
- In pi's fullscreen mode, selecting text copies only the text: code box borders, the indent pi adds to code, and the `●` and `❯` markers in front of replies and prompts stay out of the clipboard. In regular mode the terminal does the copying, so it copies what is on screen.
- LaTeX math in replies is shown with Unicode symbols.
- RTK command rewrites appear as a muted `(RTK)` badge on the bash row.
- `apply_patch` calls show their parsed patch as a diff before they run.

## Commands

| Command | What it does |
| --- | --- |
| `/tools` | Show and configure tool display settings |
| `/tools header on`, `off`, `toggle`, `status` | Toggle startup header details (hides `[Skills]`, `[Prompts]`, `[Extensions]`) |
| `/tools outlines`, `transparent`, `default` | Tool row style: rules around each tool, no rules (default), or Pi's own backgrounds |
| `/tools group on`, `off`, `toggle` | Fold consecutive tool calls into one row |
| `/tools activity breathe`, `blink`, `status` | Choose gradual pending-tool breathing (default) or classic on/off blinking |
| `/tools thinking live`, `full`, `latest` | Choose how thinking blocks are shown |
| `/tools thinking-label on`, `off`, `toggle`, `status` | Show `∴ Thinking:` above expanded thinking blocks |
| `/tools intent off`, `model`, `local`, `status` | Choose the source for bash labels; applies after `/reload` |
| `/tools detail on`, `off`, `toggle` | Higher preview limits, same as `Ctrl+Shift+O` |
| `/theme terminal on`, `off`, `status` | Follow the terminal's colors, or restore your previous theme |
| `/theme on`, `off`, `toggle`, `status` | Derive Pi Harmony's colors from the Pi theme, or use a fixed palette |
| `/spinner preview` | Show the theme colors available for the spinner |
| `/spinner verb <key>`, `status <key>`, `reset` | Recolor the spinner's verb or status text |
| `/spinner dots on`, `off`, `disabled`, `toggle`, `status` | Animate dots, show static `...`, or hide the suffix entirely |
| `/spinner tips on`, `off`, `toggle`, `status` | Toggle random tips displayed under the spinner text (on by default) |
| `/spinner style asterisk`, `breathing`, `orbit`, `status` | Choose the default, star-breathing, or circle-fill spinner style |
| `/spinner speed slow`, `medium`, `fast`, `status` | Change the spinner movement speed (medium by default) |
| `/spinner shimmer-direction left`, `right`, `status` | Set the shimmer sweep direction |
| `/spinner shimmer-style sweep`, `flash`, `sparkle`, `status` | Set the working-text shimmer (traveling sweep, double flash, or fast letter sparkle) |
| `/spinner shimmer-color #RGB|#RRGGBB`, `status`, `reset` | Customize the shimmer highlight color |

Commands that change a setting save it to the settings file, and the change applies right away.

## Settings

Settings are read from `.pi/settings.json` in the project and from the agent settings file, `$PI_CODING_AGENT_DIR/settings.json` (by default `~/.pi/agent/settings.json`, or `%USERPROFILE%\.pi\agent\settings.json` on Windows). The values below are the defaults.

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
  "extraToolOutputExpanded": false,
  "bashCollapsedLines": 10,
  "bashCommandPreviewLines": 0,
  "liveToolPreview": false,
  "liveToolPreviewLines": 5,
  "diffCollapsedLines": 24,
  "diffLayout": "auto"
}
```

The screenshots on this page use `"toolBackground": "transparent"`.

### Layout

| Setting | Default | Description |
| --- | --- | --- |
| `toolBackground` | `transparent` | `transparent` draws no rules, `outlines` draws a rule above and below each tool (`border` also works), `default` keeps pi's tool backgrounds |
| `groupToolCalls` | `true` | Fold consecutive tool calls into one row |
| `toolStatusAnimation` | `breathe` | Pending tool indicator: a gradual six-step glyph cycle (`breathe`) or a classic on/off light (`blink`); change with `/tools activity` |
| `thinkingMode` | `live` | `live` collapses finished thinking to `Thought for Xs`, `full` keeps it expanded, `latest` hides it in all but the latest message |
| `thinkingLabel` | `false` | Show `∴ Thinking:` above expanded thinking blocks; toggle with `/tools thinking-label on|off` |
| `previewLines` | `8` | Lines in a collapsed preview |
| `expandedPreviewMaxLines` | `4000` | Line limit when a row is expanded |
| `extraExpandedPreviewMaxLines` | `12000` | Line limit in `Ctrl+Shift+O` mode |
| `extraToolOutputExpanded` | `false` | Start in `Ctrl+Shift+O` mode |

### Tool output

| Setting | Values | Default |
| --- | --- | --- |
| `readOutputMode` | `hidden`, `summary`, `preview` | `preview` |
| `searchOutputMode` | `hidden`, `count`, `preview` | `preview` |
| `mcpOutputMode` | `hidden`, `summary`, `preview` | `preview` |
| `bashOutputMode` | `opencode`, `summary`, `preview` | `opencode` |

| Setting | Default | Description |
| --- | --- | --- |
| `bashIntent` | `model` (since 1.0.112) | Labels on bash rows in place of the command: `model` (the model writes them; changes the bash tool and its instructions), `local` (Apple's on-device model on supported Macs, otherwise an OpenAI-compatible local API), or `off` for plain commands. `true` means `model`. Applies on the next start or `/reload` |
| `bashCollapsedLines` | `10` | Output lines shown for a collapsed bash row |
| `bashCommandPreviewLines` | `0` | Lines of a multi-line command shown under a running or failed bash row. `Ctrl+O` always shows the whole command |
| `liveToolPreview` | `false` | Show the latest output lines under a running tool |
| `liveToolPreviewLines` | `5` | Lines in that live preview |
| `diffCollapsedLines` | `24` | Diff lines shown before a diff collapses |
| `diffLayout` | `auto` | `auto` uses the side-by-side layout only when it fits, `split` uses it whenever both sides fit, `unified` always stacks |

### Colors

| Setting | Default | Description |
| --- | --- | --- |
| `terminalTheme` | `true` | Use pi's `system` theme, built from the terminal's palette (pi 1.4+) |
| `themeAdaptive` | `true` | Derive diff colors, connectors and the spinner from the active pi theme. `false` keeps a fixed Claude palette |
| `diffTheme` | unset | A Shiki theme for diff code, such as `github-dark`. Unset uses the pi theme's syntax colors |
| `diffColors` | unset | Override individual diff colors |
| `spinnerVerbColor` | `borderAccent` | Theme color of the spinner's verb |
| `spinnerStatusColor` | `muted` | Theme color of the spinner's status text |
| `spinnerAnimatedDots` | `false` | Animate dots after the spinner text; toggle with `/spinner dots on|off|toggle` |
| `spinnerDotsDisabled` | `false` | Replace the spinner's dot suffix with one space; `/spinner dots off` keeps static `...` |
| `spinnerTips` | `true` | Occasionally show tips under the spinner during longer-running turns |
| `spinnerStyle` | `asterisk` | Spinner animation: default Pi glyph cycle, Claude-like star-breathing cycle, or `orbit` (`○ ◎ ◉ ●`) |
| `spinnerSpeed` | `medium` | Spinner movement speed: `slow`, `medium` or `fast` |
| `spinnerShimmerDirection` | `left-to-right` | Shimmer direction for spinner text and collapsed active thinking |
| `spinnerShimmerStyle` | `sweep` | Spinner-text shimmer: traveling sweep, double flash, or fast letter sparkle; collapsed `Thinking...` stays a sweep |
| `spinnerShimmerColor` | unset | Optional `#RGB` or `#RRGGBB` highlight color for spinner text and collapsed active thinking |

With `themeAdaptive` on, colors come from these pi theme tokens:

| Element | Source |
| --- | --- |
| Diff code | the theme's `syntax*` colors, the same ones pi uses for code blocks |
| Diff markers and backgrounds | `toolDiffAdded` and `toolDiffRemoved`, tinted over the terminal background |
| Connectors (`├ └ │`) and outlines | the terminal background blended toward its text color, to a 2:1 and a 5.1:1 contrast |
| Light or dark variants | pi's own `theme.appearance` |
| `Thought for Xs`, `Turn took Ns` | `muted` |

pi before 1.4 does not expose concrete theme colors. There, diffs fall back to `github-dark` or `github-light`, and connectors keep the same contrasts measured against black or white.

## Notes

The extension targets recent pi versions, where tool renderers receive `renderCall(args, theme, context)` and `renderResult(result, { expanded, isPartial }, theme, context)`. pi has no public hook for restyling tools that other extensions register, so the extension patches pi's container rendering to give every tool row the same frame.

## Credits

This project builds on the work of:

- [@heyhuynhgiabuu/pi-pretty](https://github.com/buddingnewinsights/pi-pretty) by [huynhgiabuu](https://github.com/buddingnewinsights): syntax-highlighted file reads, colored bash output and tree-view directory listings
- [@heyhuynhgiabuu/pi-diff](https://github.com/buddingnewinsights/pi-diff) by [huynhgiabuu](https://github.com/buddingnewinsights): the Shiki diff renderer with word-level changes in split and unified views
- [pi-tool-display](https://github.com/MasuRii/pi-tool-display) by [MasuRii](https://github.com/MasuRii): compact tool rows, diff display and output truncation
- [pi-polish](https://github.com/Pringled/pi-extensions/tree/main/packages/pi-polish) by [Thomas van Dongen](https://github.com/Pringled): the one-sentence tool groups, the activity spinner and the `❯` prompt markers follow its design
