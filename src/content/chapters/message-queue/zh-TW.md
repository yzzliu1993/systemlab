---
id: message-queue
title: 訊息佇列
summary: 先快速收下工作，稍後再處理，並在出錯時確保不會遺失。
---

## @situation

想像一個很忙的公家機關櫃台。你走進去，抽一張號碼牌，只花一秒鐘。接著你坐下來等。

櫃台人員依序叫號。你不必一直站在窗口前，看別人處理你的案件。

訊息佇列在軟體裡做的就是這件事。一個部分交出請求，馬上得到回覆。另一個部分用自己的速度，稍後再做事。

接著想想哪裡會出問題。人潮可能比櫃台處理得快。櫃台人員可能收了你的文件就離開。一件怪案子可能卡住一位人員好幾個小時。本章其餘部分就在談這些問題。

## @terms

這些工具都提供某種形式的佇列或訊息日誌。

- [Amazon SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-queue-types.html)
- [RabbitMQ](https://www.rabbitmq.com/docs/confirms)
- [Apache Kafka](https://kafka.apache.org/intro)
- [Google Cloud Pub/Sub](https://docs.cloud.google.com/pubsub/docs/lease-management)
- [Azure Service Bus](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues)

Kafka 有點不同。它保存的是一份日誌，許多讀取者可以各自從自己的位置往下讀。一般的待辦佇列則是把每一項交給一位工作者，之後就不再保留。

### 訊息佇列（Message Queue）

請求在這裡依序排隊，等工作者有空再處理。寄送方不必等工作做完。

### 生產者（Producer）

建立訊息並放進佇列的一方，就像抽號碼牌的人。

### 消費者（Consumer）

從佇列取出訊息並做事的一方，就像叫下一號的櫃台人員。

### 確認（ack）

消費者回報工作已完成的簡短回覆，英文是 Acknowledgement。佇列在收到確認之前，不會把訊息視為已完成。

### 可見性逾時（Visibility timeout）

消費者取走訊息後，佇列會在一段時間內把它對其他人隱藏。如果這段時間內沒有收到確認，訊息就會重新出現，別的消費者可能會取走它。

### 至少一次送達（At-least-once delivery）

保證每則訊息會送達一次或多次。訊息不會遺失，但可能出現兩次。

### 冪等性（Idempotency）

同一件事做兩次，結果和做一次相同。這讓重複的訊息變得無害。

### 死信佇列（Dead-letter queue）

專門放一直失敗的訊息的旁支佇列。嘗試達到設定次數後，訊息會移到這裡，不再擋住其他訊息。

### 積壓（Backlog）

還在佇列裡等待的訊息。如果工作進來的速度比消費者做完的速度快，積壓就會變多。

## @how

下方的模擬畫面左邊是生產者，中間是佇列，右邊是消費者。每位消費者手上都有正在處理的訊息，我們稱為處理中的訊息。

統計數字包括積壓量、最舊訊息的存在時間、已處理數、重新送達數、重複數，以及進入死信佇列的數量。

你可以試試：

- 增加消費者，看積壓縮小。
- 縮短可見性逾時，看重新送達和重複出現。
- 開啟冪等性，看重複不再造成傷害。

## @practice

- Slack 在資料庫變慢、Redis 記憶體被塞滿之後，把 Kafka 放在 Redis 工作佇列前面當緩衝。[Scaling Slack's job queue](https://slack.engineering/scaling-slacks-job-queue/)
- Uber 把失敗的訊息移到重試主題和死信佇列，而不是讓一次失敗擋住其他訊息。[Uber reliable reprocessing](https://www.uber.com/blog/reliable-reprocessing/)
- Uber 做了消費者代理，讓有問題的毒訊息不會卡住整個分區。[Uber consumer proxy](https://www.uber.com/blog/kafka-async-queuing-with-consumer-proxy/)
- Stripe 用冪等金鑰，讓用戶端可以安全地重試請求。這是 API 的例子，不是佇列，但概念相同。[Stripe idempotency](https://stripe.com/blog/idempotency)
- SQS 標準佇列至少送達一次，所以消費者應該具備冪等性。[SQS at-least-once delivery](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html)
- 如果訊息在確認期限前沒有被確認，Pub/Sub 會再送一次。[Pub/Sub lease management](https://docs.cloud.google.com/pubsub/docs/lease-management)

## @extreme

在模擬中執行這些預設情境，並留意統計數字。

- 流量暴增：留意積壓和最舊訊息的存在時間。積壓只有在消費者有餘力時才會消化完，而且舊訊息等到被處理時可能已經沒用了。[Avoiding insurmountable queue backlogs](https://builder.aws.com/content/3EuRcgkTP1MI0c7zM8W6HL3WIqA/avoiding-insurmountable-queue-backlogs)
- 消費者變慢：留意積壓和重新送達。重試會替本來就很慢的系統增加更多負載。[Timeouts, retries, and backoff with jitter](https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter)
- 逾時比處理時間短：留意重新送達和重複。第一位消費者還在處理時，訊息就又出現了。[SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html) 與 [Pub/Sub lease management](https://docs.cloud.google.com/pubsub/docs/lease-management)
- 毒訊息：留意同一則訊息一再失敗。死信佇列會把它隔開。[SQS dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)、[Azure Service Bus dead-letter queues](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues) 與 [Uber reliable reprocessing](https://www.uber.com/blog/reliable-reprocessing/)

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

這是最精簡的範例。完整選項請見 [SQS dead-letter queue docs](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)。

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
