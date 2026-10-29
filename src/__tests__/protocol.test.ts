import { describe, expect, it } from 'vitest'
import { Cmd, LineBuffer, decodeName, encodeName, parseHex, parseLine, toHex } from '../protocol.js'

describe('hex helpers', () => {
	it('formats upper case, zero padded', () => {
		expect(toHex(10)).toBe('0A')
		expect(toHex(255)).toBe('FF')
		expect(toHex(5, 3)).toBe('005')
	})

	it('parses hex option values and rejects junk', () => {
		expect(parseHex('0a')).toBe(10)
		expect(parseHex('FF')).toBe(255)
		expect(parseHex('')).toBeUndefined()
		expect(parseHex('zz')).toBeUndefined()
		expect(parseHex(5)).toBeUndefined()
		expect(parseHex(undefined)).toBeUndefined()
	})

	it('round trips names, trimming padding', () => {
		expect(decodeName('43414D31')).toBe('CAM1')
		expect(decodeName('43414D312020')).toBe('CAM1')
		expect(decodeName('43414D310000')).toBe('CAM1')
		expect(decodeName(encodeName('Studio A'))).toBe('Studio A')
	})
})

describe('parseLine', () => {
	it('parses a crosspoint response', () => {
		expect(parseLine('S:00B,05')).toEqual([{ type: 'crosspoint', level: '0', dst: 11, src: 5 }])
	})

	it('tolerates trailing carriage returns and whitespace', () => {
		expect(parseLine('S:001,0A\r ')).toEqual([{ type: 'crosspoint', level: '0', dst: 1, src: 10 }])
	})

	it('parses system size as highest index + 1', () => {
		expect(parseLine('F:03F,3F/0F,1F')).toEqual([{ type: 'systemSize', level: '0', outputs: 16, inputs: 32 }])
	})

	it('parses source and destination names', () => {
		expect(parseLine('K:DA005,43414D31')).toEqual([{ type: 'name', kind: 'dst', index: 5, name: 'CAM1' }])
		expect(parseLine('K:SA0FF,56545231')).toEqual([{ type: 'name', kind: 'src', index: 255, name: 'VTR1' }])
	})

	it('does not mistake a name containing A: or S: for another message', () => {
		// "A:" and "S:" can't appear in hex data, but make sure the name branch wins for a K line
		const result = parseLine('K:DA005,413A53')
		expect(result).toEqual([{ type: 'name', kind: 'dst', index: 5, name: 'A:S' }])
	})

	it('parses lock status', () => {
		expect(parseLine('W!005,01,1')).toEqual([{ type: 'lock', level: '0', dst: 5, id: '01', mode: 1 }])
		expect(parseLine('W!00A,01,0')).toEqual([{ type: 'lock', level: '0', dst: 10, id: '01', mode: 0 }])
	})

	it('parses the CPU status reply even though it starts with @', () => {
		expect(parseLine('@ A:01')).toEqual([{ type: 'cpu', id: '01' }])
	})

	it('recognises the echo of the pending command', () => {
		expect(parseLine('@ S?0', '@ S?0')).toEqual([{ type: 'echo' }])
		expect(parseLine('> @ S?0', '@ S?0')).toEqual([{ type: 'echo' }])
	})

	it('recognises an echo that does not match the pending command', () => {
		expect(parseLine('@ F? 3')).toEqual([{ type: 'echo' }])
	})

	it('keeps a reply that follows an echo on the same line', () => {
		expect(parseLine('@ A?@ A:01', '@ A?')).toEqual([{ type: 'echo' }, { type: 'cpu', id: '01' }])
	})

	it('ignores responses it does not act on', () => {
		expect(parseLine('')).toEqual([])
		expect(parseLine('   ')).toEqual([])
		expect(parseLine('>')).toEqual([])
		expect(parseLine('C:0/001,002:I01')).toEqual([])
		expect(parseLine('V:001,002')).toEqual([])
		expect(parseLine('UR!C')).toEqual([])
	})
})

describe('LineBuffer', () => {
	it('splits several messages in one packet', () => {
		const buffer = new LineBuffer()
		expect(buffer.push('S:001,01\r\nS:002,02\r\n')).toEqual(['S:001,01', 'S:002,02'])
	})

	it('joins a message split across packets', () => {
		const buffer = new LineBuffer()
		expect(buffer.push('S:00')).toEqual([])
		expect(buffer.push('1,0')).toEqual([])
		expect(buffer.push(Buffer.from('1\r\nS:002'))).toEqual(['S:001,01'])
		expect(buffer.push('\r\n')).toEqual(['S:002'])
	})

	it('accepts CR, LF and CRLF terminators and drops blank lines', () => {
		const buffer = new LineBuffer()
		expect(buffer.push('a\rb\nc\r\n\r\n')).toEqual(['a', 'b', 'c'])
	})

	it('forgets a partial line on reset, so a dropped connection cannot corrupt the next', () => {
		const buffer = new LineBuffer()
		buffer.push('S:00')
		buffer.reset()
		expect(buffer.push('S:001,01\r\n')).toEqual(['S:001,01'])
	})

	it('does not grow without bound if the router never breaks a line', () => {
		const buffer = new LineBuffer()
		buffer.push('x'.repeat(5000))
		expect(buffer.push('S:001,01\n')).toEqual(['S:001,01'])
	})
})

describe('command builders', () => {
	it('matches the documented command formats', () => {
		expect(Cmd.cpuStatus()).toBe('@ A?')
		expect(Cmd.systemSize(3)).toBe('@ F? 3')
		expect(Cmd.names('src', 64)).toBe('@ K?SA,040')
		expect(Cmd.names('dst', 0)).toBe('@ K?DA,000')
		expect(Cmd.crosspoints('0')).toBe('@ S?0')
		expect(Cmd.lockStatus('0', 11)).toBe('@ W?0,0B')
		expect(Cmd.cut('0', 11, 5)).toBe('@ X:0/0B,05')
		expect(Cmd.preset('0', 1, 255)).toBe('@ P:0/01,FF')
		expect(Cmd.cutPresets()).toBe('@ B:E')
		expect(Cmd.setVideoFormat('04', 'RA', 'SO')).toBe('@ UF:04/RA,SO')
		expect(Cmd.applyVideoFormat()).toBe('@ UE:A')
		expect(Cmd.cancelVideoFormat()).toBe('@ UE:C')
		expect(Cmd.rename('dst', 5, 'CAM1')).toBe('@ K:DA005,43414d31')
		expect(Cmd.lock('0', 5, '01', '1')).toBe('@ W:0/05,01,1')
	})
})
