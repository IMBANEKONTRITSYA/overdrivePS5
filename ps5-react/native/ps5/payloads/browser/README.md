# Browser capture provenance

`browser_platform.c/.h`, `browser_scan.c/.h` and `browser_match.c` are adapted
from saawant12/Orbit Store 1.0.1, distributed under GPL-3.0-or-later.
Source bundle: https://github.com/saawant12/orbit-store-ps5/releases/download/v1.0.0/orbit-store-1.0.1-source-bundle.zip
The bundle contains `orbit-store-1.0.1-source.tar.gz`, backend/browser_*.
`browser_url.c` adapts the filename-bound route validation in backend/providers.c.
The release/catalog dependency was replaced by an explicit selected filename.

Only the uniquely identified SceNKNetworkProcess/SceNKNetworkProc is read.
Identity is rechecked before reads; no executable/file-backed pages, writes,
cookies, dumps or arbitrary process selectors. Each session has a 128 MiB total
read budget, 64 KiB reads separated by 32 ms, and a maximum 180-second deadline.
Only a complete URL matching the requested host's route shape is returned. Buffers are wiped.

Overdrive extends the route table in `browser_url.c` beyond Vikingfile: AkiraBox
(`/download/<token>/<filename>`) and DataNodes' download proxy
(`tunnel<n>.dlproxy.uk/download/<token>?sig=<token>`), each capture bound to the
prefix the app asked for; the route buffer grew to 1024 bytes for the latter.
