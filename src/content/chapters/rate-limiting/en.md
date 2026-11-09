---
id: rate-limiting
title: Rate limiting
summary: How a system says "not so fast" to keep itself standing when too many requests arrive.
---

## @situation

A theme park ride lets a fixed number of people board every minute. A small waiting area sits in front of it. When the area is full, the staff tell newcomers to come back later. The ride keeps running, and nobody is crushed at the gate.

## @terms

Many tools can limit requests. These are good ones to look up first.

- [Nginx limit_req](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html): a module of the Nginx web server that limits how fast requests may arrive.
- [Amazon API Gateway throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html): a rate and a burst limit on the APIs you host there.
- [Envoy rate limiting](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/other_features/global_rate_limiting): Envoy proxies can ask a shared rate limit service whether a request may pass.
- [Google Cloud Armor rate limiting](https://docs.cloud.google.com/armor/docs/rate-limiting-overview): rules that throttle or ban clients, for example by their IP address.

Public APIs are a good way to learn too. [GitHub](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [Stripe](https://docs.stripe.com/rate-limits), [Shopify](https://shopify.dev/docs/api/usage/rate-limits) and [Discord](https://docs.discord.com/developers/topics/rate-limits) all publish their limits and the response headers that report them.

Vendors do not use the bucket names the same way. Nginx calls its limiter a leaky bucket. API Gateway calls its limiter a token bucket. Read each tool's own page before you trust a name.

### Rate limiting

A rule that caps how many requests a client may make in a period of time. Requests over the cap are turned away or delayed. It protects a server from being flooded.

### Token bucket

A bucket that gets new tokens at a steady speed, up to a maximum. Each request takes one token. If the bucket is empty, the request is refused. A full bucket lets a short burst through.

### Leaky bucket

Requests drop into a bucket and leave it at a steady speed, like water through a small hole. If the bucket is full, new requests spill over and are refused. The output is smooth, even when the input is not.

### Fixed window

Count requests in fixed slices of time, such as each minute. When the count passes the limit, refuse the rest until the next slice starts. It is simple, but a client can send a full load at the end of one slice and another at the start of the next.

### Sliding window

Count requests over the last stretch of time, which moves forward with the clock. This avoids the sharp edge between two fixed windows. Some systems estimate it from a few counters to save memory.

### Burst

A sudden pile of requests in a short time. A limiter often allows some burst on purpose, because real traffic is not perfectly even.

### 429 Too Many Requests

The HTTP status code that means the client sent too many requests. It is defined in [RFC 6585](https://www.rfc-editor.org/rfc/rfc6585.html). Some tools use other codes for the same case, so check your tool.

### Retry-After

An HTTP header that tells the client how long to wait before trying again. It is defined in [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html). A 429 response may include it, but it does not have to.

### Backoff with jitter

When a request fails, the client waits longer after each try, and adds a random bit to the wait. The longer waits slow the retries down. The random bit stops many clients from retrying at the same moment.

### Load shedding

When a server is overloaded, it drops some work on purpose and early. This keeps the work it does accept fast. It is about the server's health, not about who sent the request.

### Concurrency limit

A cap on how many requests are in progress at the same time, instead of how many arrive per second. If requests get slow, fewer can be in flight, so the cap reacts to the server's real state.

## @how

The simulation below has three parts. Clients send requests. The limiter decides which ones may pass. The server works on the accepted requests through a queue. You will see these numbers: accepted, rejected, shed, retries and latency.

Rejected means the limiter said no. Shed means the server gave up on a request because it was overloaded. Retries count how often clients tried again. Latency is how long accepted requests waited.

Things to try:

- Raise the request rate above the limit and watch the rejected count grow while latency stays flat.
- Turn on retries and see how they add load on top of the traffic you already had.
- Change the burst size and see how many requests pass in one go.

## @practice

- Stripe runs several kinds of limiters and also load shedders, and it advises that a limiter should fail open if the limiter itself breaks. See [Stripe on rate limiters](https://stripe.com/blog/rate-limiters).
- Cloudflare estimates a sliding window from two counters instead of storing every request. See [Cloudflare on counting things](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/).
- Figma kept its counters in Redis and used a shadow ban against abusers. See [Figma on rate limiting](https://www.figma.com/blog/an-alternative-approach-to-rate-limiting).
- Netflix argues for limiting concurrent requests instead of a fixed rate, and shares a library for it. See [Netflix concurrency-limits](https://github.com/Netflix/concurrency-limits).
- GitHub sends rate limit headers and asks clients to honor retry-after and to back off. The status can be 403 or 429. See [GitHub REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).
- Discord sends Retry-After when it answers 429. See [Discord rate limits](https://docs.discord.com/developers/topics/rate-limits).
- Shopify gives each app its own bucket. See [Shopify API rate limits](https://shopify.dev/docs/api/usage/rate-limits).

## @extreme

Pick a preset in the simulation, or set the values yourself. Each one pushes the system in a different way.

- Burst bigger than the bucket: send more at once than the bucket can hold. The extra requests are refused. Amazon API Gateway answers with 429 when a burst limit is passed, and Nginx refuses what is past its burst. See [API Gateway throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html) and [Nginx limit_req](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html).
- Noisy client: one client sends far more than the rest. With one shared limit, it starves the others. Limits per client fix this, as in [API Gateway usage plans](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html) and [Cloud Armor rate limiting](https://docs.cloud.google.com/armor/docs/rate-limiting-overview), which can key on the client.
- Retry storm: rejected clients retry at once and multiply the load. Retries need backoff with jitter. See [AWS on timeouts, retries and backoff with jitter](https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter) and [Google SRE on cascading failures](https://sre.google/sre-book/addressing-cascading-failures/).
- Load shedding on and off: with shedding on, the server drops work early and latency stays bounded. With it off, the queue grows and everyone waits. See [AWS on load shedding](https://builder.aws.com/content/3Eun1EEyX6p2e3VYNyRLSJzLuMV/using-load-shedding-to-avoid-overload) and [Google SRE on cascading failures](https://sre.google/sre-book/addressing-cascading-failures/). Envoy's [circuit breaking](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/circuit_breaking) also caps pending requests and fails fast.

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

This is a minimal example. It limits each client address to a steady rate with a burst allowance, and answers 429 past that. See the [Nginx limit_req docs](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html) for every option.

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
