import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Cue, Effect, Note, NoteKind } from '../types'
import { MASCOT_COLUMNS, mascotSvg } from './mascot-art'

const PANE = 'notes'
const TITLE = 'Perun Notes'
// Keep in step with .claude-plugin/plugin.json; the engine does not hand a plugin its version.
const VERSION = '0.1.7'

const notes = atom({ plugin: 'perun-notes', key: 'notes' } as const, [])
const project = atom({ plugin: 'perun-notes', key: 'project' } as const, '')
const lastQuestion = atom({ plugin: 'perun-notes', key: 'lastQuestion' } as const, '')
const lastAnswer = atom({ plugin: 'perun-notes', key: 'lastAnswer' } as const, '')
const draftKind = atom({ plugin: 'perun-notes', key: 'draftKind' } as const, 'note')
// What is typed in the add field so far, so the field can grow to fit it.
const draft = atom({ plugin: 'perun-notes', key: 'draft' } as const, '')
const DRAFT_MAX_ROWS = 8
const expanded = atom({ plugin: 'perun-notes', key: 'expanded' } as const, '')
const lastDeleted = atom({ plugin: 'perun-notes', key: 'lastDeleted' } as const, [])
const query = atom({ plugin: 'perun-notes', key: 'query' } as const, '')
// Perun's reaction to the last thing done; `n` goes up each time so the same move replays.
const cue = atom({ plugin: 'perun-notes', key: 'cue' } as const, { n: 0, move: 'strike' })
// The item just added, drawn lit for a moment.
const fresh = atom({ plugin: 'perun-notes', key: 'fresh' } as const, '')

const FRESH_MS = 1600
const LIGHTNING = '#ffe45c'
const RAIN = '#7fb2e5'
const ROOTS = '#7b4a22'

// Each effect is one row playing frames: `id` the row ('' when idle), `frame` how far along.
const REST = { id: '', frame: 0 }
const effects = atom({ plugin: 'perun-notes', key: 'effects' } as const, {
  carve: REST,
  stone: REST,
  spark: REST,
  sink: REST,
  rise: REST,
  fly: REST,
  victory: REST,
})

// A new note or todo is carved into the oak, a letter at a time, chips flying.
const CARVE_FRAMES = 5
const CARVE_STEP_MS = 70
// A pin is a thunderstone dropping onto its quote bar.
const STONE_GLYPHS = ['˙', '▾', '▼']
const STONE_STEP_MS = 90
// A ticked todo: the serpent in its box, struck, then rain, then the tick.
const SPARK_STEP_MS = 120
// A deleted item sinks into Nav: it fades, crumbles, and roots pull it under.
// Undo brings it back up the same way, in reverse.
const SINK_STEP_MS = 120
// A sent item: Perun's eagle carries it off toward the chat.
const FLY_FRAMES = 5
const FLY_STEP_MS = 70
// The last open todo ticked: rain sweeps the todo rule and Perun has his word.
const RAIN_FRAMES = 8
const RAIN_STEP_MS = 150
const VICTORY_MS = 4000

const wasClosed = atom({ plugin: 'perun-notes', key: 'wasClosed' } as const, false)
// Whether the pane opens by itself at the start of a session; off, it waits for /notes.
const AUTO_OPEN_KEY = 'autoOpen'

type $Of = EngineInterface

// Notes are kept per project folder, across sessions.
const storeKey = (cwd: string) => `notes:${cwd}`

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

// "todo: x", "[] x" and "- [ ] x" make a todo whatever the draft kind.
const TODO_PREFIX = /^\s*(todo:|\[\s?\]|-\s\[\s?\])\s*/i

function make(kind: NoteKind, text: string, from?: Note['from']): Note {
  return { id: newId(), kind, text: text.trim(), at: Date.now(), ...(from ? { from } : {}) }
}

async function save($: $Of, fn: (list: Note[]) => Note[]) {
  await update($, notes, fn)
  const cwd = await read($, project)
  await $.store.set(storeKey(cwd), await read($, notes))
}

