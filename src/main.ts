import {
	InstanceBase,
	InstanceStatus,
	TCPHelper,
	type CompanionVariableValues,
	type SomeCompanionConfigField,
} from '@companion-module/base'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { SELECTION_FEEDBACKS, UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import {
	Cmd,
	LineBuffer,
	NAMES_PER_BLOCK,
	parseHex,
	parseLine,
	toHex,
	type Message,
	type NameKind,
} from './protocol.js'
import { CommandQueue } from './queue.js'
import { RouterState } from './state.js'
import { UpgradeScripts } from './upgrades.js'
import {
	UpdateVariableDefinitions,
	dstVar,
	lockVar,
	selectionValues,
	srcVar,
	xptVar,
	type VariablesSchema,
} from './variables.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

/** The router has at most 8 levels; each is probed to find the one in use */
const MAX_LEVELS = 8
const BLINK_INTERVAL_MS = 500
const DEFINITIONS_DEBOUNCE_MS = 100

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()
	readonly state = new RouterState()
	/** Toggled by a timer while a source and destination are both selected */
	blink = false

	#socket: TCPHelper | undefined
	readonly #lines = new LineBuffer()
	readonly #queue = new CommandQueue((command) => this.#write(command))
	#awaitingSize = true
	#blinkTimer: ReturnType<typeof setInterval> | undefined
	#definitionsTimer: ReturnType<typeof setTimeout> | undefined
	#choicesDirty = false
	#portsDirty = false

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		this.#publishDefinitions(true)
		this.#connect()
	}

	async destroy(): Promise<void> {
		this.#disconnect()
		this.#stopBlink()
		if (this.#definitionsTimer) clearTimeout(this.#definitionsTimer)
		this.#definitionsTimer = undefined
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.#connect()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	// ---- actions ----------------------------------------------------------------------------

	selectDestination(value: string): void {
		const dst = this.#port(value, this.state.dstCount)
		if (dst === undefined) return
		this.state.selectDst(dst)
		this.#selectionChanged()
	}

	selectSource(value: string): void {
		const src = this.#port(value, this.state.srcCount)
		if (src === undefined) return
		this.state.selectSrc(src)
		this.#selectionChanged()
	}

	/** Cut or preset the selected source to the selected destination */
	routeSelection(mode: 'cut' | 'preset'): void {
		const { level, selectedDst, selectedSrc } = this.state
		if (level === undefined || selectedDst === undefined || selectedSrc === undefined) {
			this.log('warn', 'Select a destination and a source before switching')
			return
		}
		if (mode === 'cut') {
			this.#send(Cmd.cut(level, selectedDst, selectedSrc))
			this.state.clearSelection()
			this.#selectionChanged()
		} else {
			this.#send(Cmd.preset(level, selectedDst, selectedSrc))
		}
	}

	cutPresets(): void {
		this.#send(Cmd.cutPresets())
		this.state.clearSelection()
		this.#selectionChanged()
	}

	setVideoFormat(format: string, reference: string, point: string): void {
		this.#send(Cmd.setVideoFormat(format, reference, point))
	}

	applyVideoFormat(): void {
		this.#send(Cmd.applyVideoFormat())
	}

	cancelVideoFormat(): void {
		this.#send(Cmd.cancelVideoFormat())
	}

	rename(kind: NameKind, value: string, name: string): void {
		const index = this.#port(value, kind === 'dst' ? this.state.dstCount : this.state.srcCount)
		const trimmed = name.trim()
		if (index === undefined) return
		if (!trimmed) {
			this.log('warn', 'Cannot rename to an empty name')
			return
		}
		this.#send(Cmd.rename(kind, index, trimmed))
		// don't wait for the router to confirm
		if (this.state.setName(kind, index, trimmed)) this.#nameChanged(kind, index)
	}

	lockDestination(value: string, mode: string): void {
		const dst = this.#port(value, this.state.dstCount)
		const { level, routerId } = this.state
		if (dst === undefined) return
		if (level === undefined || routerId === undefined) {
			this.log('warn', 'Cannot lock yet: the router has not reported its level and unit ID')
			return
		}
		this.#send(Cmd.lock(level, dst, routerId, mode))
	}

	// ---- connection -------------------------------------------------------------------------

	#connect(): void {
		this.#disconnect()

		const { host, port } = this.config
		if (!host) {
			this.updateStatus(InstanceStatus.BadConfig, 'No host configured')
			return
		}

		this.updateStatus(InstanceStatus.Connecting)
		const socket = new TCPHelper(host, port)
		this.#socket = socket

		socket.on('status_change', (status, message) => {
			this.updateStatus(status, message)
			if (status !== InstanceStatus.Ok) this.#queue.clear()
		})
		socket.on('error', (err) => this.log('error', `Network error: ${err.message}`))
		socket.on('connect', () => {
			this.#lines.reset()
			this.#queue.clear()
			this.#awaitingSize = true
			this.#requestInitialState()
		})
		socket.on('data', (data) => {
			for (const line of this.#lines.push(data)) {
				for (const message of parseLine(line, this.#queue.pending)) this.#handleMessage(message)
			}
		})
	}

	#disconnect(): void {
		this.#queue.clear()
		this.#lines.reset()
		this.#socket?.destroy()
		this.#socket = undefined
	}

	#write(command: string): boolean {
		if (!this.#socket?.isConnected) return false
		this.#socket.send(`${command}\r`)
		return true
	}

	/** Operator commands jump ahead of the bulk reads made while syncing with the router */
	#send(command: string, urgent = true): void {
		if (!this.#socket?.isConnected) {
			this.log('warn', `Not connected, dropped command: ${command}`)
			return
		}
		if (!this.#queue.enqueue(command, urgent)) this.log('warn', `Command queue full, dropped command: ${command}`)
	}

	/** Ask which CPU is active and how big each level is; the rest is requested once the size is known */
	#requestInitialState(): void {
		this.#send(Cmd.cpuStatus(), false)
		for (let level = 0; level < MAX_LEVELS; level++) this.#send(Cmd.systemSize(level), false)
	}

	#requestRouterContents(level: string): void {
		this.#send(Cmd.crosspoints(level), false)
		for (const kind of ['src', 'dst'] as const) {
			const count = kind === 'src' ? this.state.srcCount : this.state.dstCount
			for (let block = 0; block < Math.ceil(count / NAMES_PER_BLOCK); block++) {
				this.#send(Cmd.names(kind, block * NAMES_PER_BLOCK), false)
			}
		}
		for (let dst = 0; dst < this.state.dstCount; dst++) this.#send(Cmd.lockStatus(level, dst), false)
	}

	// ---- incoming messages ------------------------------------------------------------------

	#handleMessage(message: Message): void {
		const { state } = this
		switch (message.type) {
			case 'echo':
				this.#queue.acknowledge()
				break

			case 'cpu':
				state.routerId = message.id
				this.setVariableValues({ id: message.id })
				break

			case 'systemSize': {
				// levels are probed in order; the first to answer is the one in use
				if (!this.#awaitingSize) break
				this.#awaitingSize = false
				this.#queue.drop((command) => command.startsWith('@ F?'))
				state.level = message.level
				const changed = state.setSize(message.outputs, message.inputs)
				if (changed) {
					this.#portsDirty = true
					this.#publishVariableDefinitions()
					this.#scheduleDefinitions()
				}
				this.setVariableValues({ level: message.level, outputs: message.outputs, inputs: message.inputs })
				this.#requestRouterContents(message.level)
				break
			}

			case 'crosspoint': {
				if (message.level !== state.level || message.dst >= state.dstCount) break
				state.routes.set(message.dst, message.src)
				this.setVariableValues({ [xptVar(message.dst)]: toHex(message.src) })
				if (message.dst === state.selectedDst) this.setVariableValues(selectionValues(state))
				this.checkFeedbacks('RoutedSource', 'RoutedDestination')
				break
			}

			case 'name': {
				const count = message.kind === 'dst' ? state.dstCount : state.srcCount
				if (message.index >= count) break
				if (state.setName(message.kind, message.index, message.name)) this.#nameChanged(message.kind, message.index)
				break
			}

			case 'lock': {
				if (message.level !== state.level || message.dst >= state.dstCount) break
				state.locks.set(message.dst, message.mode)
				this.setVariableValues({ [lockVar(message.dst)]: message.mode })
				this.checkFeedbacks('LockedDestination')
				break
			}
		}
	}

	// ---- derived updates --------------------------------------------------------------------

	#port(value: string, count: number): number | undefined {
		const port = parseHex(value)
		if (port === undefined) {
			this.log('warn', `Invalid port: ${String(value)}`)
			return undefined
		}
		if (count > 0 && port >= count) {
			this.log('warn', `Port ${port + 1} is outside the router's size (${count})`)
			return undefined
		}
		return port
	}

	#selectionChanged(): void {
		this.setVariableValues(selectionValues(this.state))
		this.checkFeedbacks(...SELECTION_FEEDBACKS)
		this.#updateBlink()
	}

	#nameChanged(kind: NameKind, index: number): void {
		const values: CompanionVariableValues =
			kind === 'dst' ? { [dstVar(index)]: this.state.dstName(index) } : { [srcVar(index)]: this.state.srcName(index) }
		this.setVariableValues({ ...values, ...selectionValues(this.state) })
		this.#choicesDirty = true
		this.#scheduleDefinitions()
	}

	#updateBlink(): void {
		if (this.state.hasPair) {
			this.#blinkTimer ??= setInterval(() => {
				this.blink = !this.blink
				this.checkFeedbacks('SelectedSource', 'SelectedDestination')
			}, BLINK_INTERVAL_MS)
		} else {
			this.#stopBlink()
		}
	}

	#stopBlink(): void {
		if (this.#blinkTimer) clearInterval(this.#blinkTimer)
		this.#blinkTimer = undefined
		this.blink = false
	}

	// ---- definitions ------------------------------------------------------------------------

	#publishVariableDefinitions(): void {
		UpdateVariableDefinitions((definitions) => this.setVariableDefinitions(definitions), this.state)
	}

	/** Names arrive one block at a time; batch the resulting dropdown/preset rebuilds */
	#scheduleDefinitions(): void {
		this.#definitionsTimer ??= setTimeout(() => {
			this.#definitionsTimer = undefined
			this.#publishDefinitions(false)
		}, DEFINITIONS_DEBOUNCE_MS)
	}

	#publishDefinitions(all: boolean): void {
		if (all) this.#publishVariableDefinitions()
		if (all || this.#portsDirty) UpdatePresets(this)
		if (all || this.#portsDirty || this.#choicesDirty) {
			UpdateActions(this)
			UpdateFeedbacks(this)
		}
		this.#portsDirty = false
		this.#choicesDirty = false
		this.checkAllFeedbacks()
	}
}
