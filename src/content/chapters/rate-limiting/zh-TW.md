---
id: rate-limiting
title: 限流
summary: 請求太多時，系統如何說「慢一點」，讓自己不被壓垮。
---

## @situation

遊樂園的一項設施，每分鐘只讓固定人數上場。設施前有一小塊等候區。等候區滿了，工作人員就請後來的人晚點再來。設施照常運轉，入口也不會擠成一團。

## @terms

有很多工具可以限制請求。下面這幾個很適合先查。

- [Nginx limit_req](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)：Nginx 網頁伺服器的模組，限制請求進來的速度。
- [Amazon API Gateway throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html)：替你放在那裡的 API 設定速率與突發上限。
- [Envoy rate limiting](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/other_features/global_rate_limiting)：Envoy 代理可以問一個共用的限流服務，這個請求能不能放行。
- [Google Cloud Armor rate limiting](https://docs.cloud.google.com/armor/docs/rate-limiting-overview)：用規則節流或封鎖用戶端，例如依 IP 位址。

公開的 API 也是很好的學習材料。[GitHub](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)、[Stripe](https://docs.stripe.com/rate-limits)、[Shopify](https://shopify.dev/docs/api/usage/rate-limits) 和 [Discord](https://docs.discord.com/developers/topics/rate-limits) 都公開了自己的限制，以及回報這些限制的回應標頭。

各家對「桶」的叫法並不一致。Nginx 稱它的限流器是漏桶（leaky bucket）。API Gateway 稱它的限流器是令牌桶（token bucket）。相信名字之前，先讀各工具自己的文件。

### 限流（Rate limiting）

一條規則，限制用戶端在一段時間內最多能送多少請求。超過的請求會被拒絕或延後。它讓伺服器不會被請求淹沒。

### 令牌桶（Token bucket）

桶子以固定速度補進新令牌，最多補到上限。每個請求拿走一個令牌。桶子空了，請求就被拒絕。桶子滿的時候，可以讓一小波突發流量通過。

### 漏桶（Leaky bucket）

請求掉進桶子，再以固定速度流出，像水從小洞漏出去。桶子滿了，新的請求就溢出並被拒絕。就算進來的流量不平均，出去的流量也很平穩。

### 固定窗口（Fixed window）

把時間切成固定的段落來計數，例如每一分鐘。計數超過上限，就拒絕其餘請求，直到下一段開始。做法簡單，但用戶端可以在一段的尾端送滿額，又在下一段的開頭再送滿額。

### 滑動窗口（Sliding window）

計算最近一段時間內的請求數，這段時間會隨時鐘往前移。這樣可以避開兩個固定窗口之間的明顯斷層。有些系統為了省記憶體，只用幾個計數器來估算它。

### 突發流量（Burst）

短時間內突然湧入的一大堆請求。限流器通常會刻意容許一些突發流量，因為真實的流量不會完全平均。

### 429 請求過多（429 Too Many Requests）

HTTP 狀態碼，表示用戶端送了太多請求。它定義在 [RFC 6585](https://www.rfc-editor.org/rfc/rfc6585.html)。有些工具在同樣的情況會用別的狀態碼，所以要看你用的工具。

### Retry-After

HTTP 標頭，告訴用戶端要等多久才能再試。它定義在 [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)。429 的回應可以帶上它，但不一定要帶。

### 退避加抖動（Backoff with jitter）

請求失敗後，用戶端每試一次就等得更久，而且在等待時間上再加一點隨機值。越來越長的等待讓重試慢下來。隨機值則避免很多用戶端在同一刻一起重試。

### 降載（Load shedding）

伺服器過載時，刻意且提早丟掉一部分工作。這樣它接下來的工作才能維持快速。它看的是伺服器自己的狀況，不管請求是誰送的。

### 併發上限（Concurrency limit）

限制同一時間有多少請求正在處理，而不是每秒進來多少。請求變慢時，能同時處理的就變少，所以這個上限會跟著伺服器的真實狀態調整。

## @how

下面的模擬有三個部分。用戶端送出請求。限流器決定哪些可以通過。伺服器透過佇列處理被接受的請求。你會看到這些數字：接受、拒絕、降載、重試和延遲。

拒絕是指限流器說不行。降載是指伺服器因為過載而放棄某個請求。重試是用戶端再試了幾次。延遲是被接受的請求等了多久。

可以試試：

- 把請求速率調到高於上限，看拒絕數增加，而延遲維持不變。
- 打開重試，看它如何在原有的流量之上再加一層負載。
- 改變突發大小，看一次有多少請求能通過。

## @practice

- Stripe 使用好幾種限流器，也有降載機制，並建議限流器自己壞掉時要選擇放行（fail open）。見 [Stripe 談限流器](https://stripe.com/blog/rate-limiters)。
- Cloudflare 用兩個計數器來估算滑動窗口，而不是把每個請求都存起來。見 [Cloudflare 談計數](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)。
- Figma 把計數器放在 Redis，並對濫用者使用影子封鎖（shadow ban）。見 [Figma 談限流](https://www.figma.com/blog/an-alternative-approach-to-rate-limiting)。
- Netflix 主張限制同時進行的請求數，而不是固定速率，並提供了相關的函式庫。見 [Netflix concurrency-limits](https://github.com/Netflix/concurrency-limits)。
- GitHub 會送出限流標頭，並要求用戶端遵守 retry-after 並做退避。狀態碼可能是 403 或 429。見 [GitHub REST API 限流](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)。
- Discord 回應 429 時會附上 Retry-After。見 [Discord 限流](https://docs.discord.com/developers/topics/rate-limits)。
- Shopify 給每個應用程式各自一個桶子。見 [Shopify API 限流](https://shopify.dev/docs/api/usage/rate-limits)。

## @extreme

在模擬裡選一個預設，或自己調整數值。每一個都會用不同方式把系統推到極限。

- 突發流量大於桶子：一次送出的量超過桶子能裝的。多出來的請求被拒絕。Amazon API Gateway 超過突發上限時會回 429，Nginx 也會拒絕超過突發額度的請求。見 [API Gateway throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html) 和 [Nginx limit_req](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)。
- 吵鬧的用戶端：某個用戶端送的量遠超過其他人。只有一個共用上限時，它會餓死別人。每個用戶端各自限流就能解決，例如 [API Gateway 使用計畫](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html)，以及可以依用戶端分組計數的 [Cloud Armor 限流](https://docs.cloud.google.com/armor/docs/rate-limiting-overview)。
- 重試風暴：被拒絕的用戶端馬上重試，讓負載成倍增加。重試需要退避加抖動。見 [AWS 談逾時、重試與退避加抖動](https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter) 和 [Google SRE 談連鎖失效](https://sre.google/sre-book/addressing-cascading-failures/)。
- 降載開與關：開著降載時，伺服器提早丟掉工作，延遲保持在範圍內。關掉時，佇列越排越長，大家都在等。見 [AWS 談降載](https://builder.aws.com/content/3Eun1EEyX6p2e3VYNyRLSJzLuMV/using-load-shedding-to-avoid-overload) 和 [Google SRE 談連鎖失效](https://sre.google/sre-book/addressing-cascading-failures/)。Envoy 的[斷路機制](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/circuit_breaking)也會限制等待中的請求數，並快速失敗。

## @config

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

server {
  location /api/ {
    limit_req zone=api burst=20 nodelay;
    limit_req_status 429;
  }
}
```

這只是最小的範例。它把每個用戶端位址限制在固定速率，加上一點突發額度，超過就回 429。所有選項請見 [Nginx limit_req 文件](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)。

## @sources

- [Nginx ngx_http_limit_req_module](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)
- [Amazon API Gateway request throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html)
- [Envoy global rate limiting](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/other_features/global_rate_limiting)
- [Google Cloud Armor rate limiting overview](https://docs.cloud.google.com/armor/docs/rate-limiting-overview)
- [RFC 6585: Additional HTTP Status Codes](https://www.rfc-editor.org/rfc/rfc6585.html)
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [GitHub REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [Stripe rate limits](https://docs.stripe.com/rate-limits)
- [Shopify API rate limits](https://shopify.dev/docs/api/usage/rate-limits)
- [Discord rate limits](https://docs.discord.com/developers/topics/rate-limits)
- [Stripe: Scaling your API with rate limiters](https://stripe.com/blog/rate-limiters)
- [Cloudflare: Counting things](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)
- [Figma: An alternative approach to rate limiting](https://www.figma.com/blog/an-alternative-approach-to-rate-limiting)
- [Netflix concurrency-limits](https://github.com/Netflix/concurrency-limits)
- [AWS Builders' Library: Timeouts, retries and backoff with jitter](https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter)
- [AWS Builders' Library: Using load shedding to avoid overload](https://builder.aws.com/content/3Eun1EEyX6p2e3VYNyRLSJzLuMV/using-load-shedding-to-avoid-overload)
- [Google SRE book: Addressing cascading failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [Envoy circuit breaking](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/circuit_breaking)
