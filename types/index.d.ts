export type NoteKind = 'note' | 'todo' | 'pin'

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
    notes: {
      notes: Note[]
      project: string
      lastQuestion: string
      lastAnswer: string
      draftKind: 'note' | 'todo'
      expanded: string
      lastDeleted: Note[]
      query: string
      strikes: number
      fresh: string
    }
  }
}
