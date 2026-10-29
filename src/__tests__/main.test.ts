import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A router connection and host API we can drive from the test
const sockets: FakeSocket[] = []

class FakeSocket extends EventEmitter {
	isConnected = true
	sent: string[] = []
	destroyed = false
	constructor() {
		super()
		sockets.push(this)
	}
	send(message: string): boolean {
		this.sent.push(message)
		return true
	}
	destroy(): void {
		this.destroyed = true
	}
	/** Router sends text to the module */
	receive(text: string): void {
		this.emit('data', Buffer.from(text, 'latin1'))
	}
}

vi.mock('@companion-module/base', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@companion-module/base')>()
	class StubInstanceBase {
		log = vi.fn()
		updateStatus = vi.fn()
		setVariableValues = vi.fn()
		setVariableDefinitions = vi.fn()
		setActionDefinitions = vi.fn()
		setFeedbackDefinitions = vi.fn()
		setPresetDefinitions = vi.fn()
		checkFeedbacks = vi.fn()
		checkAllFeedbacks = vi.fn()
	}
	return { ...actual, InstanceBase: StubInstanceBase, TCPHelper: FakeSocket }
})

const { default: ModuleInstance } = await import('../main.js')

const hex = (text: string): string => Buffer.from(text, 'latin1').toString('hex').toUpperCase()

/** Echo the command the module is waiting on, then deliver any replies */
function reply(socket: FakeSocket, echo: string, ...lines: string[]): void {
	socket.receive([echo, ...lines].join('\r\n') + '\r\n')
}

