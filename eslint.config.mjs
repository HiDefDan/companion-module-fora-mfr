import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({
	enableTypescript: true,
})

export default [
	...baseConfig,
	{
		// tests may import dev dependencies
		files: ['src/**/__tests__/**/*.ts'],
		rules: {
			'n/no-unpublished-import': 'off',
			'@typescript-eslint/unbound-method': 'off', // asserting on mocks
		},
	},
]
