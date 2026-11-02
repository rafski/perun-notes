# Perun Notes

A sidebar for Claude Code that keeps notes beside the chat, per project folder and across sessions.

- **Notes**: type in the sidebar's field, or `/note <text>`.
- **Todos**: `/todo <text>`, switch the field to todo (`k`), or start a note with `todo:` or `[]`. Press a todo to tick it.
- **Pins**: `a` pins Claude's last answer, `q` your last question (or `/pin`, `/pin q`).
- Press a note or pin to expand it: send it to the conversation as your message (`↗ send`), put it in the prompt box to edit first (`→ prompt`), turn it into a todo, or delete it (`u` undoes). Todos have their own `↗`, and `s` sends all open todos as one message.
- Claude can add to it and read it when you ask ("add that to my todos", "what's on my list?").

- **Search**: type in the Search field to filter every section (all words must match, any order); `c` clears it. `/notes <words>` opens the sidebar already searching.

- **Perun** keeps watch at the top: a pixel-art thunder god with a silver head and golden moustache, as the old chronicle has his idol. He blinks now and then, and every few seconds does something small: a glance aside, a glint on his axe, wind in his beard or cloak, thunder far off. Each thing you do plays a scene from his story. A new note is carved into the oak a letter at a time, chips flying, as he taps his blade; a new todo has his thunder mark ✲ cut into its box; a pin drops a thunderstone onto its bar. Ticking a todo is his old fight with Veles: the serpent in the box is struck by lightning, rain falls, then the tick; tick the last one and rain sweeps the rule as he raises his axe. A sent item is carried off by his eagle while he looks toward the chat. A deleted item sinks into Nav, the underworld, pulled down by roots, and undo brings it back up. He glances about while you search, and if nothing matches, Veles hides it. On a narrow pane he steps aside.

`/notes` opens the sidebar, `/notes close` closes it. It shares the dock with other mods' panes as a tab: it opens by itself once per session (never again after you close it, and a reload leaves it where it is in the tabs). `/notes auto off` makes it wait for `/notes` instead; `/notes auto on` turns that back.

## Install

At the prompt of a Claude Code terminal session:

```text
/plugin install perun-notes --marketplace rafski/perun-notes
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```bash
claude plugin install perun-notes --marketplace rafski/perun-notes
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `rafski/perun-notes`, then Add plugin.

This repository is private: the install works only for people who can read it on GitHub and whose machine already has a git credential for github.com (an SSH key, or `gh auth login` then `gh auth setup-git`). The install never prompts for one.
