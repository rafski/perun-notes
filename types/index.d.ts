export type NoteKind = 'note' | 'todo' | 'pin'

// What Perun does in answer: strike (a todo ticked), tap (an item added), raise (the last
// todo ticked), lookLeft (an item sent to the chat), glance (searching).
export type Cue = 'strike' | 'tap' | 'raise' | 'lookLeft' | 'glance'

// The row effects: carving a new item, a pin's thunderstone, a ticked todo's serpent and
// rain, sinking into Nav and rising back, the eagle carrying a send, the last todo's rain.
export type Effect = 'carve' | 'stone' | 'spark' | 'sink' | 'rise' | 'fly' | 'victory'

export type Note = {
  id: string
  kind: NoteKind
  text: string
  // Who said a pinned message.
  from?: 'you' | 'claude'
  isDone?: boolean
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'perun-notes': {
      notes: Note[]
      project: string
      lastQuestion: string
      lastAnswer: string
      draftKind: 'note' | 'todo'
      // The add field's text so far.
      draft: string
      expanded: string
      lastDeleted: Note[]
      query: string
      // Perun's latest reaction; `n` goes up each time.
      cue: { n: number; move: Cue }
      fresh: string
      // Each effect: the row playing it ('' when none), and which frame it is on.
      effects: Record<Effect, { id: string; frame: number }>
      // The person closed the pane this session: it is not opened again unasked.
      wasClosed: boolean
    }
  }
}
