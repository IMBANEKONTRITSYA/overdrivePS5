// Adapted from Orbit Store 1.0.1 by saawant12 (https://github.com/saawant12/orbit-store-ps5).
// SPDX-License-Identifier: GPL-3.0-or-later
// Read-only browser capture; original corresponding source is recorded in README.md.
// Overdrive: the single Vikingfile route shape became a table of host shapes (see README.md).
#include "browser_match.h"
#include <string.h>
static int hex(unsigned char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}
static bool alnum(unsigned char c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
}
static bool token(unsigned char c) { return alnum(c) || c == '-' || c == '_' || c == '.'; }
// Each download host's final link, as the browser holds it once its check is passed:
//   SHAPE_VIKING     <prefix><10 alphanumerics>/<filename>          Vikingfile (vikingfile.com moved to vik1ngfile.site)
//   SHAPE_TOKEN_FILE <prefix><token>/<filename>                     AkiraBox
//   SHAPE_DATANODES  https://tunnel<n>.dlproxy.uk/download/<token>?sig=<token>   DataNodes' download proxy; no filename
typedef enum { SHAPE_VIKING, SHAPE_TOKEN_FILE, SHAPE_DATANODES } Shape;
static const struct { const char *prefix; Shape shape; } SHAPES[] = {
  {"https://vikingfile.com/d/", SHAPE_VIKING},
  {"https://vik1ngfile.site/d/", SHAPE_VIKING},
  {"https://akirabox.com/download/", SHAPE_TOKEN_FILE},
  {"https://akirabox.to/download/", SHAPE_TOKEN_FILE},
  {"https://tunnel", SHAPE_DATANODES},
};
const char *const browser_capture_prefixes[] = {
  "https://vikingfile.com/d/", "https://vik1ngfile.site/d/", "https://akirabox.com/download/", "https://akirabox.to/download/", "https://tunnel"
};
const size_t browser_capture_prefix_count = sizeof browser_capture_prefixes / sizeof *browser_capture_prefixes;
const char *browser_capture_prefix(const char *url) {
  for (size_t i = 0; i < browser_capture_prefix_count; i++)
    if (!strncmp(url, browser_capture_prefixes[i], strlen(browser_capture_prefixes[i]))) return browser_capture_prefixes[i];
  return NULL;
}
bool browser_capture_known_prefix(const char *prefix) {
  for (size_t i = 0; i < browser_capture_prefix_count; i++)
    if (!strcmp(prefix, browser_capture_prefixes[i])) return true;
  return false;
}
static Shape shape_of(const char *prefix) {
  for (size_t i = 0; i < sizeof SHAPES / sizeof *SHAPES; i++)
    if (!strcmp(prefix, SHAPES[i].prefix)) return SHAPES[i].shape;
  return SHAPE_VIKING;
}
// Prefixes of one host (its two domains) share a shape; a capture bound to one accepts the other.
bool browser_capture_same_host(const char *a, const char *b) {
  return !strcmp(a, b) || (browser_capture_known_prefix(a) && browser_capture_known_prefix(b) && shape_of(a) == shape_of(b));
}
// The percent-encoded tail of a route against the expected filename; an empty filename accepts any
// safe one, since link pages don't tell which file they lead to.
static bool filename_matches(const char *filename, const unsigned char *p) {
  const unsigned char *expected = (const void *)filename;
  const bool any = !*filename;
  if (any && !*p) return false;
  for (; *p; p++) {
    unsigned char c = *p;
    if (c == '%') {
      if (!p[1] || !p[2] || hex(p[1]) < 0 || hex(p[2]) < 0) return false;
      c = (unsigned char)(hex(p[1]) * 16 + hex(p[2])); p += 2;
    } else if (c <= 32 || c >= 127 || c == '?' || c == '#' || c == '/' || c == '\\') return false;
    if (any) {
      if (c < 32 || c == 127 || c == '/' || c == '\\') return false;
    } else if (!*expected || c != *expected++) return false;
  }
  return !*expected;
}
bool browser_capture_url(const char *filename, const char *url) {
  if (!filename || !url) return false;
  const char *prefix = browser_capture_prefix(url);
  if (!prefix) return false;
  const unsigned char *p = (const void *)(url + strlen(prefix));
  switch (shape_of(prefix)) {
  case SHAPE_VIKING:
    if (strlen((const char *)p) < 12 || p[10] != '/') return false;
    for (size_t i = 0; i < 10; i++) if (!alnum(p[i])) return false;
    return filename_matches(filename, p + 11);
  case SHAPE_TOKEN_FILE: {
    size_t i = 0;
    while (token(p[i])) i++;
    if (i < 8 || i > 1024 || p[i] != '/') return false;
    return filename_matches(filename, p + i + 1);
  }
  case SHAPE_DATANODES: {
    // Only a link page's "any file" request fits a route that names no file.
    if (*filename) return false;
    size_t i = 0;
    while (p[i] >= '0' && p[i] <= '9') i++;
    if (!i || i > 3) return false;
    static const char host[] = ".dlproxy.uk/download/";
    if (strncmp((const char *)p + i, host, sizeof host - 1)) return false;
    p += i + sizeof host - 1;
    i = 0;
    while (alnum(p[i]) || p[i] == '-' || p[i] == '_') i++;
    if (i < 16 || i > 1024 || strncmp((const char *)p + i, "?sig=", 5)) return false;
    p += i + 5;
    i = 0;
    while (alnum(p[i]) || p[i] == '-' || p[i] == '_') i++;
    return i >= 16 && !p[i];
  }
  }
  return false;
}
