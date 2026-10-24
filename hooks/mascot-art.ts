// Perun, the thunder god, as pixel art. The chronicle's idol had a silver head and a golden
// moustache; he holds his axe. Two pixel rows share a terminal row through half blocks.

const PALETTE: Record<string, string> = {
  H: '#c9ced6', // silver helmet
  h: '#8b93a1',
  S: '#e6b48c', // face and hand
  E: '#2a2320', // eyes
  G: '#e2a72e', // golden moustache and beard
  g: '#a8740f',
  B: '#b5372c', // red cloak
  b: '#7a2119',
  W: '#7b4a22', // axe handle
  A: '#d5dae2', // axe blade
  L: '#ffe45c', // lightning
}

// 10 columns by 8 pixel rows: 4 terminal rows.
const BASE = [
  '..hHHh..W.',
  '.HHHHHH.WA',
  '.SESSES.WA',
  'GGSSSSGGW.',
  '.gGGGGg.W.',
  '.BBgGBBSW.',
  'BBBBBBBBW.',
  '.bbbbbbb..',
]

const EYES: [number, number][] = [
  [2, 2],
  [2, 5],
]
const BLADE: [number, number][] = [
  [1, 9],
  [2, 9],
]
// A spark over the blade and a flicker by the helmet.
const BOLT: [number, number][] = [
  [0, 9],
  [0, 1],
  [1, 0],
]

export const MASCOT_COLUMNS = 10
export const MASCOT_ROWS = 4

export type MascotPose = { isBlinking: boolean; isStriking: boolean }

// One run of cells drawn alike: the glyph repeated, its colour, and the colour behind it.
export type Run = { text: string; color?: string; backgroundColor?: string }

function gridOf(pose: MascotPose) {
  const grid = BASE.map(row => row.split(''))
  const paint = (cells: [number, number][], key: string) => {
    for (const [y, x] of cells) {
      const row = grid[y]
      if (row) row[x] = key
    }
  }
  if (pose.isBlinking) paint(EYES, 'S')
  if (pose.isStriking) {
    paint(BLADE, 'L')
    paint(BOLT, 'L')
  }
  return grid
}

// The still figure as an SVG, for surfaces that draw one but run no Client.
export function mascotSvg(pose: MascotPose, pixel = 4) {
  const grid = gridOf(pose)
  const rects = grid
    .flatMap((row, y) =>
      row.map((key, x) =>
        key === '.' ? '' : `<rect x="${x * pixel}" y="${y * pixel}" width="${pixel}" height="${pixel}" fill="${PALETTE[key]}"/>`,
      ),
    )
    .join('')
  const width = MASCOT_COLUMNS * pixel
  const height = BASE.length * pixel
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rects}</svg>`
}

export function mascotRows(pose: MascotPose): Run[][] {
  const grid = gridOf(pose)

  const colorOf = (y: number, x: number) => {
    const key = grid[y]?.[x] ?? '.'
    return key === '.' ? undefined : PALETTE[key]
  }

  const rows: Run[][] = []
  for (let y = 0; y < grid.length; y += 2) {
    const runs: Run[] = []
    for (let x = 0; x < MASCOT_COLUMNS; x++) {
      const top = colorOf(y, x)
      const bottom = colorOf(y + 1, x)
      const cell: Run =
        top && bottom
          ? { text: '▀', color: top, backgroundColor: bottom }
          : top
            ? { text: '▀', color: top }
            : bottom
              ? { text: '▄', color: bottom }
              : { text: ' ' }
      const last = runs[runs.length - 1]
      if (last && last.color === cell.color && last.backgroundColor === cell.backgroundColor && last.text[0] === cell.text) {
        last.text += cell.text
      } else {
        runs.push(cell)
      }
    }
    rows.push(runs)
  }
  return rows
}
