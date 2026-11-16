// ../pub-game-store/native/state/host-health.js
// MODIFIED: new. Remembers hosts that do not answer on this network, so sources on them rank last and
// a blocked Vikingfile domain gives way to its mirror.

import { savedList } from './saved.js';

  // A host that gave no answer (no TCP connection, no DNS, a timeout) is remembered this long. A
  // provider block on the console's network rarely lifts within an hour; a host that is merely down
  // gets another chance afterwards.
  var TTL_MS = 6 * 3600e3;
  // Vikingfile serves the same files from two domains; a block on one is dodged by the other.
  var MIRRORS = { "vikingfile.com": "vik1ngfile.site", "vik1ngfile.site": "vikingfile.com" };
  var hosts = savedList("hosts.json", "host health");
  function hostOf(url) {
    const match = /^https?:\/\/([^/?#:]+)/i.exec(String(url || ""));
    return match ? match[1].toLowerCase().replace(/^www\./, "") : null;
  }
  // No answer from this host within the memory, or null.
  function unreachableSince(url) {
    const host2 = hostOf(url);
    const at = host2 && hosts.get()[host2];
    return typeof at === "number" && Date.now() - at < TTL_MS ? at : null;
  }
  // Whether a source on this URL has no reachable host: its own, and a mirror's if it has one.
  var unreachableSource = (url) => Boolean(unreachableSince(url)) && (!MIRRORS[hostOf(url)] || Boolean(unreachableSince(alternateOf(url))));
  function alternateOf(url) {
    const host2 = hostOf(url);
    const mirror = host2 && MIRRORS[host2];
    return mirror ? String(url).replace(/^(https?:\/\/)(?:www\.)?[^/?#:]+/i, `$1${mirror}`) : null;
  }
  // vikingfile.com itself redirects to vik1ngfile.site, so the mirror is the domain every network
  // must reach anyway; going there first skips a block on the first hop.
  var PREFERRED = { "vikingfile.com": "vik1ngfile.site" };
  // The URL to try: the preferred domain of the pair, unless it is remembered as silent and the other is not.
  function reachableURL(url) {
    const mirror = alternateOf(url);
    if (!mirror) return url;
    const first = PREFERRED[hostOf(url)] ? mirror : url;
    const second = first === url ? mirror : url;
    return unreachableSince(first) && !unreachableSince(second) ? second : first;
  }
  function markUnreachable(url) {
    const host2 = hostOf(url);
    if (!host2) return;
    console.log(`[host-health] ${host2} did not answer; its sources rank last for ${TTL_MS / 3600e3} hours`);
    hosts.set({ ...hosts.get(), [host2]: Date.now() });
  }
  function markReachable(url) {
    const host2 = hostOf(url);
    const all = hosts.get();
    if (!host2 || !(host2 in all)) return;
    const { [host2]: _, ...rest } = all;
    hosts.set(rest);
  }
  // A transport failure: nothing answered. An HTTP status, a browser check or a bad file is an answer.
  var NO_ANSWER = /timed out|timeout|could not connect|couldn't connect|connection refused|connection reset|resolve host|unreachable|no route|network is down|network unreachable|did not answer/i;
  var noAnswer = (message) => NO_ANSWER.test(message || "") && !/\bHTTP \d{3}\b|browser verification/i.test(message || "");
  var useHostHealth = hosts.useList;

export { alternateOf, hostOf, markReachable, markUnreachable, noAnswer, reachableURL, unreachableSince, unreachableSource, useHostHealth };
