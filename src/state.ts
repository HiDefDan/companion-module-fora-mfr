export type ActiveSelection = 'src' | 'dst'

/**
 * What we know about the router and what the operator has selected.
 * Ports are zero based numbers; formatting for display or the wire happens elsewhere.
 */
export class RouterState {
	routerId: string | undefined
	level: string | undefined
	dstCount = 0
	srcCount = 0
	readonly dstNames = new Map<number, string>()
	readonly srcNames = new Map<number, string>()
	/** destination -> source currently routed */
	readonly routes = new Map<number, number>()
	/** destination -> lock mode (0 unlocked, 1 lock all, 2 lock others) */
	readonly locks = new Map<number, number>()

	selectedDst: number | undefined
	selectedSrc: number | undefined
	active: ActiveSelection | undefined

	setSize(outputs: number, inputs: number): boolean {
		const changed = outputs !== this.dstCount || inputs !== this.srcCount
		this.dstCount = outputs
		this.srcCount = inputs
		return changed
	}

	/** Returns true if the name changed */
	setName(kind: 'src' | 'dst', index: number, name: string): boolean {
		const names = kind === 'src' ? this.srcNames : this.dstNames
		if (names.get(index) === name) return false
		names.set(index, name)
		return true
	}

	dstName(index: number): string {
		return this.dstNames.get(index) ?? `DST-${index + 1}`
	}

	srcName(index: number): string {
		return this.srcNames.get(index) ?? `SRC-${index + 1}`
	}

	selectDst(index: number): void {
		this.selectedDst = index
		this.selectedSrc = undefined
		this.active = 'dst'
	}

	selectSrc(index: number): void {
		this.selectedSrc = index
		this.active = 'src'
	}

	clearSelection(): void {
		this.selectedDst = undefined
		this.selectedSrc = undefined
		this.active = undefined
	}

	/** The source routed to the selected destination */
	get selectedDstSrc(): number | undefined {
		return this.selectedDst === undefined ? undefined : this.routes.get(this.selectedDst)
	}

	/** Both ends chosen, so the unselected-looking half of the pair should blink */
	get hasPair(): boolean {
		return this.selectedDst !== undefined && this.selectedSrc !== undefined
	}

	isSrcSelected(src: number, blink: boolean): boolean {
		return this.selectedSrc === src && (this.active === 'src' || (this.active === 'dst' && blink))
	}

	isDstSelected(dst: number, blink: boolean): boolean {
		return this.selectedDst === dst && (this.active === 'dst' || (this.active === 'src' && blink))
	}

	/** True for the source routed to the selected destination */
	isRoutedSrc(src: number): boolean {
		return this.active === 'dst' && this.selectedDstSrc === src
	}

	/** True for each destination carrying the selected source */
	isRoutedDst(dst: number): boolean {
		return this.active === 'src' && this.selectedSrc !== undefined && this.routes.get(dst) === this.selectedSrc
	}

	isLocked(dst: number): boolean {
		return (this.locks.get(dst) ?? 0) > 0
	}
}
