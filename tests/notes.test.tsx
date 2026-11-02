import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'perun-notes',
  component: 'Pane',
  requestId: 'notes',
  surface: 'terminal',
  props: {
    title: 'Notes',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('notes, todos and pins show in the pane', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  const kept: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: kept[e.key] }))
  on('store.set', (_, e) => {
    kept[e.key] = e.value
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'How do I rebase?' })
  await $.turn.complete({
    answer: 'Use git rebase -i main.',
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await $.command.run({ command: 'note', args: 'remember the relay' })
  await $.command.run({ command: 'todo', args: 'write tests' })
  await $.command.run({ command: 'note', args: 'todo: ship it' })
  await $.command.run({ command: 'pin', args: '' })
  await $.command.run({ command: 'pin', args: 'q' })
  await clock.advance(2000)

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /^○○ 0\/2$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^2 open · 2 pinned$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /write tests/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /ship it/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /— claude · / })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /— you · / })).toBeTruthy()
  await ui.unmount()
})

test('search filters every section and /notes takes a query', async ($, on) => {
  const clock = mock.clock(on)
  const kept: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: kept[e.key] }))
  on('store.set', (_, e) => {
    kept[e.key] = e.value
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'note', args: 'Relay keys rotate monthly' })
  await $.command.run({ command: 'todo', args: 'rotate relay key' })
  await $.command.run({ command: 'note', args: 'buy milk' })
  await clock.advance(2000)
  const ran = await $.command.run({ command: 'notes', args: 'relay' })
  expect(ran.text).toBe('2 notes match "relay".')

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /2 of 3 found/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /rotate relay key/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: /buy milk/ })).toBeFalsy()
  expect(await ui.find({ type: 'Button', text: /Relay keys/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^pinned$/ })).toBeFalsy()

  await ui.press({ key: 'clear' })
  expect(await ui.find({ type: 'Button', text: /buy milk/ })).toBeTruthy()
  await ui.unmount()
})

test('items and open todos are sent as the person\'s message', async ($, on) => {
  const kept: Record<string, unknown> = {}
  const sent: string[] = []
  on('store.get', (_, e) => ({ value: kept[e.key] }))
  on('store.set', (_, e) => {
    kept[e.key] = e.value
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'todo', args: 'write docs' })
  await $.command.run({ command: 'todo', args: 'fix login' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'send-todos' })
  expect(sent).toEqual(['My open todos:\n- [ ] fix login\n- [ ] write docs'])

  // Newest first: fix login's row opens first.
  const opener = (await ui.findAll({ type: 'Button' })).find(b => /^open-/.test(b.key ?? ''))
  await ui.press({ key: opener?.key ?? '' })
  await ui.press({ key: `send-${(opener?.key ?? '').slice(5)}` })
  expect(sent[1]).toBe('Todo: fix login')
  await ui.unmount()
})

test('an expanded pin keeps its bar on every row', async ($, on) => {
  const kept: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: kept[e.key] }))
  on('store.set', (_, e) => {
    kept[e.key] = e.value
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const answer =
    'This answer is long enough that it has to wrap over several rows of a narrow pane.\n\nA second paragraph after a blank line.'
  await $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.command.run({ command: 'pin', args: '' })

  const ui = await $.ui.mount(PANE)
  const opener = (await ui.findAll({ type: 'Button' })).find(b => /^open-/.test(b.key ?? ''))
  await ui.press({ key: opener?.key ?? '' })

  // The pane is 40 wide with a column of padding each side: 38, less the bar's two.
  const rows = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '').filter(t => t.startsWith('▍ '))
  expect(rows.length).toBeGreaterThan(3)
  for (const row of rows) expect(row.length).toBeLessThanOrEqual(38)
  expect(rows.some(r => r === '▍ ')).toBe(true)
  await ui.unmount()
})