describe('ModuleInstance against a simulated router', () => {
	let module: InstanceType<typeof ModuleInstance>
	let socket: FakeSocket

	beforeEach(async () => {
		vi.useFakeTimers()
		sockets.length = 0
		module = new ModuleInstance({})
		await module.init({ host: '10.0.0.1', port: 23 })
		socket = sockets[0]
		socket.emit('connect')
	})

	afterEach(async () => {
		await module.destroy()
		vi.useRealTimers()
	})

	/** Walk the startup exchange for a 4 output, 8 input router */
	function startUp(): void {
		reply(socket, '@ A?', '@ A:01')
		reply(socket, '@ F? 0', 'F:003F,3F/03,07')
	}

	it('sends one command at a time, waiting for each echo', () => {
		expect(socket.sent).toEqual(['@ A?\r'])
		reply(socket, '@ A?', '@ A:01')
		expect(socket.sent).toEqual(['@ A?\r', '@ F? 0\r'])
	})

	it('learns the router size, then requests crosspoints, names and locks without the leftover level probes', () => {
		// The echo and the F: reply arrive together, so the probe for level 1 is already out when the
		// size is parsed. It is harmless; the other six probes are dropped from the queue.
		startUp()
		expect(module.state.level).toBe('0')
		expect(module.state.dstCount).toBe(4)
		expect(module.state.srcCount).toBe(8)
		expect(module.state.routerId).toBe('01')

		// drain the queue by echoing whatever the module sends next
		const requested: string[] = []
		for (let i = 0; i < 20; i++) {
			const next = socket.sent.at(-1)!.trim()
			if (requested.includes(next)) break
			requested.push(next)
			reply(socket, next)
		}
		expect(requested).toEqual([
			'@ F? 1',
			'@ S?0',
			'@ K?SA,000',
			'@ K?DA,000',
			'@ W?0,00',
			'@ W?0,01',
			'@ W?0,02',
			'@ W?0,03',
		])
	})

	it('defines variables for the ports once the size is known', () => {
		startUp()
		const defs = module.setVariableDefinitions as unknown as ReturnType<typeof vi.fn>
		const latest = defs.mock.calls.at(-1)![0] as Record<string, unknown>
		expect(Object.keys(latest)).toEqual(
			expect.arrayContaining(['id', 'selected_dst_name', 'dst01', 'dst04', 'xpt04', 'dst04_locked', 'src01', 'src08']),
		)
		expect(latest).not.toHaveProperty('dst05')
		expect(latest).not.toHaveProperty('src09')
	})

	it('applies names, routes and locks as they arrive, and rebuilds dropdowns once names settle', () => {
		startUp()
		const actions = module.setActionDefinitions as unknown as ReturnType<typeof vi.fn>
		const before = actions.mock.calls.length

		socket.receive(`K:DA001,${hex('MON1')}\r\nK:SA003,${hex('CAM3')}\r\nS:001,03\r\nW!002,01,1\r\n`)

		expect(module.state.dstName(1)).toBe('MON1')
		expect(module.state.srcName(3)).toBe('CAM3')
		expect(module.state.routes.get(1)).toBe(3)
		expect(module.state.isLocked(2)).toBe(true)
		expect(module.setVariableValues).toHaveBeenCalledWith(expect.objectContaining({ dst02: 'MON1' }))
		expect(module.setVariableValues).toHaveBeenCalledWith(expect.objectContaining({ xpt02: '03' }))
		expect(module.setVariableValues).toHaveBeenCalledWith({ dst03_locked: 1 })

		// rebuilt once, after the debounce, not once per name
		expect(actions.mock.calls.length).toBe(before)
		vi.advanceTimersByTime(150)
		expect(actions.mock.calls.length).toBe(before + 1)
		const setDst = actions.mock.calls.at(-1)![0].setDst
		expect(setDst.options[0].choices[1]).toEqual({ id: '01', label: '2: MON1' })
	})

	it('ignores messages for ports beyond the router size or a different level', () => {
		startUp()
		socket.receive('S:009,01\r\nS:101,01\r\nK:DA0FF,41\r\n')
		expect(module.state.routes.size).toBe(0)
		expect(module.state.dstNames.size).toBe(0)
	})

	it('survives a message split across packets', () => {
		startUp()
		socket.receive('S:00')
		socket.receive('2,05\r\n')
		expect(module.state.routes.get(2)).toBe(5)
	})

	it('cuts the selected source to the selected destination, ahead of the startup reads, then clears the selection', () => {
		startUp()
		module.selectDestination('02')
		module.selectSource('05')
		expect(module.state.hasPair).toBe(true)

		module.routeSelection('cut')
		expect(module.state.hasPair).toBe(false)

		// the command in flight finishes first (the level 1 probe), then the cut, before the S? read queued earlier
		reply(socket, socket.sent.at(-1)!.trim())
		expect(socket.sent.at(-1)).toBe('@ X:0/02,05\r')
	})

	it('keeps operator commands in the order they were issued', () => {
		startUp()
		module.setVideoFormat('04', 'RA', 'SO')
		module.applyVideoFormat()
		reply(socket, socket.sent.at(-1)!.trim())
		expect(socket.sent.at(-1)).toBe('@ UF:04/RA,SO\r')
		reply(socket, '@ UF:04/RA,SO')
		expect(socket.sent.at(-1)).toBe('@ UE:A\r')
	})

	it('refuses to cut without both ends selected', () => {
		startUp()
		module.selectDestination('02')
		module.routeSelection('cut')
		expect(module.log).toHaveBeenCalledWith('warn', expect.stringContaining('Select a destination'))
		expect(module.state.selectedDst).toBe(2)
	})

	it('rejects ports outside the router size', () => {
		startUp()
		module.selectDestination('09')
		expect(module.state.selectedDst).toBeUndefined()
		expect(module.log).toHaveBeenCalledWith('warn', expect.stringContaining('outside'))
	})

	it('only blinks while both a source and destination are selected', () => {
		startUp()
		module.selectDestination('01')
		vi.advanceTimersByTime(1000)
		expect(module.blink).toBe(false)

		module.selectSource('02')
		vi.advanceTimersByTime(500)
		expect(module.blink).toBe(true)
		vi.advanceTimersByTime(500)
		expect(module.blink).toBe(false)
		vi.advanceTimersByTime(500)
		expect(module.blink).toBe(true)

		// selecting a new destination drops the source, which stops the blinking
		module.selectDestination('03')
		expect(module.blink).toBe(false)
		vi.advanceTimersByTime(2000)
		expect(module.blink).toBe(false)
	})

	it('forgets partial input and queued commands when the connection drops and returns', () => {
		startUp()
		socket.receive('S:00')
		socket.emit('status_change', 2, 'lost') // not Ok
		socket.emit('connect')
		expect(socket.sent.at(-1)).toBe('@ A?\r')
		socket.receive('2,05\r\n') // the stale half-line must not combine with this
		expect(module.state.routes.has(2)).toBe(false)
	})

	it('cleans up on destroy', async () => {
		startUp()
		module.selectDestination('01')
		module.selectSource('02')
		await module.destroy()
		expect(socket.destroyed).toBe(true)
		expect(vi.getTimerCount()).toBe(0)
	})
})
