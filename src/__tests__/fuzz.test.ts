/**
 * Fuzz-style tests for the line splitter and parser, driven by a small seeded generator so every
 * failure can be replayed: the seed is in the assertion message.
 */
import { isDeepStrictEqual } from 'node:util'
import { describe, expect, it } from 'vitest'
import { Cmd, LineBuffer, PROMPT, parseLine, type Message } from '../protocol.js'

/** mulberry32: small, fast and good enough to drive a fuzzer */
function generator(seed: number) {
	let a = seed >>> 0
	const next = (): number => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	const int = (max: number): number => Math.floor(next() * max)
	const pick = <T>(items: readonly T[]): T => items[int(items.length)]
	const chance = (p: number): boolean => next() < p
	return { next, int, pick, chance }
}
type Random = ReturnType<typeof generator>

/** `expect` is slow in a tight loop, so only call it to report a mismatch */
function same(actual: unknown, expected: unknown, context: string): void {
	if (!isDeepStrictEqual(actual, expected)) expect(actual, context).toEqual(expected)
}

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1)
const hex = (value: number): string => value.toString(16).toUpperCase()
const pad = (value: number, width: number): string => hex(value).padStart(width, '0')

/** Split `text` into random pieces, sometimes as strings and sometimes as Buffers */
function chunks(rand: Random, text: string): (string | Buffer)[] {
	const pieces: (string | Buffer)[] = []
	let at = 0
	while (at < text.length) {
		const size = rand.chance(0.3) ? 1 : 1 + rand.int(12)
		const piece = text.slice(at, at + size)
		pieces.push(rand.chance(0.5) ? piece : Buffer.from(piece, 'latin1'))
		at += size
	}
	return pieces
}

function pushAll(buffer: LineBuffer, pieces: (string | Buffer)[]): string[] {
	return pieces.flatMap((piece) => buffer.push(piece))
}

/** A printable name with no spaces at either end, as decodeName would return it */
function randomName(rand: Random): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -_/#.()'
	let name = ''
	for (let i = 0, n = 1 + rand.int(16); i < n; i++) name += rand.pick([...chars])
	return name.trim() || 'X'
}

/** A message and the line a router would send for it */
function randomReply(rand: Random): { line: string; message: Message } {
	const level = String(rand.int(8))
	const dst = rand.int(1024)
	const src = rand.int(1024)
	switch (rand.int(7)) {
		case 0:
			return { line: `S:${level}${hex(dst)},${hex(src)}`, message: { type: 'crosspoint', level, dst, src } }
		case 1:
			return { line: `V:${level}${hex(dst)},${hex(src)}`, message: { type: 'preset', level, dst, src } }
		case 2: {
			const id = rand.pick(['0', '1', '15', 'A', '3F'])
			const mode = id === '0' ? 0 : 1 + rand.int(2)
			return { line: `W!${level}${hex(dst)},${id},${mode}`, message: { type: 'lock', level, dst, id, mode } }
		}
		case 3: {
			const kind = rand.pick(['src', 'dst'] as const)
			const name = randomName(rand)
			const data = Buffer.from(name, 'latin1').toString('hex').toUpperCase()
			return {
				line: `K:${kind === 'src' ? 'S' : 'D'}${rand.pick(['A', 'K'])}${pad(dst, 3)},${data}`,
				message: { type: 'name', kind, index: dst, name },
			}
		}
		case 4: {
			const outputs = 1 + rand.int(256)
			const inputs = 1 + rand.int(256)
			const dims = `${pad(outputs - 1, 2)},${pad(inputs - 1, 2)}`
			return { line: `F:${level}${dims}/${dims}`, message: { type: 'systemSize', level, outputs, inputs } }
		}
		case 5: {
			const id = pad(rand.int(256), 2)
			return { line: `A:${id}`, message: { type: 'cpu', id } }
		}
		default: {
			const [detail, event] = rand.pick([
				['W', 'waiting'],
				['C', 'cancelled'],
				['E', 'rejected'],
				['04/RA,SO', 'applied'],
			] as const)
			if (rand.chance(0.3)) return { line: `UF!${detail}`, message: { type: 'videoFormat', event: 'preset', detail } }
			return { line: `UR!${detail}`, message: { type: 'videoFormat', event, detail } }
		}
	}
}