test('a new note: Perun taps his blade and the note is carved in, chips flying', async ($, on) => {
  const kept: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: kept[e.key] }))
  on('store.set', (_, e) => {
    kept[e.key] = e.value
    return { value: undefined }
  })
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)
  const lit = async () =>
    (await ui.findAll({ type: 'Text', in: 'perun' })).filter(
      t => t.props.color === '#ffe45c' || t.props.backgroundColor === '#ffe45c',
    ).length

  // The greeting strike lights blade and bolt, then calm.
  await ui.advance(100)
  const greeting = await lit()
  expect(greeting).toBeGreaterThan(0)
  await ui.advance(1000)
  expect(await lit()).toBe(0)

  await $.command.run({ command: 'note', args: 'thunder over the oak' })
  await ui.advance(100)
  // A tap lights the blade alone: fewer cells than a strike.
  expect(await lit()).toBeGreaterThan(0)
  expect(await lit()).toBeLessThan(greeting)

  // Carved a little at a time, chips flying, then whole and glowing.
  const row = async () => (await ui.find({ type: 'Button', text: /thu/ }))?.text ?? ''
  expect(await row()).toMatch(/·˙$/)
  expect(await row()).not.toMatch(/oak/)
  await clock.advance(400)
  expect(await row()).toMatch(/thunder over the oak$/)
  // Its bar glows while it is new.
  expect((await ui.find({ type: 'Text', text: /^▍ $/ }))?.props.color).toBe('claude')
  await ui.unmount()
})

test('a new todo has the thunder mark cut in its box; a pin drops a thunderstone', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)
  await $.command.run({ command: 'todo', args: 'mark me' })
  expect(await ui.find({ type: 'Text', text: /^\[✲\] $/ })).toBeTruthy()
  await clock.advance(400)
  expect(await ui.find({ type: 'Text', text: /^\[✲\] $/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /^\[ \] $/ })).toBeTruthy()

  await $.turn.complete({ answer: 'Kept.', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' })
  await $.command.run({ command: 'pin', args: '' })
  const bars = async () => (await ui.findAll({ type: 'Text', text: /^. $/ })).map(t => t.text)
  expect(await bars()).toContain('˙ ')
  await clock.advance(90)
  expect(await bars()).toContain('▾ ')
  await clock.advance(90)
  expect(await bars()).toContain('▼ ')
  await clock.advance(200)
  expect(await bars()).toContain('▍ ')
  await ui.unmount()
})

test('a sent item: the eagle flies off toward the chat and Perun looks after it', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'todo', args: 'fly away' })
  await clock.advance(2000)
  const ui = await $.ui.mount(PANE)
  const opener = await ui.find({ type: 'Button', text: /fly away/ })
  await ui.press({ key: opener?.key ?? '' })
  await ui.press({ key: `send-${(opener?.key ?? '').slice(5)}` })

  const eagleAt = async () => {
    const row = await ui.find({ type: 'Button', text: /ᵛ/ })
    return row ? row.text.indexOf('ᵛ') : -1
  }
  const first = await eagleAt()
  expect(first).toBeGreaterThan(0)
  await clock.advance(140)
  expect(await eagleAt()).toBeLessThan(first)
  await clock.advance(400)
  expect(await eagleAt()).toBe(-1)
  await ui.unmount()
})

test('without a Client the mascot is drawn still', async ($, on) => {
  on('store.get', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'vscode', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ type: 'Client' })).toBeFalsy()
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toMatch(/Perun/)
  expect(await ui.find({ type: 'Text', text: /Write, and I will keep it\./ })).toBeTruthy()
  await ui.unmount()
})

test('a deleted item sinks into Nav, and undo brings it back up', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'todo', args: 'old chore' })
  await clock.advance(2000)
  const ui = await $.ui.mount(PANE)
  const opener = await ui.find({ type: 'Button', text: /old chore/ })
  await ui.press({ key: opener?.key ?? '' })
  await ui.press({ key: `del-${(opener?.key ?? '').slice(5)}` })

  expect((await ui.find({ type: 'Text', text: /^old chore$/ }))?.props.color).toBe('subtle')
  await clock.advance(120)
  expect(await ui.find({ type: 'Text', text: /^▒+$/ })).toBeTruthy()
  await clock.advance(120)
  expect(await ui.find({ type: 'Text', text: /^░+$/ })).toBeTruthy()
  await clock.advance(120)
  expect(await ui.find({ type: 'Text', text: /╿/ })).toBeTruthy()
  await clock.advance(120)
  expect(await ui.find({ type: 'Text', text: /old chore|▒|░|╿/ })).toBeFalsy()

  await ui.press({ key: 'undo' })
  expect(await ui.find({ type: 'Text', text: /╿/ })).toBeTruthy()
  await clock.advance(120)
  expect(await ui.find({ type: 'Text', text: /^░+$/ })).toBeTruthy()
  await clock.advance(240)
  expect(await ui.find({ type: 'Button', text: /old chore/ })).toBeTruthy()
  await ui.unmount()
})

