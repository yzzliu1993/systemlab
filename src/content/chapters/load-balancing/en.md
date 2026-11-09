---
id: load-balancing
title: Load balancing
summary: How to share incoming work between several workers so that no one is swamped while others sit idle.
---

## @situation

A supermarket has six checkout lines. You join the shortest one, but the person in front of you has a full cart and a coupon problem. Counting people in line does not tell you how much work is in line.

## @terms

Tools that do this job:

- [Nginx](https://nginx.org/en/docs/http/ngx_http_upstream_module.html), a web server that can also balance load.
- [HAProxy](https://docs.haproxy.org/3.0/configuration.html), a dedicated load balancer program.
- [AWS Elastic Load Balancing](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html), a managed service on AWS.
- [Envoy](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers), a proxy often used between services.
- [Google Cloud Load Balancing](https://docs.cloud.google.com/load-balancing/docs/load-balancing-overview), a managed service on Google Cloud.

### Load Balancer

The program that receives every incoming Request and decides which Server should handle it. Clients talk to the Load Balancer, not to the servers behind it.

### Server

One machine or process that does the real work. Servers can differ in speed. A Load Balancer usually sits in front of several of them.

### Request

One unit of work sent by a client, such as loading a page or saving a form. Requests are not equal: some take a few milliseconds and some take seconds.

### Round Robin

Send requests to the servers in a fixed order: first, second, third, then back to the first. It is simple and fair in count, but it ignores how busy each Server is.

### Least Connections

Send each new Request to the Server that has the fewest unfinished requests right now. A slow Server collects a queue, so it gets fewer new requests.

### Weighted Round Robin

Round Robin with a weight per Server. A Server with weight 4 gets four turns for each turn of a Server with weight 1. Use it when servers have different speeds.

### Weighted Least Connections

Least Connections that also takes weights into account. It compares unfinished requests relative to each Server's weight, so a strong Server is allowed a longer queue.

### Health check

A regular test that asks each Server whether it can still serve. A Server that fails the Health check is taken out of rotation until it passes again.

## @how

The simulation below shows several servers, each with a queue. Requests arrive over time and the Load Balancer sends each one to a Server using the algorithm you pick. Press play and watch the queues.

The stats show how many requests are finished, failed and still waiting, plus the average and the maximum wait. The compare view runs two algorithms on the same traffic so you can see the difference.

Things to try:

- Run Round Robin, then switch to Least Connections on the same traffic. Which queue grows less?
- Give the servers different speeds. Set the weights to match the speeds, since speed and weight are separate settings. Then compare Round Robin with Weighted Round Robin.
- Open the compare view and look at the maximum wait, not only the average.

## @practice

- Round Robin ignores how costly each Request is and how fast each Server is. [Google SRE book](https://sre.google/sre-book/load-balancing-datacenter/)
- Equal request counts are not equal load. [Dropbox Bandaid](https://dropbox.tech/infrastructure/enhancing-bandaid-load-balancing-at-dropbox-by-leveraging-real-time-backend-server-load-information)
- Dropbox Robinhood adjusts weights from the measured utilization of each node, and it ramps up traffic to a new node slowly. [Dropbox Robinhood](https://dropbox.tech/infrastructure/robinhood-in-house-load-balancing-service)
- Fixed shares of traffic fail when hardware and request costs are mixed. [Cloudflare Unimog](https://blog.cloudflare.com/unimog-cloudflares-edge-load-balancer/)
- AWS Application Load Balancer uses Round Robin by default, and it can instead send each Request to the target with the fewest outstanding requests. [AWS ALB target groups](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html)
- Envoy's least request mode picks two random hosts and sends the Request to the less busy one. [Envoy load balancers](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers)

## @extreme

Use the presets in the simulation to push the system until it bends. Watch the waiting count and the maximum wait.

- Heavy traffic: requests arrive faster than the servers can finish them. Watch the queues grow and the maximum wait climb, whatever algorithm you pick.
- One slow server: Round Robin keeps feeding the slow Server at the same rate. Watch its queue, then switch to Least Connections.
- Mixed request costs: a few very costly requests block a queue. Watch how Round Robin and Least Connections spread them.
- One server goes down: its requests fail and the rest must take the load. Watch the failed count and what happens to the other queues.

These cases happen in real systems too. When a Server dies, its load moves to the others, and that extra load can overload them in turn, as described in the [Google SRE book on cascading failures](https://sre.google/sre-book/addressing-cascading-failures/). Retries make it worse because every failed Request comes back as more work, so retries and backoff are worth reading about in the AWS Builders' Library article [Timeouts, retries and backoff with jitter](https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter). Envoy documents what it does when too many servers are unhealthy, on its [panic threshold](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/panic_threshold) page.

## @config

This Nginx block matches the default servers, with weights 4, 2 and 1, and uses the Weighted Least Connections option. It is a minimal example; see the [Nginx upstream docs](https://nginx.org/en/docs/http/ngx_http_upstream_module.html) for every option.

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
