[**cx-amqp**](../README.md)

***

[cx-amqp](../README.md) / default

# Class: default

Defined in: [index.ts:38](https://github.com/connexcs/cxAMQP/blob/001617f60b627ecde71d26d0cf507726398295d2/index.ts#L38)

## Constructors

### Constructor

> **new default**(`config`, `opts?`): `CxAMQP`

Defined in: [index.ts:52](https://github.com/connexcs/cxAMQP/blob/001617f60b627ecde71d26d0cf507726398295d2/index.ts#L52)

Initializes CxAMQP with the given configuration and options.

#### Parameters

##### config

`AMQPConfig`

AMQP connection and binding configuration.

##### opts?

`AMQPOpts` = `{}`

Optional settings such as a custom logger.

#### Returns

`CxAMQP`

#### Throws

If no config is provided.

## Methods

### consume()

> **consume**(`queue`, `handler`): `Promise`\<`void`\>

Defined in: [index.ts:147](https://github.com/connexcs/cxAMQP/blob/001617f60b627ecde71d26d0cf507726398295d2/index.ts#L147)

Starts consuming messages from the given queue.

#### Parameters

##### queue

`string`

Queue to consume from.

##### handler

(`content`, `msg`) => `void` \| `Promise`\<`void`\>

Function to process each message.

#### Returns

`Promise`\<`void`\>

***

### send()

> **send**(`queue`, `data`, `connectionName?`, `routingKey?`, `opts?`): `Promise`\<`void`\>

Defined in: [index.ts:119](https://github.com/connexcs/cxAMQP/blob/001617f60b627ecde71d26d0cf507726398295d2/index.ts#L119)

Sends a message to a queue or exchange.

#### Parameters

##### queue

`string`

Queue name (prefix with `#` to publish to an exchange).

##### data

`any`

Payload to send.

##### connectionName?

Specific connection identifier.

`null` | `string`

##### routingKey?

`string`

Routing key when publishing to an exchange.

##### opts?

`Record`\<`string`, `any`\> = `{}`

Additional publish options.

#### Returns

`Promise`\<`void`\>

#### Throws

If no channel is available.

***

### setupBindings()

> **setupBindings**(`channel`, `queueName`): `Promise`\<`void`\>

Defined in: [index.ts:176](https://github.com/connexcs/cxAMQP/blob/001617f60b627ecde71d26d0cf507726398295d2/index.ts#L176)

Asserts exchanges and binds the queue based on configuration.

#### Parameters

##### channel

`any`

Channel instance.

##### queueName

`string`

Queue to bind.

#### Returns

`Promise`\<`void`\>

***

### start()

> **start**(): `Promise`\<`void`\>

Defined in: [index.ts:66](https://github.com/connexcs/cxAMQP/blob/001617f60b627ecde71d26d0cf507726398295d2/index.ts#L66)

Establishes connections and channels for all configured hosts and URLs.

#### Returns

`Promise`\<`void`\>

Resolves once all channels are up.
