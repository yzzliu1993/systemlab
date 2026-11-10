---
id: consistent-hashing
title: 一致性雜湊
summary: 如何決定哪台機器負責哪一份資料，讓機器增加或減少時，搬動的資料盡量少。
---

## @situation

健身房有四排置物櫃。你的櫃子由手機號碼最後一個數字除以四決定。後來健身房多加了第五排，規則改成除以五。幾乎每個人的櫃子都換了位置，大家都得搬東西。

## @terms

可以做這件事的工具：

- [Apache Cassandra](https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html)，把資料放在由 token 與虛擬節點組成的環上的資料庫。
- [Redis Cluster](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)，把鍵分到雜湊槽（hash slot）的快取與資料庫。
- [Envoy](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers)，提供 ring hash 與 Maglev 來選主機的代理程式。
- [Google 的 jump consistent hash](https://arxiv.org/abs/1406.2294)，把鍵對應到 N 個桶子其中之一的極小演算法。

### 分片

分片（Sharding）是把資料或流量切成幾份，讓每個節點（node，群組中的一台機器）只負責其中一份。每個鍵都必須剛好有一個負責者，所以需要一條規則說明是哪個節點。

### 雜湊函式

雜湊函式（Hash function）是把任何鍵（例如使用者編號）變成一個數字的函式。同樣的鍵永遠得到同樣的數字，不同的鍵得到的數字則看起來像亂數，所以鍵會分得很平均。

### 取模雜湊

取模雜湊（Modulo hashing）是最簡單的規則：把雜湊函式的結果除以節點數，餘數就是負責者。它平均又便宜，但節點數一改變，大部分的鍵都會換負責者。

### 一致性雜湊

一致性雜湊（Consistent hashing）是在節點增加或減少時，讓大部分的鍵留在原本負責者身上的規則。只有靠近變動處的鍵會搬動。許多資料庫與快取都用這個概念。

### 雜湊環

雜湊環（Hash ring）是一致性雜湊背後的畫面。雜湊函式產生的數字被排在一個圓圈上，每個節點佔圓圈上的一個或多個點。一個鍵屬於從它出發沿著圓圈走時遇到的第一個節點。

### 虛擬節點

虛擬節點（Virtual node）是把同一個節點放在雜湊環的許多點上，而不是只放一個點。許多小片段加起來會接近公平的份額，所以負載更平均。新節點加入時，也是向許多鄰居各拿一點，而不是向一個鄰居拿很多。

### 會合雜湊

會合雜湊（Rendezvous hashing）是另一種讓搬動量很小的做法。對每個鍵，每個節點都用雜湊函式得到一個分數，分數最高的節點負責這個鍵。節點離開時，只有它的鍵會搬動，各自搬到次高分的節點。

### 重新平衡

重新平衡（Rebalancing）是在節點組成改變之後，把資料搬到新的負責者。它要花網路與磁碟的工作，執行期間系統可能變慢。好的規則會讓重新平衡的量很小。

### 熱點鍵

熱點鍵（Hot key）是收到的請求遠多於其他鍵的單一鍵，例如非常熱鬧的聊天頻道。不管用哪種規則，它的負責者都會過載。把鍵分平均也沒用，因為問題出在單一個鍵。

## @how

下面的模擬會畫出一個雜湊環，環上標出每個節點與每個虛擬節點。它也會顯示每個節點持有多少鍵、收到多少請求。你可以用選單挑規則：取模雜湊、雜湊環上的一致性雜湊，或會合雜湊。

用新增節點與移除節點的按鈕改變群組。每次變動後，讀數會顯示有多少鍵換了負責者。

可以試試看：

- 先用取模雜湊新增一個節點，再切換到雜湊環，同樣新增一個節點。比較搬動的鍵數。
- 在雜湊環上，改變每個節點的虛擬節點數。看看鍵數變得多平均。
- 在每種規則下移除一個節點。哪些鍵搬動了？搬去哪裡？

## @practice

- Amazon 的 Dynamo 使用一致性雜湊搭配虛擬節點，因為隨機放置節點會造成負載不均，也不考慮各伺服器容量不同。[Amazon Dynamo](https://www.allthingsdistributed.com/2007/10/amazons_dynamo.html)
- Cassandra 把 token 放在環上並使用虛擬節點，所以新節點是向許多鄰居拿資料，而不是只向一個。[Cassandra 架構](https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html)
- Redis Cluster 把鍵分到 16384 個雜湊槽，重新分片時就在節點之間搬動槽。[Redis Cluster 規格](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
- Discord 透過在雜湊環上查找，把每個 guild 導到某個節點。[Discord Elixir](https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users)
- GitHub 的負載平衡器使用會合雜湊，所以新增一台伺服器只會改變大約 N 分之一的對應。[GitHub GLB Director](https://github.blog/engineering/infrastructure/glb-director-open-source-load-balancer/)
- Cloudflare 把 Workers 安排在環上，所以新增一台伺服器只會重新安排它的鄰居。[Cloudflare shard and conquer](https://blog.cloudflare.com/eliminating-cold-starts-2-shard-and-conquer/)
- 在 Envoy 中，主機變動時 ring hash 大約影響 1/N 的請求。Maglev 建表比較快，但會搬動更多的鍵。[Envoy 負載平衡器](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers)與 [Maglev 論文](https://research.google/pubs/maglev-a-fast-and-reliable-software-network-load-balancer/)

## @extreme

用模擬裡的預設情境把系統推到極限。請看搬動鍵數的讀數與各節點的計數。

- 新增節點：看有多少鍵搬動。依我們自己的計算，從 4 個節點增加到 5 個，取模雜湊大約會搬動 5 分之 4 的鍵。這是我們自己算的，不是來源提供的數字。再拿來和雜湊環比較。
- 移除節點：看它的鍵去了哪裡。沒有虛擬節點時，順時鐘方向的下一個節點會接下全部的鍵，負載因此暴增。有許多虛擬節點，或使用會合雜湊時，這些鍵會分散到其他節點。
- 沒有虛擬節點：每個節點在環上只有一個點。看鍵數變得不平均。負載不均正是 Dynamo 改用虛擬節點的原因之一，論文第 4.2 節有說明。
- 熱點鍵：單一個鍵收到大部分請求。看一個節點扛下負載，不論用哪種規則。Discord 曾在熱鬧的頻道上遇到熱點分區，請見它的[儲存兆則訊息](https://discord.com/blog/how-discord-stores-trillions-of-messages)一文。

負載不均與資料搬動是兩個不同的問題。一致性雜湊幫忙減少資料搬動，虛擬節點幫忙處理負載不均，但兩者都解決不了熱點鍵。

## @config

這個 Envoy 叢集使用 ring hash 策略。環大小的設定決定環上有多少個點，環越大越平均。這只是最小範例，所有選項請見 [Envoy 負載平衡器頁面](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers)。

```yaml
clusters:
  - name: backend
    type: STRICT_DNS
    lb_policy: RING_HASH
    ring_hash_lb_config:
      minimum_ring_size: 1024
      maximum_ring_size: 8388608
```

## @sources

- [Cassandra 架構，Dynamo](https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html)
- [Redis Cluster 規格](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
- [Envoy 支援的負載平衡器](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers)
- [Jump consistent hash 論文](https://arxiv.org/abs/1406.2294)
- [Maglev 論文](https://research.google/pubs/maglev-a-fast-and-reliable-software-network-load-balancer/)
- [Amazon Dynamo](https://www.allthingsdistributed.com/2007/10/amazons_dynamo.html)
- [Discord，擴充 Elixir](https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users)
- [Discord，儲存兆則訊息](https://discord.com/blog/how-discord-stores-trillions-of-messages)
- [GitHub GLB Director](https://github.blog/engineering/infrastructure/glb-director-open-source-load-balancer/)
- [Cloudflare，shard and conquer](https://blog.cloudflare.com/eliminating-cold-starts-2-shard-and-conquer/)
