/**
 * Sends commands one at a time. The MFR asks clients to wait for the echo of each command
 * before sending the next, so the next command is released on echo, or after `timeoutMs`
 * if the echo never arrives (echo is a router port setting and may be off).
 */
export class CommandQueue {
	readonly #send: (command: string) => boolean
	readonly #timeoutMs: number
	readonly #maxLength: number
	/** Operator commands, always sent ahead of the bulk reads in `#queue` */
	#urgent: string[] = []
	#queue: string[] = []
	#inFlight: string | undefined
	#timer: ReturnType<typeof setTimeout> | undefined

	constructor(send: (command: string) => boolean, timeoutMs = 500, maxLength = 1024) {
		this.#send = send
		this.#timeoutMs = timeoutMs
		this.#maxLength = maxLength
	}

	/** The command currently waiting for its echo */
	get pending(): string | undefined {
		return this.#inFlight
	}

	/**
	 * Returns false if the queue is full and the command was dropped.
	 * `urgent` commands go ahead of everything not urgent, keeping their order among themselves.
	 */
	enqueue(command: string, urgent = false): boolean {
		if (this.#urgent.length + this.#queue.length >= this.#maxLength) return false
		;(urgent ? this.#urgent : this.#queue).push(command)
		if (this.#inFlight === undefined) this.#next()
		return true
	}

	/** Call when the router's echo for the pending command has been seen */
	acknowledge(): void {
		if (this.#inFlight === undefined) return
		this.#inFlight = undefined
		this.#clearTimer()
		this.#next()
	}

	/** Remove commands that haven't been sent yet and match `predicate` */
	drop(predicate: (command: string) => boolean): void {
		this.#queue = this.#queue.filter((command) => !predicate(command))
	}

	/** Drop everything, e.g. when the connection is lost */
	clear(): void {
		this.#urgent = []
		this.#queue = []
		this.#inFlight = undefined
		this.#clearTimer()
	}

	#next(): void {
		const command = this.#urgent.shift() ?? this.#queue.shift()
		if (command === undefined) return
		this.#inFlight = command
		this.#timer = setTimeout(() => this.acknowledge(), this.#timeoutMs)
		if (!this.#send(command)) {
			// not connected: nothing will ever be echoed
			this.clear()
		}
	}

	#clearTimer(): void {
		if (this.#timer) clearTimeout(this.#timer)
		this.#timer = undefined
	}
}
