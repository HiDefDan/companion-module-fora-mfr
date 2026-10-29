/**
 * For.A MFR "Crosspoint remote control 2" protocol.
 *
 * Everything on the wire is hex. Router ports are zero based on the wire; this module converts to
 * zero based numbers at the boundary and only ever formats hex when building a command.
 */

export type NameKind = 'src' | 'dst'

export type Message =
	| { type: 'echo' }
	| { type: 'cpu'; id: string }
	| { type: 'systemSize'; level: string; outputs: number; inputs: number }
	| { type: 'crosspoint'; level: string; dst: number; src: number }
	| { type: 'name'; kind: NameKind; index: number; name: string }
	| { type: 'lock'; level: string; dst: number; id: string; mode: number }

/** Number of names the router returns for each `K?` request */
export const NAMES_PER_BLOCK = 32

export function toHex(value: number, width = 2): string {
	return value.toString(16).toUpperCase().padStart(width, '0')
}

/** Parse a hex option value such as '0A'. Returns undefined for anything that is not a hex number. */
export function parseHex(value: unknown): number | undefined {
	if (typeof value !== 'string' || !/^[0-9a-f]{1,3}$/i.test(value.trim())) return undefined
	return parseInt(value, 16)
}

export function decodeName(hex: string): string {
	return Buffer.from(hex, 'hex').toString('latin1').replace(/\0/g, '').trim()
}

export function encodeName(name: string): string {
	return Buffer.from(name, 'latin1').toString('hex')
}

// First recognisable response token on a line. Names are hex, so these can't appear inside the data.
const TOKEN = /(?:[SFAKWCV]:|W!|U[FR]!)/

const RE_CPU = /^A:(\S+)/
const RE_SIZE = /^F:([0-9A-F])[0-9A-F]+,[0-9A-F]+\/([0-9A-F]+),([0-9A-F]+)/i
const RE_XPT = /^S:([0-9A-F])([0-9A-F]+),([0-9A-F]+)/i
const RE_NAME = /^K:([SD])[AK]([0-9A-F]+),([0-9A-F]*)/i
const RE_LOCK = /^W!([0-9A-F])([0-9A-F]+),([^,]+),([0-2])/i

/**
 * Parse one line received from the router into zero or more messages.
 * `pendingCommand` is the command currently awaiting its echo, if any.
 * Lines this module doesn't act on (C:, V:, UF!, UR!, prompts, ...) produce no message.
 *
 * Echoes can carry a prompt in front, and the router may not break the line before the first
 * reply, so an echo is matched by content and anything following it is still parsed.
 */
export function parseLine(line: string, pendingCommand?: string): Message[] {
	let body = line.trim()
	if (!body) return []

	const messages: Message[] = []
	const pending = pendingCommand?.trim()
	if (pending && body.includes(pending)) {
		messages.push({ type: 'echo' })
		body = body.slice(body.indexOf(pending) + pending.length)
	} else if (body.startsWith('@') && !/^@\s*A:/.test(body)) {
		// an echo that doesn't match the pending command; the CPU status reply also starts with '@' but carries data
		return [{ type: 'echo' }]
	}

	const message = parseResponse(body)
	if (message) messages.push(message)
	return messages
}

function parseResponse(text: string): Message | undefined {
	const start = text.search(TOKEN)
	if (start < 0) return undefined
	const body = text.slice(start)

	let m: RegExpExecArray | null
	if ((m = RE_XPT.exec(body))) {
		return { type: 'crosspoint', level: m[1], dst: parseInt(m[2], 16), src: parseInt(m[3], 16) }
	}
	if ((m = RE_NAME.exec(body))) {
		return {
			type: 'name',
			kind: m[1].toUpperCase() === 'S' ? 'src' : 'dst',
			index: parseInt(m[2], 16),
			name: decodeName(m[3]),
		}
	}
	if ((m = RE_LOCK.exec(body))) {
		return { type: 'lock', level: m[1], dst: parseInt(m[2], 16), id: m[3], mode: parseInt(m[4], 10) }
	}
	if ((m = RE_SIZE.exec(body))) {
		// the router reports highest port index, so size is index + 1
		return { type: 'systemSize', level: m[1], outputs: parseInt(m[2], 16) + 1, inputs: parseInt(m[3], 16) + 1 }
	}
	if ((m = RE_CPU.exec(body))) {
		return { type: 'cpu', id: m[1] }
	}
	return undefined
}

/** Splits a TCP byte stream into lines. Messages can span packets, and several can share one. */
export class LineBuffer {
	#pending = ''

	push(chunk: Buffer | string): string[] {
		this.#pending += typeof chunk === 'string' ? chunk : chunk.toString('latin1')
		const parts = this.#pending.split(/\r\n|\n|\r/)
		this.#pending = parts.pop() ?? ''
		// a router that never sends a line break must not grow this without bound
		if (this.#pending.length > 4096) this.#pending = ''
		return parts.filter((line) => line.trim() !== '')
	}

	reset(): void {
		this.#pending = ''
	}
}

/** Command builders. Each returns the command text without the terminator. */
export const Cmd = {
	cpuStatus: (): string => '@ A?',
	systemSize: (level: number): string => `@ F? ${level}`,
	names: (kind: NameKind, offset: number): string => `@ K?${kind === 'src' ? 'S' : 'D'}A,${toHex(offset, 3)}`,
	crosspoints: (level: string): string => `@ S?${level}`,
	lockStatus: (level: string, dst: number): string => `@ W?${level},${toHex(dst)}`,
	cut: (level: string, dst: number, src: number): string => `@ X:${level}/${toHex(dst)},${toHex(src)}`,
	preset: (level: string, dst: number, src: number): string => `@ P:${level}/${toHex(dst)},${toHex(src)}`,
	cutPresets: (): string => '@ B:E',
	setVideoFormat: (format: string, reference: string, point: string): string => `@ UF:${format}/${reference},${point}`,
	applyVideoFormat: (): string => '@ UE:A',
	cancelVideoFormat: (): string => '@ UE:C',
	rename: (kind: NameKind, index: number, name: string): string =>
		`@ K:${kind === 'src' ? 'S' : 'D'}A${toHex(index, 3)},${encodeName(name)}`,
	lock: (level: string, dst: number, routerId: string, mode: string): string =>
		`@ W:${level}/${toHex(dst)},${routerId},${mode}`,
}
