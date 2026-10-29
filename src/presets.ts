import type {
	CompanionButtonStyleProps,
	CompanionPresetDefinitions,
	CompanionPresetSection,
} from '@companion-module/base'
import { BUTTON_PNG_BASE64 } from './button-image.js'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { toHex } from './protocol.js'
import { dstVar, srcVar } from './variables.js'

// Companion swaps this for the connection's label wherever it appears in preset text
const VAR = '$(fora-mfr:'

const baseStyle = (text: string): CompanionButtonStyleProps => ({
	text,
	size: '7',
	color: 0x000000,
	bgcolor: 0xdadada,
	png64: BUTTON_PNG_BASE64,
})

export function UpdatePresets(self: ModuleInstance): void {
	const { state } = self
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}

	presets.cut_xpt = {
		type: 'simple',
		name: 'Cut selected source to selected destination',
		style: baseStyle(`CUT\n${VAR}selected_src_name)\n>\n${VAR}selected_dst_name)`),
		steps: [{ down: [{ actionId: 'switchXpt', options: {} }], up: [] }],
		feedbacks: [],
	}
	presets.preset_xpt = {
		type: 'simple',
		name: 'Preset routing of selected source to selected destination',
		style: baseStyle(`PRESET\n${VAR}selected_src_name)\n>\n${VAR}selected_dst_name)`),
		steps: [{ down: [{ actionId: 'presetXpt', options: {} }], up: [] }],
		feedbacks: [],
	}
	presets.switch_preset_xpts = {
		type: 'simple',
		name: 'Salvo switch preset routes',
		style: baseStyle('CUT\nPRESET\nXPTs'),
		steps: [{ down: [{ actionId: 'switchPresetXpts', options: {} }], up: [] }],
		feedbacks: [],
	}
	presets.preset_video_format = {
		type: 'simple',
		name: 'Set the router video format',
		style: baseStyle('PRESET\nVIDEO\nFORMAT'),
		steps: [
			{
				down: [{ actionId: 'setVideoFormat', options: { format: '04', ref: 'RA', point: 'SO' } }],
				up: [],
			},
		],
		feedbacks: [],
	}
	presets.apply_video_format = {
		type: 'simple',
		name: 'Apply the preset Video Format',
		style: baseStyle('APPLY\nPRESET\nVIDEO\nFORMAT'),
		steps: [{ down: [{ actionId: 'applyVideoFormat', options: {} }], up: [] }],
		feedbacks: [],
	}
	presets.cancel_video_format = {
		type: 'simple',
		name: 'Cancel the preset Video Format',
		style: baseStyle('CANCEL\nPRESET\nVIDEO\nFORMAT'),
		steps: [{ down: [{ actionId: 'cancelVideoFormat', options: {} }], up: [] }],
		feedbacks: [],
	}
	presets.rename_dst = {
		type: 'simple',
		name: 'Rename a destination',
		style: baseStyle('RENAME\nDST'),
		steps: [{ down: [{ actionId: 'renameDst', options: { dst: '00', name: 'new name' } }], up: [] }],
		feedbacks: [],
	}
	presets.rename_src = {
		type: 'simple',
		name: 'Rename a source',
		style: baseStyle('RENAME\nSRC'),
		steps: [{ down: [{ actionId: 'renameSrc', options: { src: '00', name: 'new name' } }], up: [] }],
		feedbacks: [],
	}
	presets.lock_dst = {
		type: 'simple',
		name: 'Lock / unlock a destination',
		style: baseStyle('(UN)LOCK\nDST'),
		steps: [{ down: [{ actionId: 'lockDst', options: { dst: '00', mode: '0' } }], up: [] }],
		feedbacks: [],
	}

	const dstIds: string[] = []
	for (let i = 0; i < state.dstCount; i++) {
		const id = `dst_${i}`
		const port = toHex(i)
		dstIds.push(id)
		presets[id] = {
			type: 'simple',
			name: `Dest ${i + 1}`,
			style: { ...baseStyle(`${VAR}${dstVar(i)})`), size: '14', bgcolor: 0x808000 },
			steps: [{ down: [{ actionId: 'setDst', options: { dst: port } }], up: [] }],
			feedbacks: [
				{ feedbackId: 'RoutedDestination', options: { dst: port }, style: { bgcolor: 0xffff00, color: 0x000000 } },
				{ feedbackId: 'SelectedDestination', options: { dst: port }, style: { bgcolor: 0xffff00, color: 0x000000 } },
				{ feedbackId: 'LockedDestination', options: { dst: port }, style: { bgcolor: 0xff0000, color: 0x000000 } },
			],
		}
	}

	const srcIds: string[] = []
	for (let i = 0; i < state.srcCount; i++) {
		const id = `src_${i}`
		const port = toHex(i)
		srcIds.push(id)
		presets[id] = {
			type: 'simple',
			name: `Src ${i + 1}`,
			style: { ...baseStyle(`${VAR}${srcVar(i)})`), size: '14', bgcolor: 0x008000 },
			steps: [{ down: [{ actionId: 'setSrc', options: { src: port } }], up: [] }],
			feedbacks: [
				{ feedbackId: 'RoutedSource', options: { src: port }, style: { bgcolor: 0x00ff00, color: 0x000000 } },
				{ feedbackId: 'SelectedSource', options: { src: port }, style: { bgcolor: 0x00ff00, color: 0x000000 } },
			],
		}
	}

	const structure: CompanionPresetSection<ModuleSchema>[] = [
		{
			id: 'control',
			name: 'Control',
			definitions: [
				{
					id: 'switching',
					type: 'simple',
					name: 'Switching',
					presets: ['cut_xpt', 'preset_xpt', 'switch_preset_xpts', 'lock_dst'],
				},
				{
					id: 'video_format',
					type: 'simple',
					name: 'Video format',
					presets: ['preset_video_format', 'apply_video_format', 'cancel_video_format'],
				},
				{ id: 'naming', type: 'simple', name: 'Naming', presets: ['rename_dst', 'rename_src'] },
			],
		},
		{
			id: 'destinations',
			name: 'Destinations',
			definitions: [{ id: 'destinations', type: 'simple', name: 'Destinations', presets: dstIds }],
		},
		{
			id: 'sources',
			name: 'Sources',
			definitions: [{ id: 'sources', type: 'simple', name: 'Sources', presets: srcIds }],
		},
	]

	self.setPresetDefinitions(structure, presets)
}
