import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Note, NoteKind } from '../types'

const PANE = 'notes'
const TITLE = 'Notes'

const notes = atom({ plugin: 'notes', key: 'notes' } as const, [])
const project = atom({ plugin: 'notes', key: 'project' } as const, '')
const lastQuestion = atom({ plugin: 'notes', key: 'lastQuestion' } as const, '')
const lastAnswer = atom({ plugin: 'notes', key: 'lastAnswer' } as const, '')
const draftKind = atom({ plugin: 'notes', key: 'draftKind' } as const, 'note')
const expanded = atom({ plugin: 'notes', key: 'expanded' } as const, '')
const lastDeleted = atom({ plugin: 'notes', key: 'lastDeleted' } as const, [])
const query = atom({ plugin: 'notes', key: 'query' } as const, '')

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

async function add($: $Of, note: Note) {
  if (note.text === '') return
  await save($, list => [note, ...list])
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

async function remove($: $Of, id: string) {
  const gone = (await read($, notes)).filter(n => n.id === id)
  await update($, lastDeleted, () => gone)
  await save($, list => list.filter(n => n.id !== id))
}

async function undoDelete($: $Of) {
  const back = await read($, lastDeleted)
  await update($, lastDeleted, () => [])
  await save($, list => [...back, ...list].sort((a, b) => b.at - a.at))
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

const oneLine = (text: string, width: number) => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > width ? line.slice(0, Math.max(1, width - 1)) + '…' : line
}

// Theme colour names, as flightdeck uses them: they follow the person's Claude Code theme.
const C = {
  capture: 'claude',
  todo: 'success',
  pin: 'merged',
  note: 'suggestion',
  dim: 'inactive',
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
      description: 'Open the notes sidebar, optionally searching it',
      argumentHint: '[search]',
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

    if (e.isInteractive) void $.ui.open({ id: PANE, title: TITLE })

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

  on('command.run', { command: 'notes' }, async ($, e) => {
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

  on('tool.call', { tool: 'mcp__notes__add' }, async ($, e) => {
    const input = e as unknown as { kind?: string; text?: string }
    const text = typeof input.text === 'string' ? input.text.trim() : ''
    if (text === '') return { deny: 'text is empty' }
    await add($, make(input.kind === 'todo' ? 'todo' : 'note', text))
    return { result: `Added ${input.kind === 'todo' ? 'a todo' : 'a note'} to the sidebar.` }
  })

  on('tool.call', { tool: 'mcp__notes__list' }, async ($, e) => {
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
    const open = await read($, expanded)
    const deleted = await read($, lastDeleted)
    const w = Math.max(24, e.props.bodyColumns ?? 40)
    // Inside a card: the border and one column of padding on each side.
    const inner = w - 4

    const todos = list.filter(n => n.kind === 'todo')
    const pins = list.filter(n => n.kind === 'pin')
    const plain = list.filter(n => n.kind === 'note')
    const doneCount = todos.filter(n => n.isDone).length
    const openCount = all.filter(n => n.kind === 'todo' && !n.isDone).length
    const pinCount = all.filter(n => n.kind === 'pin').length
    // Open todos first, done ones after, each newest first.
    const sortedTodos = [...todos.filter(n => !n.isDone), ...todos.filter(n => n.isDone)]

    const toggleDone = (id: string) =>
      save($, l => l.map(n => (n.id === id ? { ...n, isDone: !n.isDone } : n)))
    const toTodo = (id: string) =>
      save($, l => l.map(n => (n.id === id ? { ...n, kind: 'todo' as const, isDone: false } : n)))
    const toggleOpen = (id: string) => update($, expanded, cur => (cur === id ? '' : id))
    const usePrompt = (text: string) => $.prompt.fill({ text: text + '\n', mode: 'insert' })

    const gauge = (part: number, of: number, cells: number) => {
      const lit = of === 0 ? 0 : Math.round((part / of) * cells)
      return { on: '▬'.repeat(lit), off: '▬'.repeat(cells - lit) }
    }

    const card = (key: string, color: string, title: string, sub: string, right: RenderChildren, body: RenderChildren) => (
      <Box key={key} flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} width={w}>
        <Box justifyContent="space-between">
          <Text color={color} bold wrap="truncate">
            {title}
            {sub ? <Text color={color}>{` · ${sub}`}</Text> : null}
          </Text>
          {right}
        </Box>
        {body}
      </Box>
    )

    const textRow = (n: Note, color: string) => {
      const isOpen = open === n.id
      const who = n.kind === 'pin' ? (n.from === 'you' ? 'you' : 'claude') : ''
      const head = `${who ? who + ' ' : ''}${clock(n.at)} `
      return (
        <Box key={n.id} flexDirection="column" marginBottom={isOpen ? 1 : 0}>
          <Button key={`open-${n.id}`} plain onPress={() => toggleOpen(n.id)}>
            <Text color={color}>{isOpen ? '▾ ' : n.kind === 'pin' ? '◆ ' : '▸ '}</Text>
            {who ? <Text color={color} bold>{who + ' '}</Text> : null}
            <Text color={C.faint}>{clock(n.at) + ' '}</Text>
            {isOpen ? '' : oneLine(n.text, Math.max(8, inner - head.length - 2))}
          </Button>
          {isOpen && <Text>{n.text}</Text>}
          {isOpen && (
            <Box columnGap={1}>
              <Button key={`use-${n.id}`} label="to prompt" onPress={() => usePrompt(n.text)} />
              <Button key={`todo-${n.id}`} label="todo" onPress={() => toTodo(n.id)} />
              <Button key={`del-${n.id}`} label="delete" onPress={() => remove($, n.id)} />
            </Box>
          )}
        </Box>
      )
    }

    const tg = gauge(doneCount, todos.length, Math.min(10, Math.max(4, inner - 24)))

    return (
      <Box flexDirection="column" width={w}>
        <Box justifyContent="center">
          <Text bold wrap="truncate">
            <Text>NOTES</Text>
            <Text color={C.dim}> · </Text>
            <Text color={C.todo}>{String(openCount)}</Text>
            <Text>{' OPEN'}</Text>
            <Text color={C.dim}> · </Text>
            <Text color={C.pin}>{String(pinCount)}</Text>
            <Text>{' PINNED'}</Text>
          </Text>
        </Box>
        <Box justifyContent="center" columnGap={2}>
          <Text>
            <Text color={C.todo}>■</Text>
            <Text dimColor> todos</Text>
          </Text>
          <Text>
            <Text color={C.pin}>■</Text>
            <Text dimColor> pinned</Text>
          </Text>
          <Text>
            <Text color={C.note}>■</Text>
            <Text dimColor> notes</Text>
          </Text>
        </Box>

        {card(
          'capture',
          C.capture,
          'CAPTURE',
          kind,
          <Text color={C.faint}>k switch</Text>,
          <Box flexDirection="column">
            <Box columnGap={1}>
              <Button key="pin-a" hotkey="a" label="pin answer" onPress={() => pin($, 'a')} />
              <Button key="pin-q" hotkey="q" label="pin question" onPress={() => pin($, 'q')} />
            </Box>
            <Box columnGap={1}>
              <Button
                key="kind"
                hotkey="k"
                label={kind === 'todo' ? 'adding todo' : 'adding note'}
                onPress={() => update($, draftKind, k => (k === 'todo' ? 'note' : 'todo'))}
              />
              {deleted.length > 0 && (
                <Button key="undo" hotkey="u" label="undo delete" onPress={() => undoDelete($)} />
              )}
            </Box>
            {Input ? (
              <Input
                key="draft"
                value=""
                autoFocus
                label={kind === 'todo' ? '○ ' : '▸ '}
                placeholder={kind === 'todo' ? 'new todo…' : 'new note… (todo: makes a todo)'}
                submitLabel="add"
                onSubmit={value => addTyped($, value, kind)}
              />
            ) : (
              <Text dimColor>add with /note or /todo</Text>
            )}
            {Input ? (
              <Input
                key="search"
                label="⌕ "
                value={q}
                placeholder="search…"
                submitLabel="done"
                onInput={value => update($, query, () => value)}
                onSubmit={value => update($, query, () => value)}
              />
            ) : isSearching ? (
              <Text dimColor>search: {q}</Text>
            ) : null}
            {isSearching && (
              <Box columnGap={1}>
                <Text dimColor>{`${list.length} of ${all.length} match`}</Text>
                <Button key="clear" hotkey="c" label="clear search" onPress={() => update($, query, () => '')} />
              </Box>
            )}
          </Box>,
        )}

        {(!isSearching || todos.length > 0) &&
          card(
            'todos',
            C.todo,
            'TODOS',
            todos.length > 0 ? `${doneCount}/${todos.length} done` : '',
            todos.length > 0 ? (
              <Text>
                <Text color={C.todo}>{tg.on}</Text>
                <Text color={C.faint}>{tg.off}</Text>
              </Text>
            ) : null,
            <Box flexDirection="column">
              {todos.length === 0 && <Text color={C.faint}>nothing to do · /todo &lt;text&gt;</Text>}
              {sortedTodos.map(n => (
                <Box key={n.id} justifyContent="space-between">
                  <Button key={`done-${n.id}`} plain onPress={() => toggleDone(n.id)}>
                    <Text color={n.isDone ? C.dim : C.todo}>{n.isDone ? '✓ ' : '○ '}</Text>
                    <Text dimColor={n.isDone} strikethrough={n.isDone}>
                      {oneLine(n.text, inner - 5)}
                    </Text>
                  </Button>
                  <Button key={`del-${n.id}`} plain onPress={() => remove($, n.id)}>
                    <Text color={C.faint}>×</Text>
                  </Button>
                </Box>
              ))}
            </Box>,
          )}

        {(!isSearching || pins.length > 0) &&
          card(
            'pinned',
            C.pin,
            'PINNED',
            '',
            <Text dimColor>{String(pins.length)}</Text>,
            <Box flexDirection="column">
              {pins.length === 0 && <Text color={C.faint}>a pins an answer · q a question</Text>}
              {pins.map(n => textRow(n, C.pin))}
            </Box>,
          )}

        {(!isSearching || plain.length > 0) &&
          card(
            'notes',
            C.note,
            'NOTES',
            '',
            <Text dimColor>{String(plain.length)}</Text>,
            <Box flexDirection="column">
              {plain.length === 0 && <Text color={C.faint}>none yet · /note &lt;text&gt;</Text>}
              {plain.map(n => textRow(n, C.note))}
            </Box>,
          )}
      </Box>
    )
  })
}
