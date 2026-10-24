// Perun on the surface's frame clock: he blinks now and then, and lightning flickers over his
// axe each time `strikes` goes up (a note added, a pin, a send). Only this region redraws.
import type { ClientModule } from 'claude-code'

import { mascotRows } from './mascot-art'

type Props = { strikes: number }
type Ref = { tick: number; lastStrikes: number; strikeTick: number; blinkUntil: number; nextBlink: number; pose: string }
type State = { ref: Ref }

const TICK_MS = 100
// Which ticks of a strike are lit: a short flicker, not a flash.
const FLICKER = [true, true, false, true, false, false, true]

const Mascot: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  // The first draw strikes once, as a greeting.
  const ref = surface.state?.ref ?? { tick: 0, lastStrikes: -1, strikeTick: -99, blinkUntil: -1, nextBlink: 35, pose: '' }
  if (props.strikes !== ref.lastStrikes) {
    ref.lastStrikes = props.strikes
    ref.strikeTick = ref.tick
  }

  const poseAt = () => {
    const since = ref.tick - ref.strikeTick
    return {
      isStriking: since >= 0 && since < FLICKER.length && FLICKER[since] === true,
      isBlinking: ref.tick <= ref.blinkUntil,
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
      const pose = poseAt()
      const key = `${pose.isBlinking}${pose.isStriking}`
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
