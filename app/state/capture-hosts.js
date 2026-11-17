// ../pub-game-store/native/state/capture-hosts.js
// MODIFIED: new. The hosts whose final link the browser capture can pick up, and what each needs.

import { sourceKind, webURL } from './download-sources.js';
import { VIKING_PREFIX, capturedVikingFile, describeVikingCapture, linkPageMetadata, validateVikingCapture, vikingLinkPage } from './viking-capture.js';

  // Each host: the display name, the prefix the native matcher scans for (its route shape lives in
  // ps5-react/native/ps5/payloads/browser/browser_url.c), the page domains, the hosts a captured
  // link may transfer from, whether the route names the file, and whether the server gives a
  // stable identity (etag or last-modified) that resume can rely on.
  var HOSTS = {
    vikingfile: { name: "Vikingfile", prefix: VIKING_PREFIX, pages: ["vikingfile.com", "vik1ngfile.site"], transfer: (host2) => ["vikingfile.com", "ar.vikingfile.com", "vik1ngfile.site"].includes(host2), named: true, identity: true },
    akirabox: { name: "AkiraBox", prefix: "https://akirabox.com/download/", pages: ["akirabox.com", "akirabox.to"], transfer: (host2) => ["akirabox.com", "akirabox.to"].includes(host2), named: true, identity: true },
    datanodes: { name: "DataNodes", prefix: "https://tunnel", pages: ["datanodes.to", "datanodes.co"], transfer: (host2) => /^tunnel\d{1,3}\.dlproxy\.uk$/.test(host2), named: false, identity: false }
  };
  var LINK_PAGE_HOSTS = [["vikingfile", /viki/i], ["datanodes", /datanodes/i], ["akirabox", /akira/i]];
  // The capture host of a release: its own, or the one a link page (link-vault.org/...#DataNodes) leads to.
  function captureHost(release) {
    const kind = sourceKind(release);
    if (HOSTS[kind]) return kind;
    if (kind !== "browser") return null;
    const url = release.browserUrl || release.url || "";
    const hint = `${release.label || ""} ${url.includes("#") ? url.slice(url.indexOf("#")) : ""}`;
    return LINK_PAGE_HOSTS.find(([, pattern]) => pattern.test(hint))?.[0] ?? null;
  }
  var isLinkPage = (release) => sourceKind(release) === "browser";
  var hostName = (key) => HOSTS[key]?.name ?? "Vikingfile";
  function capturePrefix(key, release) {
    if (key === "akirabox") {
      try {
        if (webURL(release.browserUrl || release.url).host === "akirabox.to") return "https://akirabox.to/download/";
      } catch {
      }
    }
    return HOSTS[key].prefix;
  }
  async function describeCapture(http, key, release, signal) {
    if (key === "vikingfile" && !isLinkPage(release)) return describeVikingCapture(http, release, signal);
    return linkPageMetadata(release);
  }
  function usableName(filename) {
    return Boolean(filename) && encodeURIComponent(filename).replace(/%[a-f0-9]{2}|./gi, "x").length <= 160 && !/[\/\\\x00-\x1f\x7f]/.test(filename) && !/^\.+$/.test(filename);
  }
  async function rangeProbe(http, url, signal) {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await http.request(url, { method: "GET", headers: { Range: "bytes=0-0" }, signal, maxBytes: 8192, followRedirects: false });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location2 = response.headers?.location;
      if (!location2 || redirects === 5) throw new Error("Captured file exceeded its redirect limit.");
      url = location2.startsWith("/") && !location2.startsWith("//") ? webURL(url).origin + location2 : location2;
    }
  }
  var CATALOG_SLACK = 2 ** 30;
  // A captured link against what the host and the catalog say about the file, before it is trusted.
  async function validateCapture(http, key, url, metadata, signal) {
    if (key === "vikingfile") return validateVikingCapture(http, url, metadata.filename ? metadata : capturedVikingFile(url, metadata), signal);
    const host2 = HOSTS[key];
    const parsed = webURL(url);
    if (!url.startsWith("https://") || parsed.origin !== `https://${parsed.host}` || parsed.path.includes("#") || !host2.transfer(parsed.host))
      throw new Error("Captured file redirected to an unsupported download host.");
    let filename = metadata.filename || "";
    if (host2.named) {
      try {
        filename = decodeURIComponent(parsed.path.split("?")[0].split("/").pop() || "");
      } catch {
        filename = "";
      }
      if (!usableName(filename)) throw new Error("Captured link does not name a usable file.");
      if (metadata.part && !new RegExp(`part[\\s._-]*0*${metadata.part}(?!\\d)`, "i").test(filename))
        throw new Error(`Captured file is not part ${metadata.part}. Reopen the page and download that part.`);
    }
    const response = await rangeProbe(http, url, signal);
    const range = /^bytes 0-0\/(\d+)$/i.exec(response.headers?.["content-range"] || "");
    const bytes = Number(range?.[1]);
    if (!response.ok || response.status !== 206 || Number(response.headers?.["content-length"]) !== 1 || /html|json|xml|text\//i.test(response.headers?.["content-type"] || "") || (await response.text()).length !== 1 || !Number.isSafeInteger(bytes) || bytes <= 0)
      throw new Error("Captured file failed validation or expired. Reopen the page and retry.");
    if (metadata.catalogBytes && Math.abs(bytes - metadata.catalogBytes) > CATALOG_SLACK)
      throw new Error("Captured file is not the size the catalog lists. Reopen the page and retry.");
    const disposition = response.headers?.["content-disposition"];
    if (disposition) {
      const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
      const plain2 = /filename=(?:"([^"]+)"|([^;]+))/i.exec(disposition);
      const named = encoded ? decodeURIComponent(encoded) : plain2?.[1] || plain2?.[2]?.trim();
      if (named && filename && named !== filename) throw new Error("Captured response names a different file.");
      if (named && !filename && usableName(named)) filename = named;
    }
    if (host2.identity) {
      const etag = response.headers?.etag;
      if (!/^"[^"\x00-\x20\x7f]*"$/.test(etag || "") && !Number.isFinite(Date.parse(response.headers?.["last-modified"] || "")))
        throw new Error("Captured file has no stable identity. Reopen the page and retry.");
    }
    return { url, expectedBytes: bytes, filename };
  }

export { captureHost, capturePrefix, describeCapture, hostName, validateCapture };
