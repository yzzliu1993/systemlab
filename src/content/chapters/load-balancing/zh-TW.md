---
id: load-balancing
title: 負載平衡
summary: 如何把湧入的工作分給多個工作者，讓沒有人被壓垮，也沒有人閒著。
---

## @situation

超市有六條結帳隊伍。你排進最短的那一條，但前面的人推著滿滿一車商品，還在處理優惠券。排隊的人數，並不等於排隊的工作量。

## @terms

可以做這件事的工具：

- [Nginx](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)，也能分配流量的網頁伺服器。
- [HAProxy](https://docs.haproxy.org/3.0/configuration.html)，專門用來做負載平衡的程式。
- [AWS Elastic Load Balancing](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html)，AWS 上的託管服務。
- [Envoy](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers)，常用在服務之間的代理程式。
- [Google Cloud Load Balancing](https://docs.cloud.google.com/load-balancing/docs/load-balancing-overview)，Google Cloud 上的託管服務。

### 負載平衡器

負載平衡器（Load Balancer）是接收每一個進來的請求，並決定交給哪一台伺服器處理的程式。用戶端只和負載平衡器溝通，不會直接找後面的伺服器。

### 伺服器

伺服器（Server）是真正做事的一台機器或一個程序。伺服器的速度可能不同。負載平衡器前面通常會接好幾台伺服器。

### 請求

請求（Request）是用戶端送出的一件工作，例如載入頁面或送出表單。請求並不相同：有的幾毫秒就完成，有的要好幾秒。

### 輪詢

輪詢（Round Robin）是照固定順序把請求分給伺服器：第一台、第二台、第三台，然後回到第一台。做法簡單，數量上也公平，但完全不看每台伺服器現在有多忙。

### 最少連線

最少連線（Least Connections）是把每個新請求交給目前未完成請求最少的伺服器。慢的伺服器會堆出隊伍，所以分到的新請求會變少。

### 加權輪詢

加權輪詢（Weighted Round Robin）是替每台伺服器設定權重的輪詢。權重 4 的伺服器，每輪會拿到四次，權重 1 的只拿一次。伺服器速度不同時就用它。

### 加權最少連線

加權最少連線（Weighted Least Connections）是會考慮權重的最少連線。它用權重去比較各台未完成的請求數，所以強的伺服器可以排比較長的隊。

### 健康檢查

健康檢查（Health check）是定期詢問每台伺服器還能不能服務的測試。沒通過健康檢查的伺服器會先被移出輪替，等到通過後再加回來。

## @how

下方的模擬會顯示幾台伺服器，每台都有自己的隊伍。請求會隨時間進來，負載平衡器再依照你選的演算法，把每個請求交給一台伺服器。按下播放，看看隊伍怎麼變化。

統計區會顯示已完成、已失敗、仍在等待的請求數，還有平均等待時間與最長等待時間。比較檢視會用同一份流量跑兩種演算法，讓你直接看出差別。

可以試試看：

- 先跑輪詢，再用同一份流量換成最少連線。哪一條隊伍長得比較慢？
- 讓伺服器速度不同，並把權重設成和速度相符，因為速度和權重是分開的設定。然後比較輪詢和加權輪詢。
- 打開比較檢視，除了平均值，也看看最長等待時間。

## @practice

- 輪詢不管每個請求的成本，也不管每台伺服器的速度。 [Google SRE book](https://sre.google/sre-book/load-balancing-datacenter/)
- 請求數相同，不代表負載相同。 [Dropbox Bandaid](https://dropbox.tech/infrastructure/enhancing-bandaid-load-balancing-at-dropbox-by-leveraging-real-time-backend-server-load-information)
- Dropbox 的 Robinhood 會依每個節點實測的使用率調整權重，新節點的流量則是慢慢加上去。 [Dropbox Robinhood](https://dropbox.tech/infrastructure/robinhood-in-house-load-balancing-service)
- 固定比例的流量在硬體與請求成本混雜時會出問題。 [Cloudflare Unimog](https://blog.cloudflare.com/unimog-cloudflares-edge-load-balancer/)
- AWS 的 Application Load Balancer 預設使用輪詢，也可以改成把每個請求交給未完成請求最少的目標。 [AWS ALB target groups](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html)
- Envoy 的 least request 模式會隨機挑兩台主機，把請求交給比較不忙的那一台。 [Envoy load balancers](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers)

## @extreme

利用模擬裡的預設情境，把系統推到快撐不住。請留意等待中的數量與最長等待時間。

- 大量流量：請求進來的速度比伺服器處理的速度快。不論選哪種演算法，都會看到隊伍變長、最長等待時間往上爬。
- 一台伺服器變慢：輪詢仍用同樣的速率餵給慢的伺服器。先看它的隊伍，再換成最少連線。
- 請求成本不一：少數成本很高的請求會卡住一條隊伍。看看輪詢和最少連線怎麼分散它們。
- 一台伺服器掛掉：它的請求會失敗，其餘伺服器必須扛起負載。看看失敗數，以及其他隊伍會怎麼變。

真實系統也會碰到這些情況。伺服器掛掉時，它的負載會移到其他台，多出來的負載又可能把它們壓垮，[Google SRE book 談連鎖故障](https://sre.google/sre-book/addressing-cascading-failures/)時有說明。重試會讓情況更糟，因為每個失敗的請求都會變成更多工作，所以重試與退避值得讀 AWS Builders' Library 的文章 [Timeouts, retries and backoff with jitter](https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter)。Envoy 在 [panic threshold](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/panic_threshold) 頁面說明了太多伺服器不健康時它怎麼做。

## @config

這段 Nginx 設定對應模擬預設的伺服器，權重為 4、2、1，並使用加權最少連線選項。這只是最精簡的範例，所有選項請看 [Nginx upstream 文件](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)。

```nginx
upstream backend {
    least_conn;
    server 10.0.0.1 weight=4;
    server 10.0.0.2 weight=2;
    server 10.0.0.3 weight=1;
}

server {
    listen 80;

    location / {
        proxy_pass http://backend;
    }
}
```

## @sources

- [Nginx upstream module](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
- [AWS ALB target groups](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html)
- [How Elastic Load Balancing works](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html)
- [Google Cloud Load Balancing overview](https://docs.cloud.google.com/load-balancing/docs/load-balancing-overview)
- [Envoy supported load balancers](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers)
- [HAProxy 3.0 manual](https://docs.haproxy.org/3.0/configuration.html)
- [Google SRE book, Load Balancing in the Datacenter](https://sre.google/sre-book/load-balancing-datacenter/)
- [Dropbox Bandaid](https://dropbox.tech/infrastructure/enhancing-bandaid-load-balancing-at-dropbox-by-leveraging-real-time-backend-server-load-information)
- [Dropbox Robinhood](https://dropbox.tech/infrastructure/robinhood-in-house-load-balancing-service)
- [Cloudflare Unimog](https://blog.cloudflare.com/unimog-cloudflares-edge-load-balancer/)
- [Google SRE book, Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [AWS Builders' Library, Timeouts, retries and backoff with jitter](https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter)
- [Envoy panic threshold](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/panic_threshold)
