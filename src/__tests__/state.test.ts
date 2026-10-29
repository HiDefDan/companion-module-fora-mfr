import { describe, expect, it } from 'vitest'
import { RouterState } from '../state.js'
import { selectionValues } from '../variables.js'

function routerWith(): RouterState {
	const state = new RouterState()
	state.setSize(4, 8)
	state.setName('dst', 1, 'MON1')
	state.setName('src', 3, 'CAM3')
	state.routes.set(1, 3)
	return state
}

describe('RouterState selection', () => {
	it('selecting a destination clears the source and marks destination active', () => {
		const state = routerWith()
		state.selectSrc(2)
		state.selectDst(1)
		expect(state.selectedSrc).toBeUndefined()
		expect(state.active).toBe('dst')
		expect(state.isDstSelected(1, false)).toBe(true)
		expect(state.isDstSelected(0, false)).toBe(false)
	})

	it('highlights the source routed to the selected destination', () => {
		const state = routerWith()
		state.selectDst(1)
		expect(state.isRoutedSrc(3)).toBe(true)
		expect(state.isRoutedSrc(2)).toBe(false)
	})

	it('highlights destinations carrying the selected source', () => {
		const state = routerWith()
		state.routes.set(2, 3)
		state.selectSrc(3)
		expect(state.isRoutedDst(1)).toBe(true)
		expect(state.isRoutedDst(2)).toBe(true)
		expect(state.isRoutedDst(0)).toBe(false)
	})

	it('does not report routed destinations when no source is selected', () => {
		const state = routerWith()
		state.selectDst(0)
		expect(state.isRoutedDst(0)).toBe(false)
	})

	it('blinks the half of the pair that is not the active selection', () => {
		const state = routerWith()
		state.selectDst(1)
		state.selectSrc(3)
		expect(state.hasPair).toBe(true)
		expect(state.isSrcSelected(3, false)).toBe(true)
		expect(state.isDstSelected(1, false)).toBe(false)
		expect(state.isDstSelected(1, true)).toBe(true)
	})

	it('clearing the selection resets everything', () => {
		const state = routerWith()
		state.selectDst(1)
		state.selectSrc(3)
		state.clearSelection()
		expect(state.hasPair).toBe(false)
		expect(state.active).toBeUndefined()
		expect(state.selectedDstSrc).toBeUndefined()
	})

	it('treats any lock mode above zero as locked', () => {
		const state = routerWith()
		state.locks.set(0, 1)
		state.locks.set(1, 2)
		state.locks.set(2, 0)
		expect(state.isLocked(0)).toBe(true)
		expect(state.isLocked(1)).toBe(true)
		expect(state.isLocked(2)).toBe(false)
		expect(state.isLocked(3)).toBe(false)
	})

	it('falls back to a numbered name until the router supplies one', () => {
		const state = routerWith()
		expect(state.dstName(0)).toBe('DST-1')
		expect(state.srcName(3)).toBe('CAM3')
	})

	it('reports whether a size or name actually changed', () => {
		const state = new RouterState()
		expect(state.setSize(4, 8)).toBe(true)
		expect(state.setSize(4, 8)).toBe(false)
		expect(state.setName('dst', 0, 'A')).toBe(true)
		expect(state.setName('dst', 0, 'A')).toBe(false)
	})
})

describe('selectionValues', () => {
	it('is all null with nothing selected', () => {
		const values = selectionValues(routerWith())
		expect(Object.values(values).every((v) => v === null)).toBe(true)
	})

	it('exposes the same variables and formats as v1', () => {
		const state = routerWith()
		state.selectDst(1)
		expect(selectionValues(state)).toEqual({
			selected_dst_id: '01',
			selected_dst_name: 'MON1',
			selected_dst_src_id: '03',
			selected_dst_src_name: 'CAM3',
			selected_src_id: null,
			selected_src_name: null,
			active_selected_id: '01',
			active_selected_name: 'MON1',
			active_selected_type: 'dst',
		})
		state.selectSrc(3)
		expect(selectionValues(state)).toMatchObject({
			selected_src_id: '03',
			selected_src_name: 'CAM3',
			active_selected_id: '03',
			active_selected_name: 'CAM3',
			active_selected_type: 'src',
		})
	})
})
