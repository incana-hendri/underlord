export const DIR4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

export const DIR8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const

export function ix(w: number, x: number, y: number): number {
  return y * w + x
}

export function gx(w: number, i: number): number {
  return i % w
}

export function gy(w: number, i: number): number {
  return (i / w) | 0
}

export function inMap(w: number, h: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < w && y < h
}

export function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by)
}

class Heap {
  private k: number[] = []
  private v: number[] = []

  get size(): number {
    return this.k.length
  }

  push(key: number, val: number): void {
    this.k.push(key)
    this.v.push(val)
    this.up(this.k.length - 1)
  }

  pop(): number {
    const top = this.v[0]!
    const n = this.k.length - 1
    this.k[0] = this.k[n]!
    this.v[0] = this.v[n]!
    this.k.pop()
    this.v.pop()
    if (this.k.length) this.down(0)
    return top
  }

  private up(i: number): void {
    const k = this.k
    const v = this.v
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p]! <= k[i]!) break
      ;[k[p], k[i]] = [k[i]!, k[p]!]
      ;[v[p], v[i]] = [v[i]!, v[p]!]
      i = p
    }
  }

  private down(i: number): void {
    const k = this.k
    const v = this.v
    const n = k.length
    for (;;) {
      let s = i
      const l = i * 2 + 1
      const r = l + 1
      if (l < n && k[l]! < k[s]!) s = l
      if (r < n && k[r]! < k[s]!) s = r
      if (s === i) break
      ;[k[s], k[i]] = [k[i]!, k[s]!]
      ;[v[s], v[i]] = [v[i]!, v[s]!]
      i = s
    }
  }
}

/**
 * A* on a grid. `costOf` returns a multiplier >= 1, or Infinity if blocked.
 * Diagonal steps are forbidden when either adjacent cardinal is blocked.
 * Returns tile indices from the step after `start` through `goal`, or null.
 */
export function findPath(
  width: number,
  height: number,
  start: number,
  goal: number,
  costOf: (index: number) => number,
): number[] | null {
  if (start === goal) return []
  const n = width * height
  if (start < 0 || goal < 0 || start >= n || goal >= n) return null
  if (!Number.isFinite(costOf(goal))) return null

  const gScore = new Float64Array(n)
  gScore.fill(Infinity)
  gScore[start] = 0
  const prev = new Int32Array(n)
  prev.fill(-1)
  const closed = new Uint8Array(n)
  const heap = new Heap()
  const sx = start % width
  const sy = (start / width) | 0
  const gx0 = goal % width
  const gy0 = (goal / width) | 0
  heap.push(octile(sx, sy, gx0, gy0), start)

  let expansions = 0
  const limit = n
  while (heap.size) {
    const cur = heap.pop()
    if (closed[cur]) continue
    closed[cur] = 1
    if (cur === goal) return rebuild(prev, start, goal)
    if (++expansions > limit) return null
    const x = cur % width
    const y = (cur / width) | 0
    const base = gScore[cur]!
    for (let d = 0; d < 8; d++) {
      const dx = DIR8[d]![0]
      const dy = DIR8[d]![1]
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const ni = ny * width + nx
      const c = costOf(ni)
      if (!Number.isFinite(c)) continue
      if (dx !== 0 && dy !== 0) {
        const a = costOf(y * width + nx)
        const b = costOf(ny * width + x)
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue
      }
      const step = dx !== 0 && dy !== 0 ? 1.41421356237 : 1
      const ng = base + step * c
      if (ng >= gScore[ni]!) continue
      gScore[ni] = ng
      prev[ni] = cur
      const h = octile(nx, ny, gx0, gy0)
      heap.push(ng + h, ni)
    }
  }
  return null
}

function octile(x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.abs(x0 - x1)
  const dy = Math.abs(y0 - y1)
  const m = Math.min(dx, dy)
  return m * 1.41421356237 + (Math.max(dx, dy) - m)
}

function rebuild(prev: Int32Array, start: number, goal: number): number[] {
  const out: number[] = []
  let c = goal
  while (c !== start && c !== -1) {
    out.push(c)
    c = prev[c]!
  }
  out.reverse()
  return out
}