const cueMascot = ($: $Of, move: Cue) => update($, cue, c => ({ n: c.n + 1, move }))

// Plays `frames` frames on row `id`, `stepMs` apart, then clears and runs `then`.
async function play($: $Of, fx: Effect, id: string, frames: number, stepMs: number, then?: () => Promise<unknown>) {
  const set = (frame: number | undefined) =>
    update($, effects, all => {
      // A later play of the same effect on another row has taken over: leave it be.
      if (frame !== 0 && all[fx].id !== id) return all
      return { ...all, [fx]: frame === undefined ? REST : { id, frame } }
    })
  await set(0)
  for (let i = 1; i < frames; i++) $.clock.after(i * stepMs, () => void set(i))
  $.clock.after(frames * stepMs, async () => {
    await set(undefined)
    await then?.()
  })
}

async function add($: $Of, note: Note) {
  if (note.text === '') return
  await save($, list => [note, ...list])
  await cueMascot($, 'tap')
  await update($, fresh, () => note.id)
  $.clock.after(FRESH_MS, () => void update($, fresh, id => (id === note.id ? '' : id)))
  if (note.kind === 'pin') await play($, 'stone', note.id, STONE_GLYPHS.length, STONE_STEP_MS)
  else await play($, 'carve', note.id, CARVE_FRAMES, CARVE_STEP_MS)
}

async function addTyped($: $Of, text: string, kind: 'note' | 'todo') {
  const isTodo = kind === 'todo' || TODO_PREFIX.test(text)
  await add($, make(isTodo ? 'todo' : 'note', text.replace(TODO_PREFIX, '')))
}

async function pin($: $Of, which: 'q' | 'a') {
  const text = which === 'q' ? await read($, lastQuestion) : await read($, lastAnswer)
  if (text === '') {
    $.ui.toast(which === 'q' ? 'No question to pin yet.' : 'No answer to pin yet.')
    return false
  }
  await add($, make('pin', text, which === 'q' ? 'you' : 'claude'))
  $.ui.toast(which === 'q' ? 'Pinned your last question.' : "Pinned Claude's last answer.")
  return true
}

async function toggleDone($: $Of, id: string) {
  const all = await read($, notes)
  const isTicking = all.some(n => n.id === id && !n.isDone)
  await save($, l => l.map(n => (n.id === id ? { ...n, isDone: !n.isDone } : n)))
  if (!isTicking) return
  const isLast = !all.some(n => n.kind === 'todo' && !n.isDone && n.id !== id)
  await cueMascot($, isLast ? 'raise' : 'strike')
  await play($, 'spark', id, 3, SPARK_STEP_MS)
  if (isLast) await play($, 'victory', id, Math.ceil(VICTORY_MS / RAIN_STEP_MS), RAIN_STEP_MS)
}

async function remove($: $Of, id: string) {
  if ((await read($, effects)).sink.id === id) return
  await play($, 'sink', id, 4, SINK_STEP_MS, () => removeNow($, id))
}

async function removeNow($: $Of, id: string) {
  const gone = (await read($, notes)).filter(n => n.id === id)
  await update($, lastDeleted, () => gone)
  await save($, list => list.filter(n => n.id !== id))
}

async function undoDelete($: $Of) {
  const back = await read($, lastDeleted)
  await update($, lastDeleted, () => [])
  await save($, list => [...back, ...list].sort((a, b) => b.at - a.at))
  const first = back[0]
  if (first) await play($, 'rise', first.id, 3, SINK_STEP_MS)
}

// What an item says when sent as the person's message: Claude's own words come back quoted.
const asMessage = (n: Note) =>
  n.kind === 'pin' && n.from !== 'you'
    ? `From your earlier answer:\n\n${n.text.split('\n').map(l => `> ${l}`).join('\n')}`
    : n.kind === 'todo'
      ? `Todo: ${n.text}`
      : n.text

