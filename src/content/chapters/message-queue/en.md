---
id: message-queue
title: Message queue
summary: Accept work fast, do it later, and keep it safe when things go wrong.
---

## @situation

Picture a busy government counter. You walk in and take a numbered ticket. It takes a second. Then you sit down and wait.

The clerks call numbers one by one. You did not have to stand at a window while someone worked on your case.

A message queue does the same job for software. One part hands over a request and gets an answer right away. Another part does the work later, at its own speed.

Now ask what goes wrong. The crowd may grow faster than the clerks can serve. A clerk may take your papers and then leave. One strange case may block a clerk for hours. The rest of this chapter is about those problems.

## @terms

These tools all offer some form of queue or message log.

- [Amazon SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-queue-types.html)
- [RabbitMQ](https://www.rabbitmq.com/docs/confirms)
- [Apache Kafka](https://kafka.apache.org/intro)
- [Google Cloud Pub/Sub](https://docs.cloud.google.com/pubsub/docs/lease-management)
- [Azure Service Bus](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues)

Kafka is a little different. It keeps a log, and many readers can each read it at their own position. A plain to-do queue hands each item to one worker and then forgets it.

### Message Queue

A place where requests wait in order until a worker is ready. The sender does not wait for the work to finish.

### Producer

The part that creates messages and puts them in the queue. It is the person taking a ticket.

### Consumer

The part that takes messages from the queue and does the work. It is the clerk calling the next number.

### Acknowledgement (ack)

A short reply from the consumer that says the work is done. Until the queue sees an ack, it does not treat the message as finished.

### Visibility timeout

After a consumer takes a message, the queue hides it from others for a set time. If no ack arrives in that time, the message becomes visible again and someone else may take it.

### At-least-once delivery

A promise that each message arrives one or more times. It will not be lost, but it may show up twice.

### Idempotency

Doing the same work twice gives the same result as doing it once. It makes repeated messages harmless.

### Dead-letter queue

A side queue for messages that keep failing. After a set number of tries, the message moves there so it stops blocking the others.

### Backlog

The messages waiting in the queue. If work arrives faster than consumers finish it, the backlog grows.

## @how

The simulation below shows producers on the left, the queue in the middle, and consumers on the right. Each consumer holds the messages it is working on. We call them in-flight messages.

The stats show the backlog, the age of the oldest message, how many messages were processed, how many were redelivered, how many were duplicates, and how many went to the dead-letter queue.

Try these:

- Add consumers and watch the backlog shrink.
- Shorten the visibility timeout and watch redeliveries and duplicates appear.
- Turn idempotency on and see that duplicates no longer cause harm.

## @practice

- Slack put Kafka in front of its Redis job queue as a buffer, after a database slowdown filled up Redis memory. [Scaling Slack's job queue](https://slack.engineering/scaling-slacks-job-queue/)
- Uber moved failed messages to retry topics and a dead-letter queue, instead of letting one failure block the rest. [Uber reliable reprocessing](https://www.uber.com/blog/reliable-reprocessing/)
- Uber built a consumer proxy so that poison messages do not block a whole partition. [Uber consumer proxy](https://www.uber.com/blog/kafka-async-queuing-with-consumer-proxy/)
- Stripe uses idempotency keys so clients can retry a request safely. This is an API example, not a queue, but the idea is the same. [Stripe idempotency](https://stripe.com/blog/idempotency)
- SQS standard queues deliver at least once, so consumers should be idempotent. [SQS at-least-once delivery](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html)
- Pub/Sub sends a message again if it is not acknowledged before the ack deadline. [Pub/Sub lease management](https://docs.cloud.google.com/pubsub/docs/lease-management)

## @extreme

Run these presets in the simulation and watch the stats.

- Traffic burst: watch the backlog and the oldest message age. A backlog drains only if consumers have spare capacity, and old messages may be useless by the time they are served. [Avoiding insurmountable queue backlogs](https://builder.aws.com/content/3EuRcgkTP1MI0c7zM8W6HL3WIqA/avoiding-insurmountable-queue-backlogs)
- Slow consumers: watch the backlog and redeliveries. Retries add more load to a system that is already slow. [Timeouts, retries, and backoff with jitter](https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter)
- Timeout shorter than processing: watch redeliveries and duplicates. The message reappears while the first consumer is still working. [SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html) and [Pub/Sub lease management](https://docs.cloud.google.com/pubsub/docs/lease-management)
- Poison message: watch one message fail again and again. A dead-letter queue sets it aside. [SQS dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html), [Azure Service Bus dead-letter queues](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues) and [Uber reliable reprocessing](https://www.uber.com/blog/reliable-reprocessing/)

## @config

```yaml
Resources:
  JobsDeadLetterQueue:
    Type: AWS::SQS::Queue
  JobsQueue:
    Type: AWS::SQS::Queue
    Properties:
      VisibilityTimeout: 60
      RedrivePolicy:
        deadLetterTargetArn: !GetAtt JobsDeadLetterQueue.Arn
        maxReceiveCount: 5
```

This is a minimal example. See the [SQS dead-letter queue docs](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html) for the full options.

## @sources

- [Amazon SQS queue types](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-queue-types.html)
- [SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html)
- [SQS dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)
- [SQS at-least-once delivery](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html)
- [RabbitMQ confirms](https://www.rabbitmq.com/docs/confirms)
- [Apache Kafka introduction](https://kafka.apache.org/intro)
- [Pub/Sub lease management](https://docs.cloud.google.com/pubsub/docs/lease-management)
- [Azure Service Bus dead-letter queues](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues)
- [Scaling Slack's job queue](https://slack.engineering/scaling-slacks-job-queue/)
- [Uber reliable reprocessing](https://www.uber.com/blog/reliable-reprocessing/)
- [Uber consumer proxy](https://www.uber.com/blog/kafka-async-queuing-with-consumer-proxy/)
- [Stripe idempotency](https://stripe.com/blog/idempotency)
- [Avoiding insurmountable queue backlogs](https://builder.aws.com/content/3EuRcgkTP1MI0c7zM8W6HL3WIqA/avoiding-insurmountable-queue-backlogs)
- [Timeouts, retries, and backoff with jitter](https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter)
