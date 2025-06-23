import { describe, it, expect } from 'vitest'
import CxAMQP from '../index'
import { readFileSync } from 'fs'
import toml from 'toml'
const configRaw = toml.parse(readFileSync('./config.toml', 'utf-8'))
const config = configRaw.cxAMQP

const cxAMQP = new CxAMQP(config);

describe('CxAMQP', () => {
	it('should be defined', () => {
		expect(CxAMQP).toBeDefined()
	})

	it('should have config', () => {
		expect(config).toBeDefined()
		expect(config.hosts).toBeDefined()
		expect(config.defaultUrl).toBeDefined()
		expect(config.bindings).toBeDefined()
		expect(Array.isArray(config.bindings)).toBe(true)

	})

	it ('should perform a send/receive circuit test', async () => {
		const queueName = 'test'
		const message = { text: 'Hello, cxAMQP!' }

		// Assuming cxAMQP has a method to listen to a queue
		await cxAMQP.consume(queueName, (msg) => {
			expect(msg).toEqual(message)
		})

		// Assuming cxAMQP has a method to send a message to a queue
		await cxAMQP.send(queueName, message)
	})

	it ('should bind to test-topic on amq.topic', async () => {
		const queueName = 'test-topic'
		const message = { text: 'Hello, cxAMQP Topic!' }

		// Assuming cxAMQP has a method to listen to a queue
		await cxAMQP.consume(queueName, (msg) => {
			expect(msg).toEqual(message)
		})

		// Assuming cxAMQP has a method to send a message to a queue
		await cxAMQP.send('#amq.topic', message, null, 'test-topic')
	})

	it ('should bind to test-headers on amq.headers', async () => {
		const queueName = 'test-headers'
		const message = { text: 'Hello, cxAMQP Headers!' }

		// Assuming cxAMQP has a method to listen to a queue
		await cxAMQP.consume(queueName, (msg) => {
			expect(msg).toEqual(message)
		})

		// Assuming cxAMQP has a method to send a message to a queue
		await cxAMQP.send('#amq.headers', message, null, '', { headers: {hello: 'world'} })
	})
})