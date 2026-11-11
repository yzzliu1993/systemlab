---
id: replication
title: Replication
summary: How to keep copies of data on several machines, and what you give up when a copy is behind or the machine in charge fails.
---

## @situation

A head office keeps the master copy of a notice board. Each time it posts a new notice, a courier carries a copy to every branch office. The couriers do not arrive at the same moment. A branch that reads its copy before the courier arrives sees old news. And if the head office burns down after it told a manager "your notice is posted" but before the courier left, that notice is gone for good.

## @terms

Tools that do this job:

- [PostgreSQL streaming replication](https://www.postgresql.org/docs/current/warm-standby.html), which sends the change log of one database server to standby servers.
- [MySQL replication](https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html), which is asynchronous by default and offers a semi-synchronous mode.
- [Amazon RDS read replicas](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html) and [Multi-AZ standbys](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html), two ways to copy a managed database.
- [MongoDB replica sets](https://www.mongodb.com/docs/manual/core/replica-set-elections/), a group of servers that vote for a primary.
- [Redis replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/), which copies a Redis server to other servers.

### Replication

Keeping copies of the same data on more than one machine. It gives you spare machines for when one fails, and more machines to answer reads. The price is that the copies can disagree for a while.

### Leader

The machine that accepts writes. Every change goes to the Leader first, and it passes the change on. Some products call it the primary or the master.

### Follower

A machine that holds a copy of the Leader's data and applies the Leader's changes. It can answer reads. Some products call it a replica, a standby or a secondary.

### Asynchronous replication

The Leader tells the client "done" as soon as it has saved the write itself, and sends the change to the Followers afterwards. Writes are fast. If the Leader fails before the change is sent, that write is lost, even though the client was told it was safe.

### Synchronous replication

The Leader waits for at least one Follower to confirm the write before it tells the client "done". The write is slower, because it waits for a second machine. In return, the write is already on another machine when the client hears about it.

### Replication lag

How far a Follower is behind the Leader. A Follower with lag has not yet applied the latest writes, so a read from it can return old data. Lag grows when the network is slow or the Follower is busy.

### Read-your-own-writes

A promise that after you write something, your next read shows it. Reading from the Leader keeps this promise. Reading from a lagging Follower can break it. You see your old profile picture right after you changed it.

### Failover

Switching to another machine when the Leader fails. Someone or something has to notice the failure, choose a new Leader and send traffic to it. While this happens, writes may be refused.

### Promotion

Turning a Follower into the new Leader during a Failover. With Asynchronous replication, the chosen Follower may be missing the latest writes, and they are lost.

### Split brain

Two machines both believe they are the Leader and both accept writes. It can happen when a network break cuts the group in two, and each side picks its own Leader. The two copies then hold different writes, and merging them is hard.

### Quorum

A majority of the machines in a group, such as 2 of 3 or 3 of 5. Many systems accept a write or elect a Leader only when a Quorum agrees. Two separate groups cannot both hold a majority, which helps prevent Split brain.

## @how

The simulation below shows one Leader and several Followers. Next to each Follower is a number: how many writes it is behind. You choose the replication mode, asynchronous or synchronous, and the read routing: always the Leader, any Follower, or read-your-own-writes. Press "▶ Start" to send traffic.

Five counters tell you the cost of each choice: writes acknowledged, stale reads, lost writes, conflicts and write latency.

Things to try:

- Run with asynchronous mode and reads from any Follower. Watch the stale reads counter, then switch to read-your-own-writes and compare.
- Switch to synchronous mode. Watch the write latency counter rise and the lag numbers shrink.
- Fail the Leader in each mode and compare the lost writes counter.

## @practice

- PostgreSQL streaming replication is asynchronous by default. You make it synchronous with `synchronous_standby_names`. [PostgreSQL warm standby](https://www.postgresql.org/docs/current/warm-standby.html)
- In PostgreSQL, only `synchronous_commit = remote_apply` makes a write visible to reads on the standby. Other values do not promise that. [PostgreSQL WAL settings](https://www.postgresql.org/docs/current/runtime-config-wal.html)
- MySQL asynchronous replication can lose committed transactions if the source crashes. Semi-synchronous mode waits until a replica has received the write, not applied it, and falls back to asynchronous when it times out. [MySQL semi-synchronous replication](https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html)
- Amazon RDS read replicas are updated asynchronously, so they may be stale. [RDS read replicas](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html)
- An RDS Multi-AZ standby is synchronous. It cannot serve reads, and it adds commit latency. [RDS Multi-AZ](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html)
- MongoDB needs a majority of voting members to elect a primary, and writes are unavailable during an election. [MongoDB replica set elections](https://www.mongodb.com/docs/manual/core/replica-set-elections/)
- GitHub's freno sends a user's reads to a replica only when its replication lag is less than the time since that user's last write. [GitHub freno](https://github.blog/engineering/infrastructure/mitigating-replication-lag-and-reducing-read-load-with-freno/)
- Shopify hashes requests that share an id to one replica, so a user does not see data go back in time (monotonic reads). This is not the same promise as Read-your-own-writes. [Shopify read consistency](https://shopify.engineering/read-consistency-database-replicas)
- Uber's MySQL group replication elects a primary by majority, and a new primary applies its backlog of changes first. [Uber MySQL cluster uptime](https://www.uber.com/us/en/blog/improving-mysql-cluster-uptime-part2/)

## @extreme

The presets in the simulation push replication until it bends. For each one, watch the counters named below.

- "Lagging follower": one Follower falls far behind. Watch the stale reads counter when reads go to any Follower, and see whether read-your-own-writes avoids them.
- "Leader fails (async)": the Leader stops, and a Follower takes over by Promotion. Watch the lost writes counter. Writes that were acknowledged but not yet copied are gone. The same risk is described for [MySQL asynchronous replication](https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html), [MongoDB w:1 writes](https://www.mongodb.com/docs/manual/reference/write-concern/) and [Redis asynchronous replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/), where acknowledged writes can still be lost during a failover. [GitHub's orchestrator](https://github.blog/engineering/infrastructure/orchestrator-github/) post says that some updates made to the master may never reach any replica.
- "Leader fails (sync)": the same failure, with synchronous mode. Watch the lost writes counter and compare it with the async preset. Also watch the write latency counter, which is the price you paid. For RDS Multi-AZ, [AWS says](https://aws.amazon.com/rds/features/multi-az/) failover typically completes within one to two minutes. MongoDB elections make writes unavailable while they run, as the [election docs](https://www.mongodb.com/docs/manual/core/replica-set-elections/) say.
- "Network partition": the network splits, and both sides may accept writes. Watch the conflicts counter. In GitHub's [October 2018 incident](https://github.blog/news-insights/company-news/oct21-post-incident-analysis/), a short network outage led to a promotion in another region. Afterwards each side held writes the other lacked, so failing back was unsafe. "Split brain" is our label for this kind of situation, not GitHub's. [Redis Sentinel](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/) warns about the same shape: an old master cut off in a partition can keep accepting writes, and they are lost when the partition heals.

Fast writes, fresh reads and no lost data cannot all be had at once. Each setting picks which one to give up.

## @config

This is a minimal example for `postgresql.conf`. It makes the primary wait for the first of two named standbys to confirm each commit. The setting `synchronous_commit = remote_apply` is the one that makes a write visible to reads on the standby; the example uses `on`, which does not. See the [PostgreSQL WAL settings](https://www.postgresql.org/docs/current/runtime-config-wal.html) and the [warm standby docs](https://www.postgresql.org/docs/current/warm-standby.html).

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