function randomCommand(rand: Random): string {
	const level = String(rand.int(8))
	const dst = rand.int(256)
	const src = rand.int(256)
	return rand.pick([
		() => Cmd.cpuStatus(),
		() => Cmd.systemSize(rand.int(8)),
		() => Cmd.names(rand.pick(['src', 'dst'] as const), rand.int(8) * 32),
		() => Cmd.crosspoints(level),
		() => Cmd.lockStatus(level, dst),
		() => Cmd.cut(level, dst, src),
		() => Cmd.preset(level, dst, src),
		() => Cmd.presetStatus(level),
		() => Cmd.clearPresets(),
		() => Cmd.cutPresets(),
		() => Cmd.setVideoFormat('04', 'RA', 'SO'),
		() => Cmd.applyVideoFormat(),
		() => Cmd.rename(rand.pick(['src', 'dst'] as const), dst, randomName(rand)),
		() => Cmd.lock(level, dst, '15', String(rand.int(3))),
	])()
}

/** Anything at all, weighted towards the characters the protocol cares about */
function randomText(rand: Random, length: number): string {
	const alphabet = ['\r', '\n', '>', '@', ' ', ':', ',', '/', '!', '?', 'S', 'V', 'W', 'K', 'F', 'A', 'U', 'C', 'X']
	let text = ''
	for (let i = 0; i < length; i++) {
		if (rand.chance(0.6)) text += rand.pick(alphabet)
		else if (rand.chance(0.7)) text += rand.pick([...'0123456789ABCDEFabcdef'])
		else text += String.fromCharCode(rand.int(256))
	}
	return text
}

function isWellFormed(message: Message): boolean {
	const port = (n: number): boolean => Number.isSafeInteger(n) && n >= 0
	const level = (l: string): boolean => /^[0-9A-F]$/i.test(l)
	switch (message.type) {
		case 'prompt':
			return true
		case 'crosspoint':
		case 'preset':
			return level(message.level) && port(message.dst) && port(message.src)
		case 'lock':
			return level(message.level) && port(message.dst) && [0, 1, 2].includes(message.mode) && message.id !== ''
		case 'name':
			return port(message.index) && !message.name.includes('\0') && message.name === message.name.trim()
		case 'systemSize':
			return level(message.level) && message.outputs >= 1 && message.inputs >= 1
		case 'cpu':
			return message.id.length > 0 && !/\s/.test(message.id)
		case 'videoFormat':
			return ['preset', 'waiting', 'applied', 'cancelled', 'rejected'].includes(message.event)
	}
}

describe('LineBuffer, fuzzed', () => {
	it('gives the same lines however the stream is cut into packets', () => {
		for (const seed of SEEDS) {
			const rand = generator(seed)
			const text = randomText(rand, rand.int(400))
			const whole = new LineBuffer().push(text)
			const pieces = pushAll(new LineBuffer(), chunks(rand, text))
			const bytes = pushAll(new LineBuffer(), [...text])
			expect(pieces, `seed ${seed}`).toEqual(whole)
			expect(bytes, `seed ${seed}`).toEqual(whole)
		}
	})

	it('recovers every line and prompt of a router transcript, however it is cut', () => {
		const separators = ['\r', '\n', '\r\n', '\r\r\n', '\r\n\r\n']
		for (const seed of SEEDS) {
			const rand = generator(seed)
			const expected: string[] = []
			let text = ''
			let afterPrompt = false
			for (let i = 0, n = 1 + rand.int(30); i < n; i++) {
				if (!afterPrompt && rand.chance(0.25)) {
					// the prompt has no line break after it; whatever comes next shares its line
					text += PROMPT
					expected.push(PROMPT)
					afterPrompt = true
					continue
				}
				const line = rand.chance(0.3) ? randomCommand(rand) : randomReply(rand).line
				text += line + rand.pick(separators)
				expected.push(line)
				afterPrompt = false
			}
			expect(pushAll(new LineBuffer(), chunks(rand, text)), `seed ${seed}`).toEqual(expected)
		}
	})

	it('drops a partial line on reset', () => {
		for (const seed of SEEDS.slice(0, 50)) {
			const rand = generator(seed)
			const buffer = new LineBuffer()
			buffer.push(randomText(rand, rand.int(50)).replace(/[\r\n]/g, ''))
			buffer.reset()
			const { line } = randomReply(rand)
			expect(buffer.push(`${line}\r\n`), `seed ${seed}`).toEqual([line])
		}
	})
})

