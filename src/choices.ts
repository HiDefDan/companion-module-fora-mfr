import type { DropdownChoice } from '@companion-module/base'
import { toHex } from './protocol.js'
import type { RouterState } from './state.js'

export const VIDEO_FORMATS: DropdownChoice<string>[] = [
	{ id: '00', label: '1080/59.94i' },
	{ id: '01', label: '1080/59.94p' },
	{ id: '02', label: '1080/60i' },
	{ id: '03', label: '1080/60p' },
	{ id: '04', label: '1080/50i' },
	{ id: '05', label: '1080/50p' },
	{ id: '06', label: '720/60p' },
	{ id: '07', label: '720/60i' },
	{ id: '08', label: '720/50p' },
	{ id: '09', label: '1080/30p' },
	{ id: '0A', label: '1080/29.97p' },
	{ id: '0B', label: '1080/25p' },
	{ id: '0C', label: '1080/24p' },
	{ id: '0D', label: '1080/23.98p' },
	{ id: '0E', label: '1080/30PsF' },
	{ id: '0F', label: '1080/29.97PsF' },
	{ id: '10', label: '1080/25PsF' },
	{ id: '11', label: '1080/24PsF' },
	{ id: '12', label: '1080/23.98PsF' },
	{ id: '13', label: '525/59.94i' },
	{ id: '14', label: '625/50i' },
]

export const REFERENCES: DropdownChoice<string>[] = [
	{ id: 'RA', label: 'Auto' },
	{ id: 'RB', label: 'B.B' },
	{ id: 'RT', label: 'Tri-Sync' },
]

export const SWITCHING_POINTS: DropdownChoice<string>[] = [
	{ id: 'SF', label: 'Field' },
	{ id: 'SO', label: 'Odd' },
	{ id: 'SE', label: 'Even' },
]

export const LOCK_MODES: DropdownChoice<string>[] = [
	{ id: '0', label: 'Unlock' },
	{ id: '1', label: 'Lock' },
	// { id: '2', label: 'Lock others' }, // only valid in a multiple router system
]

/** Destination choices, built from the router's current size and names. Ids are hex port numbers. */
export function destinationChoices(state: RouterState): DropdownChoice<string>[] {
	return portChoices(state.dstCount, (i) => state.dstName(i))
}

export function sourceChoices(state: RouterState): DropdownChoice<string>[] {
	return portChoices(state.srcCount, (i) => state.srcName(i))
}

function portChoices(count: number, name: (index: number) => string): DropdownChoice<string>[] {
	// before the router has reported its size keep one entry, so the dropdowns are never empty
	const length = Math.max(count, 1)
	return Array.from({ length }, (_, i) => ({ id: toHex(i), label: `${i + 1}: ${name(i)}` }))
}
