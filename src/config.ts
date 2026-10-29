import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
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
	]
}
