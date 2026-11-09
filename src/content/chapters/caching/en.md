---
id: caching
title: Caching
summary: Keep the data you read most close at hand, and learn what it costs when the copy goes out of date.
---

## @situation

You work at a desk. The things you use every day are in a storeroom down the hall. Walking there each time is slow.

So you keep a few of them on your desk. Now most lookups are quick. But your desk is small. When it is full, something has to go back to the storeroom to make room.

There is a second problem. Someone may change the original in the storeroom. The copy on your desk is then old, and you may not know it. Computers face the same trade: a fast, small place close by, a slow, big place far away, and a copy that can go out of date.

## @terms

You do not have to build this from scratch. These tools and services keep copies of data for you:

- [Redis](https://redis.io/docs/latest/develop/reference/eviction/) is an in-memory store that is often used as a cache.
- [Memcached](https://docs.memcached.org/) is a simple in-memory cache for key-value data.
- [Amazon ElastiCache](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html) is a managed cache service from AWS, with guidance on caching strategies.
- [Google Cloud Memorystore](https://docs.cloud.google.com/memorystore/docs/redis/memory-management-best-practices) is a managed Redis service from Google Cloud.
- [Cloudflare's CDN cache](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/) keeps copies of files near your users, so the origin server is asked less often.

### Cache

A cache is a small, fast place that holds copies of data from a slower, bigger place. It is your desk in the story.

### Cache hit

A cache hit means the data you asked for was already in the cache. The answer comes back fast, and the database is not touched.

### Cache miss

A cache miss means the data was not in the cache. The system must go to the database, which is slower, and it usually saves the result in the cache for next time.

### Hit rate

Hit rate is the share of requests that are cache hits. A higher hit rate means fewer trips to the database.

### TTL

TTL stands for time to live. It is how long a cached item may stay before it expires and is thrown away. A short TTL keeps data fresher. A long TTL saves more database reads.

### Eviction

Eviction is when the cache removes an item to make room for a new one. It happens when the cache is full.

### LRU

LRU stands for least recently used. It is an eviction rule: when the cache is full, remove the item that has gone unused the longest.

### Cache-aside

In cache-aside, your application looks in the cache first. On a miss, it reads the database and then puts the result in the cache itself. The cache does not talk to the database on its own.

### Write-through

In write-through, every write goes to the cache and the database together. The cache is always up to date after a write, but each write costs a bit more.

### Invalidation

Invalidation means removing or updating a cached item because the original changed. If invalidation is missed, readers see stale data until the TTL ends.

### Request coalescing

Request coalescing means that when many requests ask for the same missing item at the same time, only one goes to the database. The others wait and share its answer.

## @how

The simulation below shows requests arriving, the cache contents with the hot keys marked, and the database queue. The stats track hit rate, database reads, latency, stale reads and evictions.

Things to try:

- Make the cache smaller and watch evictions climb and the hit rate fall.
- Raise or lower the TTL and compare database reads with stale reads.
- Turn request coalescing on, then make one key very popular and watch the database queue.

## @practice

- Facebook built a very large distributed cache on top of memcached to serve its reads: [Scaling Memcache at Facebook](https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala).
- Meta's mcrouter sends traffic to a healthy cache host when one fails, and it can warm an empty cache from a warm one: [Introducing mcrouter](https://engineering.fb.com/2014/09/15/web/introducing-mcrouter-a-memcached-protocol-router-for-scaling-memcached-deployments/).
- Meta describes a race in which a delayed fill writes an old value after a newer invalidation: [Cache made consistent](https://engineering.fb.com/2022/06/08/core-infra/cache-made-consistent/).
- Uber put an integrated cache in front of its database. It uses TTLs and invalidation, and when an invalidation fails, a row stays stale until the TTL ends: [How Uber serves over 150 million reads](https://www.uber.com/en-AE/blog/how-uber-serves-over-150-million-reads).
- Netflix EVCache treats cached data as something that can disappear at any time: [Netflix EVCache](https://github.com/Netflix/EVCache).
- Discord combines identical concurrent reads so the database is read only once: [How Discord stores trillions of messages](https://discord.com/blog/how-discord-stores-trillions-of-messages).
- Cloudflare collapses many requests for the same uncached file into one trip to the origin: [Cloudflare default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/).

## @extreme

Try these presets in the simulation and watch the numbers named below.

- Cache too small: watch evictions and the hit rate. Items leave before they are used again, so the database does the work. See the [Redis eviction docs](https://redis.io/docs/latest/develop/reference/eviction/).
- Cache restart: watch database reads right after the restart. An empty cache can send a surge of misses to the database. See [Caching challenges and strategies](https://builder.aws.com/content/3K9TeXp6strMiJ4vhakpRD7BQWO/caching-challenges-and-strategies) and [Slack's incident on 2-22-22](https://slack.engineering/slacks-incident-on-2-22-22/), where cache nodes came back empty and the misses overloaded the database.
- Hot key expires: watch the database queue at the moment of expiry. Many requests miss at once. Request coalescing helps here, as described by [AWS](https://builder.aws.com/content/3K9TeXp6strMiJ4vhakpRD7BQWO/caching-challenges-and-strategies) and [Discord](https://discord.com/blog/how-discord-stores-trillions-of-messages).
- No invalidation on write: watch stale reads. Readers keep getting the old value until the TTL ends. See the [ElastiCache strategies](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html), [Cache made consistent](https://engineering.fb.com/2022/06/08/core-infra/cache-made-consistent/) and [Uber's cache](https://www.uber.com/en-AE/blog/how-uber-serves-over-150-million-reads).

## @config

This is a minimal example for `redis.conf`. It sets a memory limit and evicts the least recently used key when the limit is reached. See the [Redis eviction docs](https://redis.io/docs/latest/develop/reference/eviction/).

```conf
maxmemory 256mb
maxmemory-policy allkeys-lru
```

To give one key a TTL of 60 seconds, run `EXPIRE session:42 60`. See the [Redis EXPIRE docs](https://redis.io/docs/latest/commands/expire/).

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
