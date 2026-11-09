---
id: load-balancing
title: Load balancing
summary: How one front door shares work among many servers.
---

## @situation

A shop has three counters, but every customer walks to the first one. That counter has a long line while the others sit empty. Someone at the door should point each customer to a counter.

## @terms

### Load Balancer

The part that receives each request and decides which server handles it. It is the person at the door.

### Round Robin

Send requests to the servers one after another, in a fixed order. It is simple, but it ignores how busy each server is.

### Least Connections

Send each request to the server with the fewest open connections right now. It adapts when some requests take longer than others.

## @how

Simulation comes later.

## @practice

- NGINX lets you group servers and pick how requests are shared among them. See the [NGINX upstream module](https://nginx.org/en/docs/http/ngx_http_upstream_module.html).
- Google describes how it balances load inside a datacenter. See the [SRE book chapter](https://sre.google/sre-book/load-balancing-datacenter/).

## @extreme

Settings to push the system come later.

## @config

```nginx
upstream app {
  least_conn;
  server 10.0.0.1;
  server 10.0.0.2;
}
```

## @sources

- [NGINX upstream module](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
- [SRE book chapter](https://sre.google/sre-book/load-balancing-datacenter/)
