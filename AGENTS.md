# AGENTS

Pi Harmony is a Pi coding assistant extension workspace focused on polished UI,
smart tool grouping, and customizable workflows.

## Components

- **Extensions**: Bash, session management, settings, terminal integration,
  markdown rendering, and Continue extension
- **Skills**: Web search CLI, interactive questionnaires, optional todo
  tracking
- **Themes**: Vague theme and custom theme support with 30+ config options

## Development Guidelines

### Commit Style

All commits must follow conventional commit format with type prefixes:

- `feat: ...` - New features
- `feat(rust-tooling): ...` - Rust-specific features
- `feat(tools): ...` - Tool-related changes
- `feat(ui): ...` - UI/UX improvements
- `feat(skills): ...` - Skill updates
- `bump: ...` - Version bumps
- `refactor: ...` - Code restructuring
- `perf: ...` - Performance optimizations
- `fix: ...` - Bug fixes
- `chore: ...` - Maintenance tasks

**Note**: Always use angular convention prefixes (feat, fix, etc.) inside
square brackets to clarify change scope.

## Quick Start

```bash pi install git:github.com/Triangulation5/pi-harmony ```

## Core Features

- Tool call grouping with syntax-highlighted diffs
- Live thinking with collapse/toggle options
- Startup animation (Tetris-style)
- Theme-aware UI with custom themes
- Unified subagent workflows (parent/child, parallel)
- 30+ configuration options via `/tools` and `/theme` commands
