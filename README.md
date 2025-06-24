# cxAMQP

cxAMQP is a small wrapper around amqp-connection-manager which is a wrapper around amqplib.

## Topology

This library is quite opinionated in its use.

It is designed to be used with multiple standalone AMQP Servers

- Use Multiple Standalone Servers
- Pulls from ALL queues
- Push to single server in priority order.
- Send automatically encodes to JSON.
- Consuming attempts to decode JSON.
- Handles reconnects and servers ofline.
- Simple config

## Alternatives

- Rascal: We have used this in the past and it is a very comprehensive library. We decided to stop using this because of the complexity.
- amqplib - Great low-level functionality, but too much re-used code needs to be written for our use case.


# Example

```javascript
import CxAMQP from 'cx-amqp'
import { readFileSync } from 'fs'
import toml from 'toml'
const configRaw = toml.parse(readFileSync('./config.toml', 'utf-8'))
const config = configRaw.cxAMQP

const queueName = 'test'
const message = { text: 'Hello, cxAMQP!' }

const queueName = 'test'

// Receive Message
await cxAMQP.consume(queueName, (data, msg) => {
    // For simple usage data contains the JSON decoded payload, msg accesses the full underlying message from amqplib
    console.log(data, msg)
})

// Send to a queue (to the first connected amqp broker)
await cxAMQP.send(queueName, {hello: 'World'})

// Send to a queue on a specific broker
await cxAMQP.send(queueName, {hello: 'World'}, 'test1')

// Send to an exchange with a topic
await cxAMQP.send('#amq.topic', {hello: 'World'}, null, 'test-topic')

//Send to an exchange with headers
await cxAMQP.send('#amq.headers', {hello: 'World'}, null, '', { headers: {headerKey: 'headerValue'} })
```

# API Documentation

[API Documentation](docs/classes/default.md)