import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
	pollInterval?: number
	autoRoute?: 'off' | 'cut' | 'preset'
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Information',
			value:
				'Connects to a For.A MFR routing switcher. In the router web interface set the TCP/IP "Default Function" to ' +
				'"Crosspoint remote control 2" and enable the Echo, C and S responses.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'MFR IP',
			width: 6,
			regex: Regex.IP,
		},
		{
			type: 'number',
			id: 'port',
			label: 'MFR Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 23,
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Refresh routes from the router every (seconds, 0 = never)',
			width: 6,
			min: 0,
			max: 3600,
			default: 5,
		},
		{
			type: 'dropdown',
			id: 'autoRoute',
			label: 'When a destination and a source are both selected',
			width: 12,
			default: 'off',
			choices: [
				{ id: 'off', label: 'Wait for the cut or preset button' },
				{ id: 'cut', label: 'Cut straight away' },
				{ id: 'preset', label: 'Stage a preset straight away (build a salvo, then take it)' },
			],
		},
	]
}
