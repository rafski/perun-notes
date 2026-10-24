# notes

A sidebar for Claude Code that keeps notes beside the chat, per project folder and across sessions.

- **Notes**: type in the sidebar's field, or `/note <text>`.
- **Todos**: `/todo <text>`, switch the field to todo (`k`), or start a note with `todo:` or `[]`. Press a todo to tick it.
- **Pins**: `a` pins Claude's last answer, `q` your last question (or `/pin`, `/pin q`).
- Press a note or pin to expand it: send it to the prompt, turn it into a todo, or delete it (`u` undoes).
- Claude can add to it and read it when you ask ("add that to my todos", "what's on my list?").

- **Search**: type in the Search field to filter every section (all words must match, any order); `c` clears it. `/notes <words>` opens the sidebar already searching.

`/notes` opens the sidebar.

## Install

At the prompt of a Claude Code terminal session:

```text
/plugin install notes --marketplace rafski/claude-notes
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```bash
claude plugin install notes --marketplace rafski/claude-notes
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `rafski/claude-notes`, then Add plugin.

This repository is private: the install works only for people who can read it on GitHub and whose machine already has a git credential for github.com (an SSH key, or `gh auth login` then `gh auth setup-git`). The install never prompts for one.