async function send($: $Of, text: string, id?: string) {
  await $.prompt.submit({ text, asUser: true })
  await cueMascot($, 'lookLeft')
  if (id) await play($, 'fly', id, FLY_FRAMES, FLY_STEP_MS)
  $.ui.toast('Sent to the conversation.')
}

const clock = (at: number) => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Every word of the query must appear, in any order, case ignored.
const matches = (n: Note, q: string) => {
  const words = q.toLowerCase().split(/\s+/).filter(w => w !== '')
  const text = n.text.toLowerCase()
  return words.every(w => text.includes(w))
}

// Word-wraps to whole rows, so a mark drawn at each row's start stays unbroken; blank lines
// are kept, and a word longer than a row is split.
const wrapRows = (text: string, width: number) => {
  const rows: string[] = []
  for (const para of text.replace(/\s+$/, '').split('\n')) {
    let row = ''
    for (const word of para.split(/\s+/).filter(w => w !== '')) {
      let rest = word
      while (rest.length > width) {
        if (row !== '') rows.push(row)
        rows.push(rest.slice(0, width))
        rest = rest.slice(width)
        row = ''
      }
      if (row === '') row = rest
      else if (row.length + 1 + rest.length <= width) row += ' ' + rest
      else {
        rows.push(row)
        row = rest
      }
    }
    rows.push(row)
  }
  return rows
}

// How many rows a text takes wrapped to a width, each typed line at least one.
const rowCount = (text: string, width: number) =>
  text.split('\n').reduce((sum, line) => sum + wrapRows(line, width).length, 0)

const oneLine = (text: string, width: number) => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > width ? line.slice(0, Math.max(1, width - 1)) + '…' : line
}

// A row being carved: the letters cut so far, and the chips flying off the blade.
const carved = (text: string, frame: number) => {
  const cut = text.slice(0, Math.ceil((text.length * (frame + 1)) / CARVE_FRAMES))
  return { cut, chips: frame < CARVE_FRAMES - 1 ? ' ·˙' : '' }
}

// A row the eagle flies over, right to left toward the chat: what is before and after it.
const flown = (text: string, room: number, frame: number) => {
  const line = text.padEnd(room).slice(0, room)
  const at = Math.round((room - 1) * (1 - (frame + 1) / FLY_FRAMES))
  return { before: line.slice(0, at), after: line.slice(at + 1) }
}

// Theme colour names, so the pane follows the person's Claude Code theme.
const C = {
  accent: 'claude',
  todo: 'success',
  // Pins are highlighted passages, so they take the highlighter's amber.
  pin: 'warning',
  note: 'suggestion',
  faint: 'subtle',
}

