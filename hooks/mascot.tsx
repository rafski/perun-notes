// Perun on the surface's frame clock: he blinks, and every few seconds does one small idle
// move (a glance, a glint, wind in his beard or cloak, far thunder); lightning flickers over
// his axe each time `strikes` goes up (a note added, a pin, a send). Only this region redraws.
import type { ClientModule } from 'claude-code'

import { mascotRows } from './mascot-art'
import type { IdleMove } from './mascot-art'

type Props = { strikes: number }
type Ref = {
  tick: number
  lastStrikes: number
  strikeTick: number
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
    lastStrikes: -1,
    strikeTick: -99,
    blinkUntil: -1,
    nextBlink: 35,
    idle: 'none' as IdleMove,
    idleTick: 0,
    idleUntil: -1,
    nextIdle: 30,
    seed: 20251024,
    pose: '',
  }
  if (props.strikes !== ref.lastStrikes) {
    ref.lastStrikes = props.strikes
    ref.strikeTick = ref.tick
  }

  const poseAt = () => {
    const since = ref.tick - ref.strikeTick
    const isIdle = ref.tick <= ref.idleUntil
    const step = MOVES.find(m => m.move === ref.idle)?.step ?? 99
    return {
      isStriking: since >= 0 && since < FLICKER.length && FLICKER[since] === true,
      isBlinking: ref.tick <= ref.blinkUntil,
      idle: isIdle ? ref.idle : ('none' as IdleMove),
      frame: isIdle ? Math.floor((ref.tick - ref.idleTick) / step) : 0,
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
      const key = `${pose.isBlinking}${pose.isStriking}${pose.idle}${pose.frame}`
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