describe('parseLine, fuzzed', () => {
	it('reads back every reply the router can send, with or without the echo in front', () => {
		for (const seed of SEEDS) {
			const rand = generator(seed)
			for (let i = 0; i < 20; i++) {
				const { line, message } = randomReply(rand)
				const pending = randomCommand(rand)
				same(parseLine(line, pending), message, `seed ${seed}: ${line}`)
				same(parseLine(line), message, `seed ${seed}: ${line}`)
				same(parseLine(`  ${line} `, pending), message, `seed ${seed}: ${line}`)
				// a router that doesn't break the line between the echo and the reply
				same(parseLine(`${pending}${line}`, pending), message, `seed ${seed}: ${pending}${line}`)
			}
		}
	})

	it('never takes an echo for a reply, pending or not', () => {
		for (const seed of SEEDS) {
			const rand = generator(seed)
			for (let i = 0; i < 20; i++) {
				const command = randomCommand(rand)
				same(parseLine(command, command), undefined, `seed ${seed}: ${command}`)
				same(parseLine(command), undefined, `seed ${seed}: ${command}`)
				same(parseLine(command, randomCommand(rand)), undefined, `seed ${seed}: ${command}`)
			}
		}
	})

	it('reads the prompt, and only a bare prompt, as the prompt', () => {
		for (const seed of SEEDS) {
			const rand = generator(seed)
			expect(parseLine(PROMPT, randomCommand(rand))).toEqual({ type: 'prompt' })
			const { line } = randomReply(rand)
			expect(parseLine(`${line}>`)?.type, `seed ${seed}: ${line}>`).not.toBe('prompt')
		}
	})

	it('survives anything, and whatever it returns is well formed', () => {
		for (const seed of SEEDS) {
			const rand = generator(seed)
			for (let i = 0; i < 50; i++) {
				const text = randomText(rand, rand.int(60))
				const pending = rand.chance(0.5) ? randomCommand(rand) : undefined
				const context = `seed ${seed}: ${JSON.stringify(text)}`
				// a throw fails the test with the seed in the message
				let message: Message | undefined
				try {
					message = parseLine(text, pending)
				} catch (err) {
					expect.fail(`${context} threw ${String(err)}`)
				}
				if (message && !isWellFormed(message)) expect(message, context).toBe('well formed')
				// surrounding whitespace never changes the result
				same(parseLine(` ${text}\t`, pending), message, context)
			}
		}
	})

	it('reads a whole transcript through LineBuffer into the messages that made it', () => {
		for (const seed of SEEDS) {
			const rand = generator(seed)
			const expected: (Message | 'prompt')[] = []
			const commands: string[] = []
			let text = ''
			for (let exchange = 0, n = 1 + rand.int(8); exchange < n; exchange++) {
				const command = randomCommand(rand)
				commands.push(command)
				const replies = Array.from({ length: rand.int(4) }, () => randomReply(rand))
				if (replies.length && rand.chance(0.3)) {
					// as F? does: the first reply after a single CR
					text += `${command}\r${replies.map((r) => r.line).join('\r\n\r\n')}\r\r\n>`
				} else {
					text += `${command}\r\r\n${replies.map((r) => `${r.line}\r\n\r\n`).join('')}>`
				}
				expected.push(...replies.map((r) => r.message), 'prompt')
				// as after X: and B:E, the router may push more straight after the prompt
				if (rand.chance(0.3)) {
					const pushed = randomReply(rand)
					text += `\r\n${pushed.line}\r\n`
					expected.push(pushed.message)
				}
			}

			const buffer = new LineBuffer()
			const got: (Message | 'prompt')[] = []
			let pending: string | undefined = commands.shift()
			for (const piece of chunks(rand, text)) {
				for (const line of buffer.push(piece)) {
					const message = parseLine(line, pending)
					if (message?.type === 'prompt') {
						got.push('prompt')
						pending = commands.shift()
					} else if (message) got.push(message)
				}
			}
			expect(got, `seed ${seed}`).toEqual(expected)
		}
	})
})