const TOOL_ADD = 'add'
const TOOL_LIST = 'list'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, project, () => e.cwd)
    const kept = await $.store.get(storeKey(e.cwd))
    await update($, notes, () => (Array.isArray(kept) ? (kept as Note[]) : []))

    await $.command.register({
      name: 'notes',
      description: 'Open the notes sidebar, optionally searching it; close it; or set auto-open',
      argumentHint: '[search] | close | auto on|off',
    })
    await $.command.register({
      name: 'note',
      description: 'Add a note to the sidebar',
      argumentHint: '<text>',
    })
    await $.command.register({
      name: 'todo',
      description: 'Add a todo to the sidebar',
      argumentHint: '<text>',
    })
    await $.command.register({
      name: 'pin',
      description: "Pin Claude's last answer (or your last question with q)",
      argumentHint: '[a|q]',
    })

    await $.tool.register({
      name: TOOL_ADD,
      description:
        "Add a note or todo to the user's notes sidebar. Use only when the user asks you to note, pin, remember in their notes, or add a todo. Keep text short and self-contained.",
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['note', 'todo'] },
          text: { type: 'string' },
        },
        required: ['kind', 'text'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: TOOL_LIST,
      description:
        "List the notes and todos in the user's notes sidebar for this project, optionally only those matching a search. Use when the user asks about their notes or todos.",
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Words that must all appear' } },
      },
      isDeferred: false,
    })

    // Share the dock with other mods' panes: open unasked only once, never over a pane the
    // person closed, and not again on a reload (that would bring it to the front).
    const isAuto = (await $.store.get(AUTO_OPEN_KEY)) !== false
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
    if (e.isInteractive && isAuto && !isOpen && !(await read($, wasClosed))) {
      void $.ui.open({ id: PANE, title: TITLE })
    }

    return next(e)
  })

  // Remember the last question and answer so they can be pinned.
  on('prompt.submit', async ($, e, next) => {
    if (!e.command && !e.isMeta && e.text.trim() !== '') {
      await update($, lastQuestion, () => e.text)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId && e.reason === 'answer' && e.answer.trim() !== '') {
      await update($, lastAnswer, () => e.answer)
    }
    return next(e)
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') await update($, wasClosed, () => true)
    return next(e)
  })

  on('command.run', { command: 'notes' }, async ($, e) => {
    const auto = /^\s*auto\s+(on|off)\s*$/i.exec(e.args)
    if (auto) {
      const isOn = auto[1]?.toLowerCase() === 'on'
      await $.store.set(AUTO_OPEN_KEY, isOn)
      return {
        text: isOn
          ? 'Notes will open by itself in new sessions.'
          : 'Notes will wait for /notes in new sessions; it stays a tab beside other panes once open.',
      }
    }
    if (/^\s*close\s*$/i.test(e.args)) {
      await $.ui.close({ id: PANE })
      return { text: 'Notes closed.' }
    }
    const q = e.args.trim()
    await update($, query, () => q)
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    if (q === '') return { text: 'Notes opened.' }
    const count = (await read($, notes)).filter(n => matches(n, q)).length
    return { text: `${count} ${count === 1 ? 'note matches' : 'notes match'} "${q}".` }
  })

  on('command.run', { command: 'note' }, async ($, e) => {
    if (e.args.trim() === '') {
      await $.ui.open({ id: PANE, title: TITLE, focus: true })
      return { text: 'Type a note in the sidebar, or /note <text>.' }
    }
    await addTyped($, e.args, 'note')
    return { text: 'Note added.' }
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    if (e.args.trim() === '') return { text: 'Usage: /todo <text>' }
    await addTyped($, e.args, 'todo')
    return { text: 'Todo added.' }
  })

  on('command.run', { command: 'pin' }, async ($, e) => {
    const which = /^\s*q/i.test(e.args) ? 'q' : 'a'
    const isPinned = await pin($, which)
    return { text: isPinned ? 'Pinned.' : 'Nothing to pin yet.' }
  })

  on('tool.call', { tool: 'mcp__perun-notes__add' }, async ($, e) => {
    const input = e as unknown as { kind?: string; text?: string }
    const text = typeof input.text === 'string' ? input.text.trim() : ''
    if (text === '') return { deny: 'text is empty' }
    await add($, make(input.kind === 'todo' ? 'todo' : 'note', text))
    return { result: `Added ${input.kind === 'todo' ? 'a todo' : 'a note'} to the sidebar.` }
  })

  on('tool.call', { tool: 'mcp__perun-notes__list' }, async ($, e) => {
    const input = e as unknown as { query?: string }
    const q = typeof input.query === 'string' ? input.query.trim() : ''
    const list = (await read($, notes)).filter(n => matches(n, q))
    if (list.length === 0) {
      return { result: q === '' ? 'The notes sidebar is empty.' : `No notes match "${q}".` }
    }
    const lines = list.map(n =>
      n.kind === 'todo'
        ? `- [${n.isDone ? 'x' : ' '}] ${n.text}`
        : `- (${n.kind === 'pin' ? `pinned from ${n.from ?? 'session'}` : 'note'}) ${n.text}`,
    )
    return { result: lines.join('\n') }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : undefined

    const all = await read($, notes)
    const q = (await read($, query)).trim()
    const list = all.filter(n => matches(n, q))
    const isSearching = q !== ''
    const kind = await read($, draftKind)
    const typed = await read($, draft)
    const open = await read($, expanded)
    const deleted = await read($, lastDeleted)
    const cued = await read($, cue)
    const lit = await read($, fresh)
    const {
      carve: carving,
      stone: dropping,
      spark: sparked,
      sink: sinking,
      rise: rising,
      fly: flying,
      victory: won,
    } = await read($, effects)
    const w = Math.max(24, e.props.bodyColumns ?? 40)
    // The pane pads one column on each side.
    const inner = w - 2

    const draftLabel = kind === 'todo' ? '[ ] ' : '+ '
    // The field's width: the row less its label and the submit hint beside it.
    const draftWidth = Math.max(8, inner - draftLabel.length - ' ↵ add'.length)

    const todos = list.filter(n => n.kind === 'todo')
    const pins = list.filter(n => n.kind === 'pin')
    const plain = list.filter(n => n.kind === 'note')
    const doneCount = todos.filter(n => n.isDone).length
    const openCount = all.filter(n => n.kind === 'todo' && !n.isDone).length
    const pinCount = all.filter(n => n.kind === 'pin').length
    // Open todos first, done ones after, each newest first.
    const sortedTodos = [...todos.filter(n => !n.isDone), ...todos.filter(n => n.isDone)]

    const toTodo = (id: string) =>
      save($, l => l.map(n => (n.id === id ? { ...n, kind: 'todo' as const, isDone: false } : n)))
    const toNote = (id: string) =>
      save($, l => l.map(n => (n.id === id ? { ...n, kind: 'note' as const, isDone: false } : n)))
    const toggleOpen = (id: string) => update($, expanded, cur => (cur === id ? '' : id))
    const usePrompt = (text: string) => $.prompt.fill({ text: text + '\n', mode: 'insert' })

    // A ruled section heading: label, a faint rule to the edge, then a dim figure.
    // With `isRaining`, rain sweeps along the rule instead of the line.
    const rule = (label: string, color: string, right: string, isRaining = false) => {
      const span = Math.max(2, w - label.length - right.length - 2)
      return (
        <Box key={`rule-${label}`} marginTop={1}>
          <Text color={color} bold>
            {label}
          </Text>
          {isRaining ? (
            <Text color={RAIN}>{' ' + (won.frame % 2 === 0 ? '╷ ' : ' ╷').repeat(Math.ceil(span / 2)).slice(0, span) + ' '}</Text>
          ) : (
            <Text color={C.faint}>{' ' + '─'.repeat(span) + ' '}</Text>
          )}
          <Text dimColor>{right}</Text>
        </Box>
      )
    }

    // A row going down into Nav, or coming back up: it fades, crumbles, and roots take it.
    const underRow = (n: Note, depth: number) => {
      const room = Math.max(4, inner)
      const frame =
        depth === 0 ? (
          <Text color={C.faint}>{oneLine(n.text, room)}</Text>
        ) : depth === 1 ? (
          <Text color={C.faint}>{'▒'.repeat(Math.min(room, Math.max(1, n.text.length)))}</Text>
        ) : depth === 2 ? (
          <Text color={C.faint}>{'░'.repeat(Math.min(room, Math.max(1, n.text.length)))}</Text>
        ) : (
          <Text color={ROOTS}>{' ╿ ┃ ╽ ┃'.repeat(Math.ceil(room / 8)).slice(0, room)}</Text>
        )
      return <Box key={n.id}>{frame}</Box>
    }
    // How deep a row is, when it is sinking or rising; undefined when it is at rest.
    const depthOf = (id: string) =>
      sinking.id === id ? sinking.frame : rising.id === id ? 3 - rising.frame : undefined

    // A row's text as drawn, carved or flown over when it is.
    // `line` is the text to draw on this row, one line of the item when it wraps.
    const rowText = (n: Note, room: number, bold?: boolean, dim?: boolean, line = oneLine(n.text, room)) => {
      if (flying.id === n.id) {
        const { before, after } = flown(line, room, flying.frame)
        return (
          <Text dimColor={dim}>
            {before}
            <Text color={C.accent} bold>
              ᵛ
            </Text>
            {after}
          </Text>
        )
      }
      if (carving.id === n.id) {
        const { cut, chips } = carved(line, carving.frame)
        return (
          <Text bold={bold}>
            {cut}
            <Text color={C.faint}>{chips}</Text>
          </Text>
        )
      }
      return (
        <Text dimColor={dim} strikethrough={dim} bold={bold}>
          {line}
        </Text>
      )
    }

    const actions = (n: Note) => (
      <Box key={`act-${n.id}`} columnGap={2} paddingLeft={2}>
        <Button key={`send-${n.id}`} plain onPress={() => send($, asMessage(n), n.id)}>
          <Text color={C.accent}>↗ send</Text>
        </Button>
        <Button key={`use-${n.id}`} plain onPress={() => usePrompt(n.text)}>
          <Text color={C.accent}>→ prompt</Text>
        </Button>
        {n.kind === 'todo' ? (
          <Button key={`note-${n.id}`} plain onPress={() => toNote(n.id)}>
            <Text color={C.note}>→ note</Text>
          </Button>
        ) : (
          <Button key={`todo-${n.id}`} plain onPress={() => toTodo(n.id)}>
            <Text color={C.todo}>→ todo</Text>
          </Button>
        )}
        <Button key={`del-${n.id}`} plain onPress={() => remove($, n.id)}>
          <Text color={C.faint}>delete</Text>
        </Button>
      </Box>
    )

    // A pin reads as a quote: a bar down the left, the words, then who said it.
    const pinRow = (n: Note) => {
      const depth = depthOf(n.id)
      if (depth !== undefined) return underRow(n, depth)
      const isOpen = open === n.id
      // The bar and its space take two columns of every row.
      const lines = isOpen ? wrapRows(n.text, inner - 2) : [oneLine(n.text, inner - 2)]
      const isDropping = dropping.id === n.id
      return (
        <Box key={n.id} flexDirection="column" marginBottom={1}>
          <Button key={`open-${n.id}`} plain onPress={() => toggleOpen(n.id)}>
            <Text color={isDropping ? LIGHTNING : n.id === lit ? C.accent : C.pin}>
              {(isDropping ? STONE_GLYPHS[dropping.frame] ?? '▍' : '▍') + ' '}
            </Text>
            {isOpen || flying.id !== n.id ? <Text bold={n.id === lit}>{lines[0] ?? ''}</Text> : rowText(n, inner - 2)}
          </Button>
          {lines.slice(1).map(line => (
            <Text>
              <Text color={C.pin}>▍ </Text>
              {line}
            </Text>
          ))}
          <Text color={C.faint}>{`  — ${n.from === 'you' ? 'you' : 'claude'} · ${clock(n.at)}`}</Text>
          {isOpen && actions(n)}
        </Box>
      )
    }

    // Drawn like a pin: a bar down the left, one line until opened, then when it was written.
    const noteRow = (n: Note) => {
      const depth = depthOf(n.id)
      if (depth !== undefined) return underRow(n, depth)
      const isOpen = open === n.id
      const lines = isOpen ? wrapRows(n.text, inner - 2) : [oneLine(n.text, inner - 2)]
      const bar = <Text color={n.id === lit ? C.accent : C.note}>▍ </Text>
      return (
        <Box key={n.id} flexDirection="column" marginBottom={1}>
          <Button key={`open-${n.id}`} plain onPress={() => toggleOpen(n.id)}>
            {bar}
            {rowText(n, inner - 2, n.id === lit, false, lines[0] ?? '')}
          </Button>
          {lines.slice(1).map(line => (
            <Text>
              {bar}
              {line}
            </Text>
          ))}
          <Text color={C.faint}>{`  — ${clock(n.at)}`}</Text>
          {isOpen && actions(n)}
        </Box>
      )
    }

    const openTodosMessage = `My open todos:\n${all
      .filter(n => n.kind === 'todo' && !n.isDone)
      .map(n => `- [ ] ${n.text}`)
      .join('\n')}`

    // Perun's word on the state of things.
    const quip =
      won.id !== ''
        ? 'Veles is driven back to Nav.'
        : all.length === 0
        ? 'Write, and I will keep it.'
        : openCount === 0
          ? 'All quiet in Prav.'
          : openCount === 1
            ? 'One todo left. Strike it.'
            : `${openCount} todos. Strike them down.`

    // One dot per todo, filled when done; past eight it is just the figure.
    const dots = todos.length > 0 && todos.length <= 8 ? '●'.repeat(doneCount) + '○'.repeat(todos.length - doneCount) + ' ' : ''

    return (
      <Box flexDirection="column" width={w} paddingX={1}>
        {w >= MASCOT_COLUMNS + 20 ? (
          // A blank row above, so his helmet does not run into the tab row.
          <Box columnGap={2} marginTop={1}>
            {/* Only the terminal and desktop run a Client's frame clock. */}
            {'Client' in els && (e.surface === 'terminal' || e.surface === 'desktop') ? (
              <els.Client key="perun" module="./mascot.tsx" props={{ cue: cued }} />
            ) : 'Svg' in els ? (
              <els.Svg source={mascotSvg({ isBlinking: false, isStriking: false })} alt="Perun, the thunder god, holding his axe" />
            ) : null}
            <Box flexDirection="column" justifyContent="center" flexShrink={1}>
              <Text color={C.accent} bold>
                ✎ perun notes
              </Text>
              <Text dimColor>{`${openCount} open · ${pinCount} pinned`}</Text>
              <Text color={C.faint} italic>
                {quip}
              </Text>
            </Box>
          </Box>
        ) : (
          <Box justifyContent="space-between">
            <Text color={C.accent} bold>
              ✎ perun notes
            </Text>
            <Text dimColor>{`${openCount} open · ${pinCount} pinned`}</Text>
          </Box>
        )}

        <Box flexDirection="column" marginTop={1}>
          {Input ? (
            <Input
              key="draft"
              value={typed}
              autoFocus
              label={draftLabel}
              placeholder={kind === 'todo' ? 'a todo…' : 'a note… (todo: makes a todo)'}
              submitLabel="add"
              // Grows with the text, up to a limit; past it the field scrolls.
              rows={Math.min(DRAFT_MAX_ROWS, rowCount(typed, draftWidth))}
              onInput={value => update($, draft, () => value)}
              onSubmit={async value => {
                await update($, draft, () => '')
                await addTyped($, value, kind)
              }}
            />
          ) : (
            <Text dimColor>add with /note or /todo</Text>
          )}
          {Input ? (
            <Input
              key="search"
              label="⌕ "
              value={q}
              placeholder="find…"
              submitLabel="done"
              onInput={async value => {
                await update($, query, () => value)
                // Perun looks about while you search.
                if (value.trim() !== '') await cueMascot($, 'glance')
              }}
              onSubmit={value => update($, query, () => value)}
            />
          ) : isSearching ? (
            <Text dimColor>find: {q}</Text>
          ) : null}
          <Box columnGap={2} flexWrap="wrap">
            <Button key="pin-a" plain hotkey="a" onPress={() => pin($, 'a')}>
              <Text dimColor>pin answer</Text>
            </Button>
            <Button key="pin-q" plain hotkey="q" onPress={() => pin($, 'q')}>
              <Text dimColor>pin question</Text>
            </Button>
            <Button
              key="kind"
              plain
              hotkey="k"
              onPress={() => update($, draftKind, k => (k === 'todo' ? 'note' : 'todo'))}
            >
              <Text dimColor>{kind === 'todo' ? 'write notes' : 'write todos'}</Text>
            </Button>
            {openCount > 0 && (
              <Button key="send-todos" plain hotkey="s" onPress={() => send($, openTodosMessage)}>
                <Text dimColor>send todos</Text>
              </Button>
            )}
            {deleted.length > 0 && (
              <Button key="undo" plain hotkey="u" onPress={() => undoDelete($)}>
                <Text color={C.accent}>undo delete</Text>
              </Button>
            )}
          </Box>
          {isSearching && (
            <Box columnGap={2}>
              <Text color={C.accent}>{list.length === 0 ? 'Veles hides it.' : `${list.length} of ${all.length} found`}</Text>
              <Button key="clear" plain hotkey="c" onPress={() => update($, query, () => '')}>
                <Text dimColor>clear</Text>
              </Button>
            </Box>
          )}
        </Box>

        {(!isSearching || todos.length > 0) && rule('todo', C.todo, todos.length > 0 ? `${dots}${doneCount}/${todos.length}` : '', won.id !== '')}
        {(!isSearching || todos.length > 0) && todos.length === 0 && (
          <Text color={C.faint}>nothing to do</Text>
        )}
        {sortedTodos.map(n => {
          const depth = depthOf(n.id)
          if (depth !== undefined) return underRow(n, depth)
          // Drawn like a pin: a bar down the left of every row, then when it was added. The whole
          // todo shows, wrapped; while it is being carved, only its first row. The box ticks it;
          // the text opens it, like a note, to its actions.
          const room = inner - 6
          const lines = wrapRows(n.text, room)
          const more = carving.id === n.id ? [] : lines.slice(1)
          const bar = <Text color={n.id === lit ? C.accent : n.isDone ? C.faint : C.todo}>▍ </Text>
          return (
            <Box key={n.id} flexDirection="column" marginBottom={1}>
              <Box key={`line-${n.id}`}>
                {bar}
                <Button key={`done-${n.id}`} plain onPress={() => toggleDone($, n.id)}>
                  {sparked.id === n.id ? (
                    // The serpent in the box, struck, then the rain.
                    <Text color={[C.pin, LIGHTNING, RAIN][sparked.frame] ?? C.todo} bold>
                      {['[∽] ', '[↯] ', '[╵] '][sparked.frame] ?? '[✓] '}
                    </Text>
                  ) : carving.id === n.id ? (
                    // Perun's thunder mark, cut into the new todo's box.
                    <Text color={LIGHTNING}>{'[✲] '}</Text>
                  ) : (
                    <Text color={n.id === lit ? C.accent : n.isDone ? C.faint : C.todo}>{n.isDone ? '[✓] ' : '[ ] '}</Text>
                  )}
                </Button>
                <Button key={`open-${n.id}`} plain onPress={() => toggleOpen(n.id)}>
                  {rowText(n, room, n.id === lit, n.isDone, lines[0] ?? '')}
                </Button>
              </Box>
              {more.map(line => (
                <Text>
                  {bar}
                  <Text dimColor={n.isDone} strikethrough={n.isDone} bold={n.id === lit}>
                    {'    ' + line}
                  </Text>
                </Text>
              ))}
              <Text color={C.faint}>{`  — ${n.isDone ? 'done' : 'added'} · ${clock(n.at)}`}</Text>
              {open === n.id && actions(n)}
            </Box>
          )
        })}

        {(!isSearching || pins.length > 0) && rule('pinned', C.pin, pins.length > 0 ? String(pins.length) : '')}
        {(!isSearching || pins.length > 0) && pins.length === 0 && (
          <Text color={C.faint}>a pins my last answer, q your question</Text>
        )}
        {pins.map(pinRow)}

        {(!isSearching || plain.length > 0) && rule('notes', C.note, plain.length > 0 ? String(plain.length) : '')}
        {(!isSearching || plain.length > 0) && plain.length === 0 && (
          <Text color={C.faint}>nothing written yet</Text>
        )}
        {plain.map(noteRow)}

        <Box key="version" justifyContent="flex-end" marginTop={1}>
          <Text color={C.faint}>{`v${VERSION}`}</Text>
        </Box>
      </Box>
    )
  })
}
