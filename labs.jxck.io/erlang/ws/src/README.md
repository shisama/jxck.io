
```
+----------+
| http_app |
+----------+
   |            (1_for_all)
   |  +----------+     +-------------------+  +---------------+
   +--| http_sup |--+--| http_acceptor_sup |--| http_acceptor |
      +----------+  |  +-------------------+  +---------------+
                    |                  (s_1_for_1)
                    |  +-----------------+    +-------------+
                    +--| http_worker_sup |----| http_worker |+   +--------------+
                    |  +-----------------+    +-------------+|---| http_handler |
                    |                          +-------------+   +--------------+
                    |                  (s_1_for_1)
                    |  +-----------------+    +-------------+
                    +--| ws_worker_sup   |----| ws_worker   |+
                       +-----------------+    +-------------+|
                                               +-------------+
```