test('ticking a todo: the serpent is struck, rain falls, then the tick', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'todo', args: 'tick me' })
  await $.command.run({ command: 'todo', args: 'and me' })
  await clock.advance(2000)
  const ui = await $.ui.mount(PANE)
  const keyOf = async (text: RegExp) => (await ui.find({ type: 'Button', text }))?.key ?? ''
  // The box is its own button; the text beside it opens the todo.
  const key = `done-${(await keyOf(/tick me/)).slice(5)}`
  const box = async () => ({ text: (await ui.find({ key }))?.text })

  await ui.press({ key })
  expect((await box())?.text).toBe('[∽] ')
  await clock.advance(120)
  expect((await box())?.text).toBe('[↯] ')
  await clock.advance(120)
  expect((await box())?.text).toBe('[╵] ')
  await clock.advance(120)
  expect(await ui.find({ type: 'Text', text: /^\[[∽↯╵]\] $/ })).toBeFalsy()
  // Not the last todo: no victory rain.
  expect(await ui.find({ type: 'Text', text: /╷/ })).toBeFalsy()

  // Unticking plays nothing.
  await ui.press({ key })
  expect(await ui.find({ type: 'Text', text: /^\[∽\] $/ })).toBeFalsy()
  await ui.unmount()
})

test('the last open todo ticked: rain sweeps the rule, Perun raises his axe and speaks', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'todo', args: 'the last one' })
  await clock.advance(2000)
  const ui = await $.ui.mount(PANE)
  await ui.advance(1500)
  const figure = async () => JSON.stringify((await ui.findAll({ type: 'Text', in: 'perun' })).map(t => [t.text, t.props.color, t.props.backgroundColor]))
  const still = await figure()

  await ui.press({ key: `done-${((await ui.find({ type: 'Button', text: /the last one/ }))?.key ?? '').slice(5)}` })
  expect(await ui.find({ type: 'Text', text: /Veles is driven back to Nav\./ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /╷/ })).toBeTruthy()
  await ui.advance(500)
  expect(await figure()).not.toBe(still)

  await clock.advance(4500)
  expect(await ui.find({ type: 'Text', text: /╷/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /All quiet in Prav\./ })).toBeTruthy()
  await ui.unmount()
})

test('a search that finds nothing: Veles hides it', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'note', args: 'oak' })
  await clock.advance(2000)
  const ui = await $.ui.mount(PANE)
  await ui.input({ key: 'search', text: 'birch', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: /^Veles hides it\.$/ })).toBeTruthy()
  await ui.unmount()
})

test('the pane shares the dock: it opens unasked once, not again on a reload', async ($, on) => {
  mock.store(on)
  const opened: string[] = []
  let isOpen = false
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    isOpen = true
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({
    value: isOpen ? [{ id: 'notes', title: 'Notes', isShown: false, isFocused: false, isPlaced: true }] : [],
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  const start = () => $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await start()
  expect(opened).toEqual(['notes'])

  // A reload runs session.start again: the open pane is left where it is in the tabs.
  await start()
  expect(opened).toEqual(['notes'])
})

test('auto-open can be turned off', async ($, on) => {
  mock.store(on)
  const opened: string[] = []
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.command.run({ command: 'notes', args: 'auto off' })
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([])
})

test('Perun idles: over half a minute he does several different things', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)
  const looks = new Set<string>()
  for (let i = 0; i < 300; i++) {
    await ui.advance(100)
    const cells = await ui.findAll({ type: 'Text', in: 'perun' })
    looks.add(JSON.stringify(cells.map(c => [c.text, c.props.color, c.props.backgroundColor])))
  }
  // Rest, blinks, the greeting strike, and at least a few idle moves.
  expect(looks.size).toBeGreaterThan(5)
  await ui.unmount()
})

