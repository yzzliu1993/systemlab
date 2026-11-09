---
id: load-balancing
title: 負載平衡
summary: 一個入口如何把工作分給許多伺服器。
---

## @situation

一間店有三個櫃檯，但每位客人都走向第一個。那個櫃檯排了長長的隊，其他櫃檯卻空著。門口需要有人指引每位客人去哪個櫃檯。

## @terms

### 負載平衡器

接收每個請求，並決定由哪台伺服器處理的部分。就像站在門口的人。

### 輪詢

依固定順序，一台接著一台輪流分配請求。做法簡單，但不看每台伺服器有多忙。

### 最少連線

把每個請求交給目前連線最少的伺服器。當有些請求花比較久時，它能自動調整。

## @how

模擬稍後加入。

## @practice

- NGINX 可以把伺服器分組，並選擇如何分配請求。請見 [NGINX upstream 模組](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)。
- Google 說明了它在資料中心內如何平衡負載。請見 [SRE 書籍章節](https://sre.google/sre-book/load-balancing-datacenter/)。

## @extreme

讓系統撐到極限的設定稍後加入。

## @config

```nginx
upstream app {
  least_conn;
  server 10.0.0.1;
  server 10.0.0.2;
}
```

## @sources

- [NGINX upstream 模組](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
- [SRE 書籍章節](https://sre.google/sre-book/load-balancing-datacenter/)
