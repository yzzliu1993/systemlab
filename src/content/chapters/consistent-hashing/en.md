---
id: consistent-hashing
title: Consistent hashing
summary: How to decide which machine owns which piece of data, so that adding or removing a machine moves as little as possible.
---

## @situation

A gym has four rows of lockers. Your locker is picked by the last digit of your phone number: the remainder after dividing by four. Then the gym adds a fifth row, and the rule changes to the remainder after dividing by five. The two rules agree only for the digits 0 to 3. The other 6 of the 10 possible digits get a new locker, so most people have to move their things.

## @terms

Tools that do this job:

- [Apache Cassandra](https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html), a database that places data on a ring of tokens and virtual nodes.
- [Redis Cluster](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/), a cache and database that splits keys into hash slots.
- [Envoy](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers), a proxy that offers ring hash and Maglev for choosing a host.
- [Google's jump consistent hash](https://arxiv.org/abs/1406.2294), a very small algorithm that maps a key to one of N buckets.

### Sharding

Splitting data or traffic into parts, so that each node holds only one part. A node is one machine in the group. Every key must have exactly one owner, so you need a rule that says which node it is.

### Hash function

A function that turns any key, such as a user id, into a number. The same key always gives the same number, and different keys give numbers that look random. That spreads keys evenly.

### Modulo hashing

The simplest rule: take the Hash function result and divide by the number of nodes. The remainder is the owner. It is even and cheap, but when the number of nodes changes, most keys get a new owner.

### Consistent hashing

A rule that keeps most keys with their old owner when a node is added or removed. Only the keys near the change move. It is the idea behind many databases and caches.

### Hash ring

The picture behind Consistent hashing. The numbers from the Hash function are laid out on a circle. Each node sits at one or more points on the circle. A key belongs to the first node you meet when you walk around the circle from the key.

### Virtual node

One node placed at many points on the Hash ring instead of one. It evens out the load, because many small slices add up to a fair share. When a node joins, it also takes a little from many neighbours instead of a lot from one.

### Rendezvous hashing

Another way to keep moves small. For each key, every node gets a score from the Hash function. The node with the highest score owns the key. When a node leaves, only its keys move, each to the next best node.

### Rebalancing

Moving data to its new owners after the set of nodes changes. It costs network and disk work, and it can slow the system down while it runs. A good rule makes Rebalancing small.

### Hot key

One key that gets far more requests than the others, such as a very busy chat channel. Its owner is overloaded, whatever the rule. Spreading keys evenly does not help, because the problem is one key.

## @how

The simulation below shows a Hash ring with a mark for each node and each Virtual node. For every node it shows how many keys it holds and how many requests it gets. A picker lets you choose the rule: Modulo hashing, Consistent hashing on the Hash ring, or Rendezvous hashing.

Use the add node and remove node buttons to change the group. A readout shows how many keys moved to a new owner after each change.

Things to try:

- Add a node with Modulo hashing, then switch to the Hash ring and add a node there. Compare the moved keys.
- On the Hash ring, change the number of virtual nodes per node. Watch how even the key counts become.
- Remove a node under each rule. Which keys moved, and where did they go?

## @practice

- Amazon's Dynamo used Consistent hashing with virtual nodes, because random placement of nodes gave uneven load and ignored the different capacity of servers. [Amazon Dynamo](https://www.allthingsdistributed.com/2007/10/amazons_dynamo.html)
- Cassandra places tokens on a ring and uses virtual nodes, so a new node takes data from many neighbours instead of one. [Cassandra architecture](https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html)
- Redis Cluster splits keys into 16384 hash slots and moves slots between nodes when you reshard. [Redis Cluster spec](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
- Discord routes each guild to a node by a lookup on a Hash ring. [Discord Elixir](https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users)
- GitHub's load balancer uses Rendezvous hashing, so adding a server changes only about one row in N. [GitHub GLB Director](https://github.blog/engineering/infrastructure/glb-director-open-source-load-balancer/)
- Cloudflare homes Workers on a ring, so adding a server moves far fewer Workers than a plain hash table would. [Cloudflare shard and conquer](https://blog.cloudflare.com/eliminating-cold-starts-2-shard-and-conquer/)
- In Envoy, ring hash affects about 1/N of the requests when a host changes. Maglev builds its table faster but moves more keys. [Envoy load balancers](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers) and [Maglev paper](https://research.google/pubs/maglev-a-fast-and-reliable-software-network-load-balancer/)

## @extreme

Use the presets in the simulation to push the system until it bends. Watch the moved-keys readout and the per-node counts.

- Add a node: watch how many keys move. By our own count, going from 4 to 5 nodes moves about 4 in 5 keys with Modulo hashing. This is our own calculation, not a number from a source. Compare it with the ring.
- Remove a node: watch where its keys go. With no virtual nodes, the next node clockwise takes all of them and its load jumps. With many virtual nodes, or with Rendezvous hashing, they spread over the other nodes.
- No virtual nodes: each node has one point on the ring. Watch the key counts become uneven. Uneven load was a reason Dynamo moved to virtual nodes, as its paper explains in section 4.2.
- Hot key: one key gets a large share of the requests. Watch one node take the load, whatever the rule. Discord saw a hot partition on a busy channel, as described in its post on [storing trillions of messages](https://discord.com/blog/how-discord-stores-trillions-of-messages).

Uneven load and moving data are two separate problems. Consistent hashing helps with moving data. Virtual nodes help with uneven load. Neither fixes a Hot key.

## @config

This Envoy cluster uses the ring hash policy. The ring size settings decide how many points the ring has, and a larger ring is more even. The backend endpoints (`load_assignment`) and a route `hash_policy` are left out, and the two ring sizes shown are Envoy's defaults. It is a minimal example; see the [Envoy load balancers page](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers) for every option.

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

- [Cassandra architecture, Dynamo](https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html)
- [Redis Cluster specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
- [Envoy supported load balancers](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers)
- [Jump consistent hash paper](https://arxiv.org/abs/1406.2294)
- [Maglev paper](https://research.google/pubs/maglev-a-fast-and-reliable-software-network-load-balancer/)
- [Amazon Dynamo](https://www.allthingsdistributed.com/2007/10/amazons_dynamo.html)
- [Discord, scaling Elixir](https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users)
- [Discord, storing trillions of messages](https://discord.com/blog/how-discord-stores-trillions-of-messages)
- [GitHub GLB Director](https://github.blog/engineering/infrastructure/glb-director-open-source-load-balancer/)
- [Cloudflare, shard and conquer](https://blog.cloudflare.com/eliminating-cold-starts-2-shard-and-conquer/)
