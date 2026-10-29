import {
	LOCK_MODES,
	REFERENCES,
	SWITCHING_POINTS,
	VIDEO_FORMATS,
	destinationChoices,
	sourceChoices,
} from './choices.js'
import type ModuleInstance from './main.js'

type NoOptions = Record<string, never>

export type ActionsSchema = {
	setDst: { options: { dst: string } }
	setSrc: { options: { src: string } }
	switchXpt: { options: NoOptions }
	presetXpt: { options: NoOptions }
	switchPresetXpts: { options: NoOptions }
	setVideoFormat: { options: { format: string; ref: string; point: string } }
	applyVideoFormat: { options: NoOptions }
	cancelVideoFormat: { options: NoOptions }
	renameDst: { options: { dst: string; name: string } }
	renameSrc: { options: { src: string; name: string } }
	lockDst: { options: { dst: string; mode: string } }
}

export function UpdateActions(self: ModuleInstance): void {
	const dst = destinationChoices(self.state)
	const src = sourceChoices(self.state)

	self.setActionDefinitions({
		setDst: {
			name: 'Set destination',
			options: [{ type: 'dropdown', id: 'dst', label: 'Select destination :', default: '00', choices: dst }],
			callback: (action) => self.selectDestination(action.options.dst),
		},
		setSrc: {
			name: 'Set source',
			options: [{ type: 'dropdown', id: 'src', label: 'Select source :', default: '00', choices: src }],
			callback: (action) => self.selectSource(action.options.src),
		},
		switchXpt: {
			name: 'Cut selected source to selected destination',
			options: [],
			callback: () => self.routeSelection('cut'),
		},
		presetXpt: {
			name: 'Preset selected source to selected destination',
			options: [],
			callback: () => self.routeSelection('preset'),
		},
		switchPresetXpts: {
			name: 'Switch preset crosspoint(s)',
			options: [],
			callback: () => self.cutPresets(),
		},
		setVideoFormat: {
			name: 'Preset video format',
			options: [
				{ type: 'dropdown', id: 'format', label: 'Set video format :', default: '00', choices: VIDEO_FORMATS },
				{ type: 'dropdown', id: 'ref', label: 'Set reference type :', default: 'RA', choices: REFERENCES },
				{ type: 'dropdown', id: 'point', label: 'Set switching point :', default: 'SF', choices: SWITCHING_POINTS },
			],
			callback: (action) => self.setVideoFormat(action.options.format, action.options.ref, action.options.point),
		},
		applyVideoFormat: {
			name: 'Apply preset video format',
			options: [],
			callback: () => self.applyVideoFormat(),
		},
		cancelVideoFormat: {
			name: 'Cancel preset video format',
			options: [],
			callback: () => self.cancelVideoFormat(),
		},
		renameDst: {
			name: 'Rename a destination',
			options: [
				{ type: 'dropdown', id: 'dst', label: 'Select destination :', default: '00', choices: dst },
				{ type: 'textinput', id: 'name', label: 'New name', default: 'New name' },
			],
			callback: (action) => self.rename('dst', action.options.dst, action.options.name),
		},
		renameSrc: {
			name: 'Rename a source',
			options: [
				{ type: 'dropdown', id: 'src', label: 'Select source :', default: '00', choices: src },
				{ type: 'textinput', id: 'name', label: 'New name', default: 'New name' },
			],
			callback: (action) => self.rename('src', action.options.src, action.options.name),
		},
		lockDst: {
			name: 'Lock/Unlock a destination',
			options: [
				{ type: 'dropdown', id: 'dst', label: 'Destination :', default: '00', choices: dst },
				{ type: 'dropdown', id: 'mode', label: 'Lock mode :', default: '0', choices: LOCK_MODES },
			],
			callback: (action) => self.lockDestination(action.options.dst, action.options.mode),
		},
	})
}
