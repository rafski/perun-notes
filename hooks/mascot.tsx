// Perun on the surface's frame clock: he blinks, and every few seconds does one small idle
// move (a glance, a glint, wind in his beard or cloak, far thunder). Each time `cue.n` goes up
// he answers what was done: lightning for a ticked todo, a tap of the blade for a new item,
// the axe raised for the last todo, a look toward the chat for a send, glances while
// searching. Only this region redraws.
import type { ClientModule } from 'claude-code'

import { mascotRows } from './mascot-art'
import type { IdleMove } from './mascot-art'
import type { Cue } from '../types'

type Props = { cue: { n: number; move: Cue } }
type Ref = {
  tick: number
  lastCue: number
  move: Cue
  cueTick: number
  blinkUntil: number
  nextBlink: number
  idle: IdleMove
  idleTick: number
  idleUntil: number
  nextIdle: number
  seed: number
  pose: string
}
type State = { ref: Ref }

const TICK_MS = 100
// Which ticks of a strike are lit: a short flicker, not a flash.
const FLICKER = [true, true, false, true, false, false, true]
// How long each answer lasts, in ticks.
const CUE_TICKS: Record<Cue, number> = { strike: 7, tap: 2, raise: 16, lookLeft: 12, glance: 10 }

// Each idle move, how long it lasts in ticks, and how many ticks each of its frames holds.
const MOVES: { move: IdleMove; ticks: number; step: number }[] = [
  { move: 'lookLeft', ticks: 14, step: 99 },
  { move: 'lookRight', ticks: 14, step: 99 },
  { move: 'glint', ticks: 3, step: 99 },
  { move: 'beard', ticks: 12, step: 3 },
  { move: 'cloak', ticks: 10, step: 2 },
  { move: 'rumble', ticks: 6, step: 1 },
]

// A small seeded generator, so his habits are varied but no two moves land on a beat.
const nextSeed = (seed: number) => (seed * 1103515245 + 12345) % 2147483648

const Mascot: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  // The first draw strikes once, as a greeting.
  const ref = surface.state?.ref ?? {
    tick: 0,
    lastCue: -1,
    move: 'strike' as Cue,
    cueTick: -99,
    blinkUntil: -1,
    nextBlink: 35,
    idle: 'none' as IdleMove,
    idleTick: 0,
    idleUntil: -1,
    nextIdle: 30,
    seed: 20251024,
    pose: '',
  }
  const n = props.cue?.n ?? 0
  if (n !== ref.lastCue) {
    // The first draw strikes once, whatever the last cue was.
    ref.move = ref.lastCue === -1 ? 'strike' : (props.cue?.move ?? 'strike')
    ref.lastCue = n
    ref.cueTick = ref.tick
  }

  const poseAt = () => {
    const since = ref.tick - ref.cueTick
    const isCued = since >= 0 && since < CUE_TICKS[ref.move]
    const isFlicker = since < FLICKER.length && FLICKER[since] === true
    const isIdle = ref.tick <= ref.idleUntil
    const step = MOVES.find(m => m.move === ref.idle)?.step ?? 99
    // A look the cue asks for takes the place of any idle move.
    const look: IdleMove | undefined = !isCued
      ? undefined
      : ref.move === 'lookLeft'
        ? 'lookLeft'
        : ref.move === 'glance'
          ? since < CUE_TICKS.glance / 2 ? 'lookLeft' : 'lookRight'
          : undefined
    return {
      isStriking: isCued && (ref.move === 'strike' || ref.move === 'raise') && isFlicker,
      isBladeLit: isCued && ref.move === 'tap',
      isRaised: isCued && ref.move === 'raise',
      isBlinking: ref.tick <= ref.blinkUntil,
      idle: look ?? (isIdle ? ref.idle : ('none' as IdleMove)),
      frame: look ? 0 : isIdle ? Math.floor((ref.tick - ref.idleTick) / step) : 0,
    }
  }

  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(TICK_MS, () => {
      ref.tick += 1
      if (ref.tick >= ref.nextBlink) {
        ref.blinkUntil = ref.tick + 1
        // Every 4 to 7 seconds, never on a beat.
        ref.nextBlink = ref.tick + 40 + ((ref.tick * 7) % 31)
      }
      if (ref.tick >= ref.nextIdle) {
        // One move every 3 to 8 seconds, never the same one twice in a row.
        ref.seed = nextSeed(ref.seed)
        const choices = MOVES.filter(m => m.move !== ref.idle)
        const pick = choices[ref.seed % choices.length] ?? MOVES[0]
        if (pick) {
          ref.idle = pick.move
          ref.idleTick = ref.tick
          ref.idleUntil = ref.tick + pick.ticks - 1
        }
        ref.seed = nextSeed(ref.seed)
        ref.nextIdle = ref.tick + 30 + (ref.seed % 51)
      }
      const pose = poseAt()
      const key = `${pose.isBlinking}${pose.isStriking}${pose.isBladeLit}${pose.isRaised}${pose.idle}${pose.frame}`
      // Redraw only when what is drawn changes.
      if (key !== ref.pose) {
        ref.pose = key
        surface.setState({ ref })
      }
    })
  }

  return (
    <Box flexDirection="column">
      {mascotRows(poseAt()).map(runs => (
        <Text>
          {runs.map(r => (
            <Text color={r.color} backgroundColor={r.backgroundColor}>
              {r.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

export default Mascot