test('the add field grows to fit its text, and shrinks once added', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)
  const rows = async () => (await ui.find({ type: 'Input', key: 'draft' }))?.props.rows
  expect(await rows()).toBe(1)

  const long = 'check the relay logs for rotated keys and then write the summary for the team'
  await ui.input({ key: 'draft', text: long, kind: 'change' })
  expect(await rows()).toBeGreaterThan(2)
  await ui.input({ key: 'draft', text: 'a\nb\nc', kind: 'change' })
  expect(await rows()).toBe(3)
  await ui.input({ key: 'draft', text: (long + ' ').repeat(10), kind: 'change' })
  expect(await rows()).toBe(8)

  await ui.input({ key: 'draft', text: long })
  await clock.advance(2000)
  expect(await rows()).toBe(1)
  expect(await ui.find({ type: 'Text', text: /check the relay/ })).toBeTruthy()
  await ui.unmount()
})

test('the version shows at the bottom right', async ($, on) => {
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /^v\d+\.\d+\.\d+$/ })).toBeTruthy()
  await ui.unmount()
})

test('a long todo wraps to show all of it, barred like a pin', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const long = 'rotate the relay signing key and update every client that pins the old one before friday'
  await $.command.run({ command: 'todo', args: long })
  await clock.advance(2000)
  const ui = await $.ui.mount(PANE)

  const shown = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(shown.some(t => t.includes('…'))).toBe(false)
  for (const word of ['rotate', 'pins', 'friday']) expect(shown.some(t => t.includes(word))).toBe(true)
  // Like a pin: the bar on every row, within the 38 columns inside the padding.
  const rows = shown.filter(t => t.startsWith('▍ '))
  expect(rows.length).toBeGreaterThan(1)
  for (const row of rows) expect(row.length).toBeLessThanOrEqual(38)
  expect(await ui.find({ type: 'Text', text: /^  — added · \d\d:\d\d$/ })).toBeTruthy()
  await ui.unmount()
})

test('a note is barred like a pin: one line until opened, then all of it', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'note', args: 'the relay rotates its keys monthly, and every client has to fetch the new one' })
  await clock.advance(2000)
  const ui = await $.ui.mount(PANE)
  const barred = async () => (await ui.findAll({ type: 'Text' })).filter(t => t.text.startsWith('▍ '))

  const row = await ui.find({ type: 'Button', text: /^▍ the relay/ })
  expect(row?.text).toMatch(/…$/)
  expect(await ui.find({ type: 'Text', text: /^  — \d\d:\d\d$/ })).toBeTruthy()

  await ui.press({ key: row?.key ?? '' })
  expect((await barred()).length).toBeGreaterThan(1)
  expect((await ui.findAll({ type: 'Text' })).some(t => t.text.includes('new one'))).toBe(true)
  expect(await ui.find({ key: `del-${(row?.key ?? '').slice(5)}` })).toBeTruthy()
  await ui.unmount()
})

test('a todo opens like a note: send, prompt, to a note, delete; its box still ticks it', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const filled: string[] = []
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'todo', args: 'water the oak' })
  await clock.advance(2000)
  const ui = await $.ui.mount(PANE)
  const opener = await ui.find({ type: 'Button', text: /water the oak/ })
  const id = (opener?.key ?? '').slice(5)
  expect(await ui.find({ key: `send-${id}` })).toBeFalsy()

  await ui.press({ key: opener?.key ?? '' })
  for (const k of ['send', 'use', 'note', 'del']) expect(await ui.find({ key: `${k}-${id}` })).toBeTruthy()
  expect(await ui.find({ key: `todo-${id}` })).toBeFalsy()

  await ui.press({ key: `use-${id}` })
  expect(filled).toEqual(['water the oak\n'])

  await ui.press({ key: `note-${id}` })
  expect(await ui.find({ key: `done-${id}` })).toBeFalsy()
  expect(await ui.find({ type: 'Button', text: /^▍ water the oak$/ })).toBeTruthy()
  await ui.unmount()
})
