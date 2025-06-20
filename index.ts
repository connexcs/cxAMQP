import amqp, { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager'
import chalk from 'chalk'

type AMQPConfig = {
	urls?: string[]
	hosts: string[]
	defaultUrl: string
	bindings: Array<{
		queue: string
		exchange?: string
		topic?: string | string[]
		headers?: Record<string, any>
	}>
	// queue?: { push?: string[] } // Uncomment if needed
}

type AMQPOpts = {
	log?: (level: string, ...args: any[]) => void
}

export default class CxAMQP {
	#config: AMQPConfig
	#connections: Record<string, AmqpConnectionManager> = {}
	#channels: Record<string, ChannelWrapper> = {}
	#opts: AMQPOpts = {}

	constructor(config: AMQPConfig, opts: AMQPOpts = {}) {
		this.#opts = opts
		if (!config) throw new Error('cxAMQP configuration is required')
		this.#config = JSON.parse(JSON.stringify(config))
		this.start()
	}

	async start(): Promise<void> {
		if (this.#config.urls) {
			this.#config.urls.forEach(url => {
				this.#connections[url] = amqp.connect([url])
			})
		}

		this.#config.hosts.forEach(host => {
			const url = this.#config.defaultUrl.replace('{host}', host)
			this.#connections[host] = amqp.connect([url], { connectionOptions: { timeout: 5000 }, heartbeatIntervalInSeconds: 60, reconnectTimeInSeconds: 60 })
			const redactedUrl = this.redactPassword(url)
			console.log(chalk.green(`Connecting to AMQP server at ${redactedUrl}`))
			this.#connections[host].on('connect', () => {
				console.log(chalk.green(`Connected to AMQP server at ${redactedUrl}`))
			})
			this.#connections[host].on('connectFailed', () => {
				console.error(chalk.red(`Failed to connect to AMQP server at ${redactedUrl}`))
			})
			this.#connections[host].on('disconnect', (params: any) => {
				console.error(chalk.red(`Disconnected from AMQP server at ${redactedUrl}`), params)
			})
			this.#connections[host].on('blocked', (err: any) => {
				console.error(chalk.red(`AMQP server at ${redactedUrl} is blocked`, err))
			})
			this.#connections[host].on('unblocked', () => {
				console.log(chalk.green(`AMQP server at ${redactedUrl} is unblocked`))
			})

			this.#connections[host].createChannel({
				json: true,
				setup: async (channel: any) => {
					this.#channels[host] = channel
					return true
				}
			})
		})
	}

	async send(queue: string, data: any, connectionName: string | null = null): Promise<void> {
		let channel = connectionName && this.#channels[connectionName]
		if (!channel) channel = Object.values(this.#channels)[0]
		const json = Buffer.from(JSON.stringify(data))

		if (queue.startsWith('#')) {
			await channel.publish(queue.substring(1), json.toString(), { persistent: true })
		} else {
			await channel.sendToQueue(queue, json)
		}
	}

	async consume(queue: string, handler: (content: any, msg: any) => Promise<void> | void): Promise<void> {
		Object.entries(this.#connections).forEach(([connectionName, connection]) => {
			console.log(chalk.green(`Consuming from queue ${queue} on connection ${connectionName}`))
			connection.createChannel({
				json: true,
				setup: async (channel: any) => {
					// channel.consume(queue, (msg: any) => this.consumeMsg(connection, channel, queue, handler, msg), { noAck: false })
					// this.setupBindings(channel, queue)

					// Fixed method call to match the consumeMsg signature which expects (channel, handler, msg)
					// The connection and queue parameters were removed from consumeMsg method signature
					// because they are not used in the method implementation (see commented parameters in method definition)
					channel.consume(queue, (msg: any) => this.consumeMsg(channel, handler, msg), { noAck: false })
					this.setupBindings(channel, queue)

				}
			})
		})
	}

	async setupBindings(channel: any, queueName: string): Promise<void> {
		for (const binding of this.#config.bindings) {
			if (binding.queue !== queueName) continue
			const type = binding.topic ? 'topic' : 'headers'
			const exchange = binding.exchange || (type === 'topic' && 'amq.topic') || 'amq.headers'
			console.log(chalk.green(`Asserting Exchange ${exchange} with type ${type}`))
			await channel.assertExchange(exchange, type, { durable: true })
			if (type === 'topic') {
				const topics = Array.isArray(binding.topic) ? binding.topic : [binding.topic]
				for (const topic of topics) {
					await channel.bindQueue(queueName, exchange, topic)
					console.log(chalk.green(`Binding exchange ${exchange} to topic ${topic} with queue ${queueName}`))
				}
			} else if (type === 'headers' && binding.headers) {
				console.log(chalk.green(`Binding exchange ${exchange} to headers ${JSON.stringify(binding.headers)} with queue ${queueName}`))
				await channel.bindQueue(queueName, exchange, '', binding.headers)
				return
			} else {
				console.error(chalk.red(`Unsupported binding type: ${type}`))
			}
		}
	}

	async consumeMsg(
		// connection: AmqpConnectionManager, never used - you might want to remove this parameter
		channel: any,
		// queue: string, never used - you might want to remove this parameter
		handler: (content: any, msg: any) => Promise<void> | void,
		msg: any
	): Promise<boolean | void> {
		if (msg === null) return

		let content: any = msg.content.toString()
		try {
			if (content.startsWith('{') || content.startsWith('[')) {
				content = JSON.parse(content)
			}
		} catch (error) {
			console.warn(chalk.yellow(`Failed to parse message as JSON content: ${msg.content}`))
		}

		try {
			let content = msg.content.toString()
			if (content.startsWith('{') || content.startsWith('[')) {
				content = JSON.parse(content)
			}
			await handler(content, msg)
			channel.ack(msg)
		} catch (error) {
			console.error(chalk.red('Error processing message:', error))
			channel.nack(msg, false, false) // Do not requeue
		}

		return true
	}

	async startServerChannel(connection: AmqpConnectionManager): Promise<void> {
		(connection as any).channel = connection.createChannel({
			json: true,
			// setup: async function (channel: any) { // here channel is also never used, this needs to be removed
			setup: async function () { // here channel is also never used, this needs to be removed
				return true
			}
		})
	}

	redactPassword(str: string): string {
		if (typeof str !== 'string') return str
		return str.replace(/(amqp:\/\/)([^:]+):([^@]+)@/g, '$1$2:***@')
	}

	log (level: string, ...args: any[]): void {
		if (this.#opts.log && typeof this.#opts.log === 'function') {
			this.#opts.log(level, ...args)
		} else {
			const color = level === 'error' ? chalk.red : level === 'warn' ? chalk.yellow : chalk.green
			console.log(color(`[${level.toUpperCase()}]`, ...args))
		}
	}
}
