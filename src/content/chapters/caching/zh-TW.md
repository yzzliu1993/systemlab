---
id: caching
title: 快取
summary: 把最常讀的資料放在手邊，並了解複本過期時要付出什麼代價。
---

## @situation

你在一張桌子前工作。每天要用的東西放在走廊另一頭的儲藏室，每次都跑去拿很花時間。

所以你把幾樣常用的放在桌上，大部分的查找都很快。但桌子很小，放滿之後，就得把某樣東西送回儲藏室，才有空位。

還有第二個問題。別人可能改了儲藏室裡的原件，桌上的複本就舊了，而你不一定知道。電腦面對的是同一種取捨：近處有一個又快又小的地方，遠處有一個又慢又大的地方，而複本可能過期。

## @terms

你不需要從零開始做。下面這些工具和服務可以幫你保存資料的複本：

- [Redis](https://redis.io/docs/latest/develop/reference/eviction/) 是記憶體內的資料儲存，常被拿來當快取。
- [Memcached](https://docs.memcached.org/) 是簡單的記憶體快取，存放鍵值資料。
- [Amazon ElastiCache](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html) 是 AWS 的託管快取服務，文件裡也有快取策略的說明。
- [Google Cloud Memorystore](https://docs.cloud.google.com/memorystore/docs/redis/memory-management-best-practices) 是 Google Cloud 的託管 Redis 服務。
- [Cloudflare 的 CDN 快取](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)會把檔案的複本放在離使用者近的地方，讓來源伺服器被問到的次數變少。

### 快取（Cache）

快取是一個又小又快的地方，存放來自較慢、較大地方的資料複本。它就是故事裡的桌子。

### 快取命中（Cache hit）

快取命中是指你要的資料已經在快取裡。答案很快就回來，資料庫完全不用動。

### 快取未命中（Cache miss）

快取未命中是指資料不在快取裡。系統得去問比較慢的資料庫，通常還會把結果存進快取，下次就能直接用。

### 命中率（Hit rate）

命中率是請求中屬於快取命中的比例。命中率越高，去資料庫的次數就越少。

### 存活時間（TTL）

TTL 是 time to live 的縮寫，意思是快取項目可以留多久，時間到就過期並被丟掉。TTL 短，資料比較新；TTL 長，可以省下更多資料庫讀取。

### 淘汰（Eviction）

淘汰是指快取為了騰出空間給新項目，而把某個項目移除。快取滿了就會發生。

### 最近最少使用（LRU）

LRU 是 least recently used 的縮寫，是一種淘汰規則：快取滿了的時候，移除閒置最久的項目。

### 旁路快取（cache-aside）

在旁路快取中，應用程式先查快取。沒命中時，由應用程式自己讀資料庫，再把結果放進快取。快取不會自己去找資料庫。

### 寫穿（write-through）

在寫穿中，每次寫入會同時寫進快取和資料庫。寫入之後快取一定是最新的，但每次寫入的成本會高一點。

### 失效（Invalidation）

失效是指因為原始資料改了，而移除或更新快取項目。如果漏掉失效，讀的人會一直看到過期的資料，直到 TTL 結束。

### 請求合併（Request coalescing）

請求合併是指當很多請求同時要同一個不在快取裡的項目時，只有一個請求會去資料庫，其他的等待並共用它的結果。

## @how

下方的模擬會顯示進來的請求、快取內容（熱門的 key 會被標出來），以及資料庫的佇列。統計數字包括命中率、資料庫讀取次數、延遲、讀到過期資料的次數，以及淘汰次數。

可以試試這些：

- 把快取調小，看淘汰次數上升、命中率下降。
- 調高或調低 TTL，比較資料庫讀取次數和讀到過期資料的次數。
- 開啟請求合併，再讓某一個 key 變得非常熱門，看資料庫佇列的變化。

## @practice

- Facebook 在 memcached 之上建了一個非常大的分散式快取來處理讀取：[Scaling Memcache at Facebook](https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala)。
- Meta 的 mcrouter 在某台快取主機故障時，會把流量送到健康的主機，也能用一個已暖機的快取替空快取暖機：[Introducing mcrouter](https://engineering.fb.com/2014/09/15/web/introducing-mcrouter-a-memcached-protocol-router-for-scaling-memcached-deployments/)。
- Meta 描述了一種競態：延遲的填入動作，會在較新的失效之後寫入舊值：[Cache made consistent](https://engineering.fb.com/2022/06/08/core-infra/cache-made-consistent/)。
- Uber 在資料庫前面放了一層整合式快取，使用 TTL 與失效機制；失效失敗時，那一列資料會一直是舊的，直到 TTL 結束：[How Uber serves over 150 million reads](https://www.uber.com/en-AE/blog/how-uber-serves-over-150-million-reads)。
- Netflix 的 EVCache 把快取資料視為隨時可能消失：[Netflix EVCache](https://github.com/Netflix/EVCache)。
- Discord 把相同的並行讀取合併，讓資料庫只被讀一次：[How Discord stores trillions of messages](https://discord.com/blog/how-discord-stores-trillions-of-messages)。
- Cloudflare 把許多對同一個未快取檔案的請求合併成一次回源：[Cloudflare default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)。

## @extreme

在模擬中試試這些預設情境，並留意下面指出的數字。

- 快取太小：看淘汰次數和命中率。項目還沒被再次使用就被淘汰，工作都落到資料庫身上。參考 [Redis 淘汰文件](https://redis.io/docs/latest/develop/reference/eviction/)。
- 快取重啟：看重啟後資料庫的讀取次數。空的快取可能讓大量未命中一下子湧向資料庫。參考 [Caching challenges and strategies](https://builder.aws.com/content/3K9TeXp6strMiJ4vhakpRD7BQWO/caching-challenges-and-strategies)，以及 [Slack 2-22-22 事件](https://slack.engineering/slacks-incident-on-2-22-22/)：快取節點回來時是空的，未命中把資料庫壓垮。
- 熱門 key 過期：看過期那一刻的資料庫佇列。很多請求會同時未命中。請求合併在這裡有幫助，見 [AWS](https://builder.aws.com/content/3K9TeXp6strMiJ4vhakpRD7BQWO/caching-challenges-and-strategies) 與 [Discord](https://discord.com/blog/how-discord-stores-trillions-of-messages) 的說明。
- 寫入時不做失效：看讀到過期資料的次數。讀的人會一直拿到舊值，直到 TTL 結束。參考 [ElastiCache 策略](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html)、[Cache made consistent](https://engineering.fb.com/2022/06/08/core-infra/cache-made-consistent/) 與 [Uber 的快取](https://www.uber.com/en-AE/blog/how-uber-serves-over-150-million-reads)。

## @config

這是 `redis.conf` 的最小範例：設定記憶體上限，達到上限時淘汰最近最少使用的 key。請見 [Redis 淘汰文件](https://redis.io/docs/latest/develop/reference/eviction/)。

```conf
maxmemory 256mb
maxmemory-policy allkeys-lru
```

要讓某個 key 的 TTL 為 60 秒，執行 `EXPIRE session:42 60`。請見 [Redis EXPIRE 文件](https://redis.io/docs/latest/commands/expire/)。

## @sources

- [Redis eviction](https://redis.io/docs/latest/develop/reference/eviction/)
- [Redis EXPIRE](https://redis.io/docs/latest/commands/expire/)
- [Amazon ElastiCache caching strategies](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html)
- [Memcached documentation](https://docs.memcached.org/)
- [Memorystore memory management best practices](https://docs.cloud.google.com/memorystore/docs/redis/memory-management-best-practices)
- [Cloudflare default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)
- [Scaling Memcache at Facebook (NSDI 2013)](https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala)
- [Introducing mcrouter](https://engineering.fb.com/2014/09/15/web/introducing-mcrouter-a-memcached-protocol-router-for-scaling-memcached-deployments/)
- [Cache made consistent](https://engineering.fb.com/2022/06/08/core-infra/cache-made-consistent/)
- [Netflix EVCache](https://github.com/Netflix/EVCache)
- [How Uber serves over 150 million reads](https://www.uber.com/en-AE/blog/how-uber-serves-over-150-million-reads)
- [Caching challenges and strategies (AWS Builders' Library)](https://builder.aws.com/content/3K9TeXp6strMiJ4vhakpRD7BQWO/caching-challenges-and-strategies)
- [How Discord stores trillions of messages](https://discord.com/blog/how-discord-stores-trillions-of-messages)
- [Slack's incident on 2-22-22](https://slack.engineering/slacks-incident-on-2-22-22/)
