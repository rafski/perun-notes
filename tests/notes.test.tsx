import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'notes',
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
  expect(await ui.find({ type: 'Text', text: /TODOS · 0\/2 done/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /NOTES · 2 OPEN · 2 PINNED/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /write tests/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /ship it/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^claude $/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^you $/ })).toBeTruthy()
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
  expect(await ui.find({ type: 'Text', text: /2 of 3 match/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /rotate relay key/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: /buy milk/ })).toBeFalsy()
  expect(await ui.find({ type: 'Button', text: /Relay keys/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^PINNED$/ })).toBeFalsy()

  await ui.press({ key: 'clear' })
  expect(await ui.find({ type: 'Button', text: /buy milk/ })).toBeTruthy()
  await ui.unmount()
})
