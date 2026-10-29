import { destinationChoices, sourceChoices } from './choices.js'
import type ModuleInstance from './main.js'
import { parseHex } from './protocol.js'

export const SELECTION_FEEDBACKS = [
	'SelectedSource',
	'SelectedDestination',
	'RoutedSource',
	'RoutedDestination',
] as const

export type FeedbacksSchema = {
	SelectedSource: { type: 'boolean'; options: { src: string } }
	SelectedDestination: { type: 'boolean'; options: { dst: string } }
	RoutedSource: { type: 'boolean'; options: { src: string } }
	RoutedDestination: { type: 'boolean'; options: { dst: string } }
	LockedDestination: { type: 'boolean'; options: { dst: string } }
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const dst = destinationChoices(self.state)
	const src = sourceChoices(self.state)
	const { state } = self

	self.setFeedbackDefinitions({
		SelectedSource: {
			name: 'Show selected source',
			type: 'boolean',
			description: 'If this source is selected the button will be highlighted irrespective of routing',
			defaultStyle: { bgcolor: 0x00ff00, color: 0x000000 },
			options: [{ type: 'dropdown', id: 'src', label: 'Source :', default: '00', choices: src }],
			callback: (feedback) => {
				const port = parseHex(feedback.options.src)
				return port !== undefined && state.isSrcSelected(port, self.blink)
			},
		},
		SelectedDestination: {
			name: 'Show selected destination',
			type: 'boolean',
			description: 'If this destination is selected the button will be highlighted irrespective of routing',
			defaultStyle: { bgcolor: 0xff0000, color: 0x000000 },
			options: [{ type: 'dropdown', id: 'dst', label: 'Destination :', default: '00', choices: dst }],
			callback: (feedback) => {
				const port = parseHex(feedback.options.dst)
				return port !== undefined && state.isDstSelected(port, self.blink)
			},
		},
		RoutedSource: {
			name: 'Routed source',
			type: 'boolean',
			description: 'True if this source is routed to the selected destination',
			defaultStyle: { bgcolor: 0x00ff00, color: 0x000000 },
			options: [{ type: 'dropdown', id: 'src', label: 'Source :', default: '00', choices: src }],
			callback: (feedback) => {
				const port = parseHex(feedback.options.src)
				return port !== undefined && state.isRoutedSrc(port)
			},
		},
		RoutedDestination: {
			name: 'Routed destination',
			type: 'boolean',
			description: 'True if the selected source is routed to this destination',
			defaultStyle: { bgcolor: 0xff0000, color: 0x000000 },
			options: [{ type: 'dropdown', id: 'dst', label: 'Destination :', default: '00', choices: dst }],
			callback: (feedback) => {
				const port = parseHex(feedback.options.dst)
				return port !== undefined && state.isRoutedDst(port)
			},
		},
		LockedDestination: {
			name: 'Locked destination',
			type: 'boolean',
			description: 'True if this destination is locked',
			defaultStyle: { bgcolor: 0x800000, color: 0x000000 },
			options: [{ type: 'dropdown', id: 'dst', label: 'Destination :', default: '00', choices: dst }],
			callback: (feedback) => {
				const port = parseHex(feedback.options.dst)
				return port !== undefined && state.isLocked(port)
			},
		},
	})
}
