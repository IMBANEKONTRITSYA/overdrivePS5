#include "browser_match.h"
#include "browser_scan.h"
#include <assert.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
typedef struct { unsigned char *bytes; size_t length; int hole, cancelled; } Memory;
static bool active(void *context) { return !((Memory *)context)->cancelled; }
static int read_memory(void *context, uint64_t at, void *out, size_t length) {
  Memory *memory = context;
  if (memory->hole && at >= PROBE_CHUNK && at < 2 * PROBE_CHUNK) return -1;
  assert(at + length <= memory->length);
  memcpy(out, memory->bytes + at, length); return 0;
}
static ProbeResult scan(Memory *memory, BrowserMatch *match, uint64_t budget) {
  ProbeReader reader = {.context = memory, .read = read_memory, .active = active,
    .match = browser_match, .match_context = match, .remaining = budget};
  return probe_scan_region(&reader, 0, memory->length, "https://vikingfile.com/d/");
}
int main(void) {
  const char *url = "https://vikingfile.com/d/Ab01234567/Game%20DLC.pkg";
  BrowserMatch match = {.filename = "Game DLC.pkg"};
  assert(browser_capture_url(match.filename, url));
  assert(!browser_capture_url("Other.pkg", url));
  assert(browser_capture_url("", url));
  assert(browser_capture_url("Game DLC.pkg", "https://vik1ngfile.site/d/Ab01234567/Game%20DLC.pkg"));
  assert(!browser_capture_url("Game DLC.pkg", "https://vik1ngfile.site.evil.test/d/Ab01234567/Game%20DLC.pkg"));
  assert(!browser_capture_url("", "https://vikingfile.com/d/Ab01234567/"));
  assert(!browser_capture_url("", "https://vikingfile.com/d/Ab01234567/a%2Fb.rar"));
  assert(!browser_capture_url("", "https://vikingfile.com/d/Ab01234567/a%5Cb.rar"));
  assert(!browser_capture_url("", "https://vikingfile.com/d/Ab01234567/a%0Ab.rar"));
  assert(!browser_capture_url(match.filename, "https://vikingfile.com.evil.test/d/Ab01234567/Game%20DLC.pkg"));
  assert(!browser_capture_url(match.filename, "https://vikingfile.com/d/Ab01234567/Game%20DLC.pkg?x=1"));
  Memory memory = {.length = 3 * PROBE_CHUNK};
  memory.bytes = calloc(1, memory.length); assert(memory.bytes);
  for (size_t step = 1; step <= 2; step++) {
    memset(memory.bytes, 0, memory.length); memset(match.url, 0, sizeof match.url);
    const size_t offset = PROBE_CHUNK - 21;
    for (size_t i = 0; i < strlen(url); i++) memory.bytes[offset + i * step] = (unsigned char)url[i];
    assert(scan(&memory, &match, memory.length) == PROBE_FOUND);
    assert(!strcmp(match.url, url));
    memory.hole = 1;
    assert(scan(&memory, &match, memory.length) == PROBE_ABSENT);
    memory.hole = 0;
    assert(scan(&memory, &match, 10) == PROBE_BUDGET);
    memory.cancelled = 1;
    assert(scan(&memory, &match, memory.length) == PROBE_STOPPED);
    memory.cancelled = 0;
  }
  // A complete terminator is required; no clipped or prefixed URL may be returned.
  assert(!browser_match(&match, (const unsigned char *)url, strlen(url)));
  char prefixed[600]; snprintf(prefixed, sizeof prefixed, "x%s", url);
  assert(!browser_match(&match, (const unsigned char *)prefixed, strlen(prefixed) + 1));
  // The selected public page uses punctuation that the catalog's synthetic name loses.
  match.filename = "G_02225(v02.024)-[DLPSGAME.COM].rar";
  const char *real_name_routes[] = {
    "https://vikingfile.com/d/Ab01234567/G_02225(v02.024)-[DLPSGAME.COM].rar",
    "https://vikingfile.com/d/Ab01234567/G_02225%28v02.024%29-%5BDLPSGAME.COM%5D.rar",
    "https://vik1ngfile.site/d/Ab01234567/G_02225%28v02.024%29-%5BDLPSGAME.COM%5D.rar"
  };
  for (size_t route = 0; route < 3; route++) {
    for (size_t step = 1; step <= 2; step++) {
      memset(memory.bytes, 0, memory.length);
      const char *candidate = real_name_routes[route];
      const size_t offset = PROBE_CHUNK - 21;
      for (size_t i = 0; i < strlen(candidate); i++) memory.bytes[offset + i * step] = (unsigned char)candidate[i];
      assert(scan(&memory, &match, memory.length) == PROBE_FOUND);
      assert(!strcmp(match.url, candidate));
    }
  }
  // Overdrive: AkiraBox and DataNodes routes, and a capture bound to the host it asked for.
  const char *akira = "https://akirabox.com/download/e1.gtv9Fj9Y8vu_z9dJ_87aIiL-mBMJAzbx6GkR4zDRU1AXDk3dBwDZYsPVHo5gU_zm/PPSA28000.7z";
  assert(browser_capture_url("PPSA28000.7z", akira));
  assert(browser_capture_url("", akira));
  assert(!browser_capture_url("Other.7z", akira));
  assert(!browser_capture_url("", "https://akirabox.com/download/short/PPSA28000.7z"));
  assert(!browser_capture_url("", "https://akirabox.com.evil.test/download/e1.gtv9Fj9Y8vu_z9dJ_87aIiL/PPSA28000.7z"));
  char nodes[700];
  snprintf(nodes, sizeof nodes, "https://tunnel5.dlproxy.uk/download/%0*d?sig=OlKANsG4ULpRrih41ZZ3frw4RLjpCyB0IP-0TF1xk5I", 430, 7);
  assert(browser_capture_url("", nodes));
  assert(!browser_capture_url("PPSA28000.7z", nodes));
  assert(!browser_capture_url("", "https://tunnel5.dlproxy.uk/download/abcdefghijklmnopqrstuvwxyz"));
  assert(!browser_capture_url("", "https://tunnel5.dlproxy.uk.evil.test/download/abcdefghijklmnopqrstuvwxyz?sig=abcdefghijklmnopqrstuvwxyz"));
  assert(!browser_capture_url("", "https://tunnelx.dlproxy.uk/download/abcdefghijklmnopqrstuvwxyz?sig=abcdefghijklmnopqrstuvwxyz"));
  BrowserMatch bound = {.filename = "", .prefix = "https://tunnel"};
  memset(memory.bytes, 0, memory.length);
  for (size_t i = 0; i < strlen(nodes); i++) memory.bytes[PROBE_CHUNK - 21 + i] = (unsigned char)nodes[i];
  {
    ProbeReader reader = {.context = &memory, .read = read_memory, .active = active,
      .match = browser_match, .match_context = &bound, .remaining = memory.length};
    assert(probe_scan_region(&reader, 0, memory.length, "https://tunnel") == PROBE_FOUND);
    assert(!strcmp(bound.url, nodes));
  }
  // The same bytes hold no Vikingfile route, so a Vikingfile-bound capture finds nothing.
  BrowserMatch other = {.filename = "", .prefix = "https://vikingfile.com/d/"};
  assert(!browser_match(&other, memory.bytes, memory.length));
  memset(memory.bytes, 0, memory.length);
  for (size_t i = 0; i < strlen(url); i++) memory.bytes[PROBE_CHUNK - 21 + i] = (unsigned char)url[i];
  assert(!browser_match(&bound, memory.bytes, memory.length));
  assert(browser_capture_known_prefix("https://akirabox.to/download/") && !browser_capture_known_prefix("https://akirabox.to/"));
  // A Vikingfile-bound capture still accepts the mirror domain, the page redirects there.
  BrowserMatch viking = {.filename = "", .prefix = "https://vikingfile.com/d/"};
  const char *mirror = "https://vik1ngfile.site/d/Ab01234567/Game.pkg";
  memset(memory.bytes, 0, memory.length);
  for (size_t i = 0; i < strlen(mirror); i++) memory.bytes[PROBE_CHUNK - 21 + i] = (unsigned char)mirror[i];
  assert(browser_match(&viking, memory.bytes, memory.length) && !strcmp(viking.url, mirror));
  assert(!browser_match(&bound, memory.bytes, memory.length));
  free(memory.bytes);
  puts("browser matcher/scanner: ASCII, UTF-16, block overlap, holes, cancellation, budget, URL binding and host shapes passed");
}
