import type { Lighting } from '@renderer/lib/office/prefs'

/** three.js materials take plain colours, not CSS variables, so the office keeps its own. */
export interface ScenePalette {
  readonly background: string
  readonly floor: string
  readonly carpet: string
  readonly wall: string
  readonly trim: string
  readonly ambient: number
  readonly sun: number
  readonly sunColor: string
}

export const PALETTES: Readonly<Record<Lighting, ScenePalette>> = {
  day: {
    background: '#161a20',
    floor: '#b98a5e',
    carpet: '#4b5058',
    wall: '#e8e2d6',
    trim: '#2b3038',
    ambient: 0.75,
    sun: 1.5,
    sunColor: '#fff4e0'
  },
  night: {
    background: '#0b0d12',
    floor: '#5d4733',
    carpet: '#2a2e36',
    wall: '#7d7a78',
    trim: '#171a20',
    ambient: 1.1,
    sun: 0.9,
    sunColor: '#9db4ff'
  }
}

export const COLORS = {
  desk: '#dcb98a',
  teacherDesk: '#8f5f38',
  deskLeg: '#7d8087',
  board: '#1f4d3a',
  boardFrame: '#8a5a34',
  chalk: '#f6f3e8',
  band: '#f37021',
  bandText: '#ffffff',
  chair: '#23272e',
  monitor: '#14171c',
  screenOn: '#7fe3ff',
  screenOff: '#2a3038',
  working: '#35d6ff',
  selected: '#ffffff',
  done: '#5fd38a',
  pot: '#ece8df',
  leaf: '#3f7d4c',
  leafDark: '#2f6340',
  trousers: '#2c3340'
} as const

const SKIN = ['#f1c9a5', '#e0ac7e', '#c68c5a', '#9a6540', '#6f4529'] as const
const HAIR = ['#2b2118', '#4a3323', '#111318', '#7a4b2a', '#a8a29a'] as const

/** Stable per member, so a person looks the same every time the office opens. */
export const skinOf = (memberId: number): string => SKIN[memberId % SKIN.length]
export const hairOf = (memberId: number): string => HAIR[(memberId * 3 + 1) % HAIR.length]
