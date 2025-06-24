import amqp, { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager'
import chalk from 'chalk'

/**
 * Configuration options for connecting to an AMQP broker and defining queue bindings.
 *
 * @property urls - Optional array of AMQP connection URLs for failover or clustering.
 * @property hosts - List of hostnames or IP addresses for the AMQP brokers.
 * @property defaultUrl - The default AMQP connection URL to use.
 * @property bindings - Array of binding configurations, each specifying a queue and optional exchange, topic, and headers.
 *   @property bindings[].queue - Name of the queue to bind.
 *   @property bindings[].exchange - (Optional) Name of the exchange to bind the queue to.
 *   @property bindings[].topic - (Optional) Topic or list of topics for routing messages.
 *   @property bindings[].headers - (Optional) Headers for advanced routing or filtering.
 */
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

/**
 * Optional settings such as a custom logger.
 *
 * @property {(level: string, ...args: any[]) => void} [log]
 */
type AMQPOpts = {
	log?: (level: string, ...args: any[]) => void
}

export default class CxAMQP {
	#config: AMQPConfig
	#connections: Record<string, AmqpConnectionManager> = {}
	#channels: Record<string, ChannelWrapper> = {}
	#opts: AMQPOpts = {}
	#started: Promise<void>
	#resolveStarted!: () => void

	/**
	 * Initializes CxAMQP with the given configuration and options.
	 * @param {AMQPConfig} config - AMQP connection and binding configuration.
	 * @param {AMQPOpts} [opts={}] - Optional settings such as a custom logger.
	 * @throws {Error} If no config is provided.
	 */
	constructor(config: AMQPConfig, opts: AMQPOpts = {}) {
		this.#started = new Promise<void>((resolve) => {
			this.#resolveStarted = resolve
		});
		this.#opts = opts
		if (!config) throw new Error('cxAMQP configuration is required')
		this.#config = JSON.parse(JSON.stringify(config))
		this.start()
	}

	/**
	 * Establishes connections and channels for all configured hosts and URLs.
	 * @returns {Promise<void>} Resolves once all channels are up.
	 */
	async start(): Promise<void> {
		if (this.#config.urls) {
			this.#config.urls.forEach(url => {
				this.#connections[url] = amqp.connect([url])
			})
		}

		const channelsStarted = this.#config.hosts.map(host => {
			const url = this.#config.defaultUrl.replace('{host}', host)
			this.#connections[host] = amqp.connect([url], { connectionOptions: { timeout: 5000 }, heartbeatIntervalInSeconds: 60, reconnectTimeInSeconds: 60 })
			const redactedUrl = this.#redactPassword(url)
			this.#log('INFO', `Connecting to AMQP server at ${redactedUrl}`)
			this.#connections[host].on('connect', () => {
				this.#log('INFO', `Connected to AMQP server at ${redactedUrl}`)
			})
			this.#connections[host].on('connectFailed', () => {
				this.#log('ERROR', `Failed to connect to AMQP server at ${redactedUrl}`)
			})
			this.#connections[host].on('disconnect', (params: any) => {
				this.#log('ERROR', `Disconnected from AMQP server at ${redactedUrl}`, params)
			})
			this.#connections[host].on('blocked', (err: any) => {
				this.#log('ERROR', `AMQP server at ${redactedUrl} is blocked`, err)
			})
			this.#connections[host].on('unblocked', () => {
				this.#log('INFO', `AMQP server at ${redactedUrl} is unblocked`)
			})
			return new Promise(resolve => {
				this.#connections[host].createChannel({
					json: true,
					setup: async (channel: any) => {
						this.#channels[host] = channel
						resolve(true);
						return true
					}
				})
			});
		})
		await Promise.all(channelsStarted)
		this.#log('INFO', 'All AMQP channels started successfully')
		this.#resolveStarted();
	}

	/**
	 * Sends a message to a queue or exchange.
	 * @param {string} queue - Queue name (prefix with `#` to publish to an exchange).
	 * @param {any} data - Payload to send.
	 * @param {string|null} [connectionName] - Specific connection identifier.
	 * @param {string} [routingKey] - Routing key when publishing to an exchange.
	 * @param {Record<string, any>} [opts={}] - Additional publish options.
	 * @returns {Promise<void>}
	 * @throws {Error} If no channel is available.
	 */
	async send(
		queue: string,
		data: any,
		connectionName?: string | null,
		routingKey?: string,
		opts: Record<string, any> = {}
	): Promise<void> {
		await this.#started // Ensure the AMQP connection is established before sending
		let channel = connectionName && this.#channels[connectionName]
		if (!channel) channel = Object.values(this.#channels)[0]

		if (!channel) throw new Error('No channel available to send message')

		const json = Buffer.from(JSON.stringify(data))

		if (queue.startsWith('#')) {
			await channel.publish(queue.substring(1), routingKey ?? '', json, opts)
		} else {
			await channel.sendToQueue(queue, json)
		}
	}

	/**
	 * Starts consuming messages from the given queue.
	 * @param {string} queue - Queue to consume from.
	 * @param {(content: any, msg: any) => Promise<void>|void} handler - Function to process each message.
	 * @returns {Promise<void>}
	 */
	async consume(
		queue: string,
		handler: (content: any, msg: any) => Promise<void> | void
	): Promise<void> {
		Object.entries(this.#connections).forEach(([connectionName, connection]) => {
			this.#log('INFO', `Consuming from queue ${queue} on connection ${connectionName}`)
			connection.createChannel({
				json: true,
				setup: async (channel: any) => {
					// channel.consume(queue, (msg: any) => this.#consumeMsg(connection, channel, queue, handler, msg), { noAck: false })
					// this.setupBindings(channel, queue)

					// Fixed method call to match the #consumeMsg signature which expects (channel, handler, msg)
					// The connection and queue parameters were removed from consumeMsg method signature
					// because they are not used in the method implementation (see commented parameters in method definition)
					channel.consume(queue, (msg: any) => this.#consumeMsg(channel, handler, msg), { noAck: false })
					this.setupBindings(channel, queue)

				}
			})
		})
	}

	/**
	 * Asserts exchanges and binds the queue based on configuration.
	 * @param {any} channel - Channel instance.
	 * @param {string} queueName - Queue to bind.
	 * @returns {Promise<void>}
	 */
	async setupBindings(channel: any, queueName: string): Promise<void> {
		for (const binding of this.#config.bindings) {
			if (binding.queue !== queueName) continue
			const type = binding.topic ? 'topic' : 'headers'
			const exchange = binding.exchange || (type === 'topic' && 'amq.topic') || 'amq.headers'
			this.#log('INFO', `Asserting Exchange ${exchange} with type ${type}`)
			await channel.assertExchange(exchange, type, { durable: true })
			if (type === 'topic') {
				const topics = Array.isArray(binding.topic) ? binding.topic : [binding.topic]
				for (const topic of topics) {
					await channel.bindQueue(queueName, exchange, topic)
					this.#log('INFO',`Binding exchange ${exchange} to topic ${topic} with queue ${queueName}`)
				}
			} else if (type === 'headers' && binding.headers) {
				this.#log('INFO',`Binding exchange ${exchange} to headers ${JSON.stringify(binding.headers)} with queue ${queueName}`)
				await channel.bindQueue(queueName, exchange, '', binding.headers)
				return
			} else {
				console.error(chalk.red(`Unsupported binding type: ${type}`))
			}
		}
	}

	/**
	 * Handles an incoming message: parses JSON, calls handler, and acks/nacks.
	 * @param {any} channel - Channel for ack/nack.
	 * @param {(content: any, msg: any) => Promise<void>|void} handler - Business logic.
	 * @param {any} msg - Raw AMQP message.
	 * @returns {Promise<boolean|void>} True if processed.
	 */
	async #consumeMsg(
		channel: any,
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
			this.#log('WARN', `Failed to parse message as JSON content: ${msg.content}`)
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

	/**
	 * Redacts password from an AMQP URL for safe logging.
	 * @param {string} str - URL string.
	 * @returns {string} URL with password replaced by `***`.
	 */
	#redactPassword(str: string): string {
		if (typeof str !== 'string') return str
		return str.replace(/(amqp:\/\/)([^:]+):([^@]+)@/g, '$1$2:***@')
	}

	/**
	 * Logs messages via the custom logger or console with colored output.
	 * @param {string} level - Log level (`'info'|'warn'|'error'`).
	 * @param {...any} args - Items to log.
	 */
	#log (level: string, ...args: any[]): void {
		if (this.#opts.log && typeof this.#opts.log === 'function') {
			this.#opts.log(level, ...args)
		} else {
			const color = level === 'error' ? chalk.red : level === 'warn' ? chalk.yellow : chalk.green
			console.log(color(`[${level.toUpperCase()}]`, ...args))
		}
	}
}
