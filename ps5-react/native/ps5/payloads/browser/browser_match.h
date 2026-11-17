// Adapted from Orbit Store 1.0.1 by saawant12 (https://github.com/saawant12/orbit-store-ps5).
// SPDX-License-Identifier: GPL-3.0-or-later
// Read-only browser capture; original corresponding source is recorded in README.md.
#pragma once
#include <stdbool.h>
#include <stddef.h>
// Overdrive: `prefix` binds a capture to the host the app asked for; the route buffer fits DataNodes' long links.
typedef struct { const char *filename; const char *prefix; char url[1024]; } BrowserMatch;
extern const char *const browser_capture_prefixes[];
extern const size_t browser_capture_prefix_count;
const char *browser_capture_prefix(const char *url);
bool browser_capture_known_prefix(const char *prefix);
bool browser_capture_same_host(const char *a, const char *b);
bool browser_capture_url(const char *filename, const char *url);
bool browser_match(void *context, const unsigned char *bytes, size_t length);
