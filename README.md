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