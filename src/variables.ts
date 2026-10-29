import type { CompanionVariableDefinitions, CompanionVariableValues } from '@companion-module/base'
import { toHex } from './protocol.js'
import type { RouterState } from './state.js'

/** Variable ids are dynamic (dst01, src01, xpt01, ...) so values are an open record */
export type VariablesSchema = CompanionVariableValues

const pad = (index: number): string => String(index + 1).padStart(2, '0')

export const dstVar = (index: number): string => `dst${pad(index)}`
export const srcVar = (index: number): string => `src${pad(index)}`
export const xptVar = (index: number): string => `xpt${pad(index)}`
export const lockVar = (index: number): string => `dst${pad(index)}_locked`

export function UpdateVariableDefinitions(
	setDefinitions: (definitions: CompanionVariableDefinitions<VariablesSchema>) => void,
	state: RouterState,
): void {
	const definitions: CompanionVariableDefinitions<VariablesSchema> = {
		id: { name: 'Router unit ID' },
		level: { name: 'Crosspoint level' },
		outputs: { name: 'Number of destinations' },
		inputs: { name: 'Number of sources' },
		selected_dst_id: { name: 'Selected destination id (hex)' },
		selected_dst_name: { name: 'Selected destination name' },
		selected_dst_src_id: { name: 'Source id routed to the selected destination (hex)' },
		selected_dst_src_name: { name: 'Source name routed to the selected destination' },
		selected_src_id: { name: 'Selected source id (hex)' },
		selected_src_name: { name: 'Selected source name' },
		active_selected_id: { name: 'Most recently selected port id (hex)' },
		active_selected_name: { name: 'Most recently selected port name' },
		active_selected_type: { name: 'Most recently selected port type (src or dst)' },
	}
	for (let i = 0; i < state.dstCount; i++) {
		const n = pad(i)
		definitions[dstVar(i)] = { name: `DST-${n} name` }
		definitions[xptVar(i)] = { name: `XPT-${n} routed source id (hex)` }
		definitions[lockVar(i)] = { name: `DST-${n} lock mode` }
	}
	for (let i = 0; i < state.srcCount; i++) {
		definitions[srcVar(i)] = { name: `SRC-${pad(i)} name` }
	}
	setDefinitions(definitions)
}

/** The selection related variables, derived from state */
export function selectionValues(state: RouterState): VariablesSchema {
	const { selectedDst, selectedSrc, selectedDstSrc, active } = state
	const activeIndex = active === 'dst' ? selectedDst : active === 'src' ? selectedSrc : undefined
	return {
		selected_dst_id: selectedDst === undefined ? null : toHex(selectedDst),
		selected_dst_name: selectedDst === undefined ? null : state.dstName(selectedDst),
		selected_dst_src_id: selectedDstSrc === undefined ? null : toHex(selectedDstSrc),
		selected_dst_src_name: selectedDstSrc === undefined ? null : state.srcName(selectedDstSrc),
		selected_src_id: selectedSrc === undefined ? null : toHex(selectedSrc),
		selected_src_name: selectedSrc === undefined ? null : state.srcName(selectedSrc),
		active_selected_id: activeIndex === undefined ? null : toHex(activeIndex),
		active_selected_name:
			activeIndex === undefined ? null : active === 'dst' ? state.dstName(activeIndex) : state.srcName(activeIndex),
		active_selected_type: active ?? null,
	}
}
