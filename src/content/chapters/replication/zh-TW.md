---
id: replication
title: 複製
summary: 如何把資料的副本放在好幾台機器上，以及副本落後或負責的機器故障時，你得放棄什麼。
---

## @situation

總公司保管一面公布欄的正本。每次貼出新公告，就會有快遞把副本送到每一間分公司。快遞不會在同一個時刻抵達。分公司如果在快遞到達之前就讀自己的副本，看到的是舊消息。而且，如果總公司在告訴經理「你的公告已經貼出」之後、快遞出發之前失火，那則公告就永遠消失了。

## @terms

可以做這件事的工具：

- [PostgreSQL streaming replication](https://www.postgresql.org/docs/current/warm-standby.html)，把一台資料庫伺服器的變更紀錄傳給備援伺服器。
- [MySQL replication](https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html)，預設是非同步，也提供半同步模式。
- [Amazon RDS read replicas](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html) 與 [Multi-AZ standbys](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html)，複製託管資料庫的兩種方式。
- [MongoDB replica sets](https://www.mongodb.com/docs/manual/core/replica-set-elections/)，由一群伺服器投票選出 primary。
- [Redis replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)，把一台 Redis 伺服器複製到其他伺服器。

### 複製

複製（Replication）是把同一份資料的副本放在不只一台機器上。它讓你在一台故障時有備用機器，也有更多機器可以回答讀取。代價是副本之間有一段時間可能不一致。

### 主節點

主節點（Leader）是接受寫入的那台機器。每個變更都先送到主節點，再由它往下傳。有些產品稱它為 primary 或 master。

### 從節點

從節點（Follower）是持有主節點資料副本、並套用主節點變更的機器。它可以回答讀取。有些產品稱它為 replica、standby 或 secondary。

### 非同步複製

非同步複製（Asynchronous replication）是主節點自己存好寫入後，就立刻告訴用戶端「完成」，之後才把變更送給從節點。寫入很快。如果主節點在變更送出前故障，那筆寫入就會遺失，即使用戶端已經被告知它是安全的。

### 同步複製

同步複製（Synchronous replication）是主節點要等至少一個從節點確認寫入，才告訴用戶端「完成」。寫入比較慢，因為要等第二台機器。作為回報，用戶端聽到結果時，寫入已經在另一台機器上了。

### 複製延遲

複製延遲（Replication lag）是從節點落後主節點多遠。有延遲的從節點還沒套用最新的寫入，所以從它讀到的可能是舊資料。網路慢或從節點忙碌時，延遲會變大。

### 讀到自己的寫入

讀到自己的寫入（Read-your-own-writes）是一個保證：你寫了東西之後，下一次讀取就看得到它。從主節點讀取可以遵守這個保證。從落後的從節點讀取可能打破它。例如你剛換了大頭貼，卻還看到舊的。

### 故障轉移

故障轉移（Failover）是主節點故障時切換到另一台機器。必須有人或程式發現故障、選出新的主節點，並把流量導過去。這段期間，寫入可能被拒絕。

### 升級

升級（Promotion）是在故障轉移時，把一個從節點變成新的主節點。在非同步複製下，被選中的從節點可能缺少最新的寫入，這些寫入就會遺失。

### 腦裂

腦裂（Split brain）是兩台機器都認為自己是主節點，而且都接受寫入。網路中斷把群組切成兩半、各自選出自己的主節點時，就可能發生。兩份副本會各有不同的寫入，要合併很困難。

### 多數決

多數決（Quorum）是群組中機器的過半數，例如 3 台中的 2 台、5 台中的 3 台。許多系統只有在多數決同意時，才接受寫入或選出主節點。兩個分開的群組不可能同時都過半，這有助於防止腦裂。

## @how

下面的模擬會顯示一個主節點和幾個從節點。每個從節點旁邊有一個數字：它落後了幾筆寫入。你可以選擇複製模式（非同步或同步），以及讀取的導向：一律讀主節點、讀任一從節點，或讀到自己的寫入。按下「▶ 開始」就會送出流量。

五個計數器告訴你每種選擇的代價：已確認的寫入、過時的讀取、遺失的寫入、衝突與寫入延遲。

可以試試：

- 用非同步模式、讀取任一從節點來跑。看過時讀取的計數器，再切換成讀到自己的寫入，比較差異。
- 切換成同步模式。看寫入延遲的計數器上升，以及落後的數字縮小。
- 在每種模式下讓主節點故障，比較遺失寫入的計數器。

## @practice

- PostgreSQL 的 streaming replication 預設是非同步。你用 `synchronous_standby_names` 把它改成同步。[PostgreSQL warm standby](https://www.postgresql.org/docs/current/warm-standby.html)
- 在 PostgreSQL 中，只有 `synchronous_commit = remote_apply` 能讓寫入在備援端的讀取中看得到。其他的值不保證這一點。[PostgreSQL WAL settings](https://www.postgresql.org/docs/current/runtime-config-wal.html)
- MySQL 的非同步複製在來源端當機時，可能遺失已提交的交易。半同步模式會等到有一個 replica 收到寫入（不是套用完成），逾時後會退回非同步。[MySQL semi-synchronous replication](https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html)
- Amazon RDS 的 read replica 是以非同步方式更新，所以可能是過時的。[RDS read replicas](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html)
- RDS 的 Multi-AZ standby 是同步的。它不能提供讀取，而且會增加提交的延遲。[RDS Multi-AZ](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html)
- MongoDB 需要有投票權的成員過半數，才能選出 primary，而且選舉期間無法寫入。[MongoDB replica set elections](https://www.mongodb.com/docs/manual/core/replica-set-elections/)
- GitHub 的 freno 只有在 replica 的複製延遲小於「該使用者上次寫入至今的時間」時，才把他的讀取導向 replica。[GitHub freno](https://github.blog/engineering/infrastructure/mitigating-replication-lag-and-reducing-read-load-with-freno/)
- Shopify 把帶有相同 id 的請求雜湊到同一個 replica，讓使用者不會看到資料倒退（monotonic reads）。這和讀到自己的寫入不是同一種保證。[Shopify read consistency](https://shopify.engineering/read-consistency-database-replicas)
- Uber 的 MySQL group replication 用多數決選出 primary，新的 primary 會先套用積壓的變更。[Uber MySQL cluster uptime](https://www.uber.com/us/en/blog/improving-mysql-cluster-uptime-part2/)

## @extreme

模擬中的預設情境會把複製推到極限。每一個都請看下面指出的計數器。

- 「落後的從節點」：有一個從節點落後很多。讀取導向任一從節點時，看過時讀取的計數器，並觀察讀到自己的寫入能不能避開它們。
- 「主節點故障（非同步）」：主節點停止，由一個從節點以升級接手。看遺失寫入的計數器。已確認但還沒複製出去的寫入就沒了。[MySQL 非同步複製](https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html)、[MongoDB 的 w:1 寫入](https://www.mongodb.com/docs/manual/reference/write-concern/)與 [Redis 非同步複製](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)都描述過同樣的風險：已確認的寫入在故障轉移時仍可能遺失。[GitHub 的 orchestrator](https://github.blog/engineering/infrastructure/orchestrator-github/) 文章則指出，對 master 做的某些更新可能永遠沒有傳到任何 replica。
- 「主節點故障（同步）」：同樣的故障，但用同步模式。看遺失寫入的計數器，並和非同步的情境比較。也看寫入延遲的計數器，那是你付出的代價。關於 RDS Multi-AZ，[AWS 表示](https://aws.amazon.com/rds/features/multi-az/)故障轉移通常在一到兩分鐘內完成。MongoDB 選舉進行時無法寫入，[選舉文件](https://www.mongodb.com/docs/manual/core/replica-set-elections/)是這樣說的。
- 「網路分割」：網路斷成兩半，兩邊都可能接受寫入。看衝突的計數器。在 GitHub 的 [2018 年 10 月事件](https://github.blog/news-insights/company-news/oct21-post-incident-analysis/)中，一次短暫的網路中斷導致另一個區域的升級。之後兩邊各自有對方沒有的寫入，所以切回原本的一邊並不安全。「腦裂」是我們對這類情況的稱呼，不是 GitHub 的用語。[Redis Sentinel](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/) 警告過類似的情形：被分割隔開的舊 master 可能繼續接受寫入，分割恢復時這些寫入就會遺失。

寫入快、讀取新、資料不遺失，這三件事無法同時全部做到。每個設定都是選擇要放棄哪一個。

## @config

這是 `postgresql.conf` 的最小範例。它讓主伺服器等兩個指定的備援中第一個確認，才算提交完成。能讓寫入在備援端的讀取中看得到的設定是 `synchronous_commit = remote_apply`；這個範例用的是 `on`，並沒有這個效果。請參考 [PostgreSQL WAL 設定](https://www.postgresql.org/docs/current/runtime-config-wal.html)與 [warm standby 文件](https://www.postgresql.org/docs/current/warm-standby.html)。

```conf
synchronous_standby_names = 'FIRST 1 (replica1, replica2)'
synchronous_commit = on
```

## @sources

- [PostgreSQL, high availability and warm standby](https://www.postgresql.org/docs/current/warm-standby.html)
- [PostgreSQL, write-ahead log settings](https://www.postgresql.org/docs/current/runtime-config-wal.html)
- [MySQL, semi-synchronous replication](https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html)
- [Amazon RDS, read replicas](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html)
- [Amazon RDS, Multi-AZ with one standby](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html)
- [Amazon RDS, Multi-AZ features](https://aws.amazon.com/rds/features/multi-az/)
- [MongoDB, replica set elections](https://www.mongodb.com/docs/manual/core/replica-set-elections/)
- [MongoDB, write concern](https://www.mongodb.com/docs/manual/reference/write-concern/)
- [Redis, replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)
- [Redis, Sentinel](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)
- [GitHub, orchestrator](https://github.blog/engineering/infrastructure/orchestrator-github/)
- [GitHub, freno](https://github.blog/engineering/infrastructure/mitigating-replication-lag-and-reducing-read-load-with-freno/)
- [GitHub, October 2018 incident analysis](https://github.blog/news-insights/company-news/oct21-post-incident-analysis/)
- [Shopify, read consistency with database replicas](https://shopify.engineering/read-consistency-database-replicas)
- [Uber, improving MySQL cluster uptime](https://www.uber.com/us/en/blog/improving-mysql-cluster-uptime-part2/)
