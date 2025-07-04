import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.spec.ts'],
		coverage: {
			reporter: ['text', 'lcov'],
			include: ['*.ts'],
			exclude: ['**/*.d.ts', 'tests/**']
		}
	}
})
