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

  const row = (await ui.findAll({ type: 'Button' })).find(b => /^send-/.test(b.key ?? '') && b.key !== 'send-todos')
  await ui.press({ key: row?.key ?? '' })
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

test('Perun strikes on a new note, settles, and the new note glows', async ($, on) => {
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
  const ui = await $.ui.mount(PANE)
  const lightning = { type: 'Text', text: /^▀+$/, in: 'perun' } as const
  const isLit = async () =>
    (await ui.findAll(lightning)).some(t => t.props.color === '#ffe45c' || t.props.backgroundColor === '#ffe45c')

  // The greeting strike, then calm.
  await ui.advance(100)
  expect(await isLit()).toBe(true)
  await ui.advance(1000)
  expect(await isLit()).toBe(false)

  await $.command.run({ command: 'note', args: 'thunder' })
  await ui.advance(100)
  expect(await isLit()).toBe(true)
  expect(await ui.find({ type: 'Text', text: /✦/ })).toBeTruthy()
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

test('a deleted item is struck by lightning, then gone', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'todo', args: 'old chore' })
  const ui = await $.ui.mount(PANE)
  const del = (await ui.findAll({ type: 'Button' })).find(b => /^del-/.test(b.key ?? ''))
  await ui.press({ key: del?.key ?? '' })

  expect(await ui.find({ type: 'Text', text: /^↯ old chore$/ })).toBeTruthy()
  await clock.advance(140)
  expect(await ui.find({ type: 'Text', text: /^╲╱/ })).toBeTruthy()
  await clock.advance(140)
  expect(await ui.find({ type: 'Text', text: /˙/ })).toBeTruthy()
  await clock.advance(200)
  expect(await ui.find({ type: 'Text', text: /old chore|╲╱|˙/ })).toBeFalsy()
  expect(await ui.find({ key: 'undo' })).toBeTruthy()
  await ui.unmount()
})

test('ticking a todo sparks in its box; unticking does not', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'todo', args: 'tick me' })
  const ui = await $.ui.mount(PANE)
  const box = (await ui.findAll({ type: 'Button' })).find(b => /^done-/.test(b.key ?? ''))
  const key = box?.key ?? ''
  const mark = async () => (await ui.find({ type: 'Text', text: /^\[.\] $/ }))?.props.color

  await ui.press({ key })
  expect(await ui.find({ type: 'Text', text: /^\[↯\] $/ })).toBeTruthy()
  await clock.advance(120)
  expect(await mark()).toBe('#ffe45c')
  await clock.advance(160)
  // The spark is over; past the new-item glow too, it rests as a done todo.
  expect(await mark()).not.toBe('#ffe45c')
  await clock.advance(1600)
  expect(await mark()).toBe('subtle')

  await ui.press({ key })
  expect(await ui.find({ type: 'Text', text: /^\[↯\] $/ })).toBeFalsy()
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
