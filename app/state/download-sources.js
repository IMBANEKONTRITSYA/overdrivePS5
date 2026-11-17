// ../pub-game-store/native/state/download-sources.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: archiveRefusal, so an Archive.org 401/403 is a dead link, not a browser check.
// MODIFIED: an AkiraBox page is not scraped; its link comes from the browser capture.
// MODIFIED: FileKeeper and DataVaults pages are resolved as their own pages do: the countdown, then the free-download form.


  function webURL(value) {
    if (typeof value !== "string" || value.length > 8192 || /[\s\\\x00-\x1f]/.test(value)) throw new Error("Invalid HTTP URL.");
    const match = /^(https?):\/\/([a-z0-9.-]+)(:\d{1,5})?([/?#].*)?$/i.exec(value);
    if (!match || !match[2] || match[2].startsWith(".")) throw new Error("Invalid HTTP URL.");
    return { url: value, host: match[2].toLowerCase(), origin: `${match[1].toLowerCase()}://${match[2]}${match[3] || ""}`, path: match[4] || "/" };
  }
  var hosts2 = {
    mediafire: ["mediafire.com"],
    buzzheavier: ["buzzheavier.com"],
    vikingfile: ["vikingfile.com", "vik1ngfile.site"],
    datanodes: ["datanodes.to"],
    filekeeper: ["filekeeper.net"],
    datavaults: ["datavaults.co"]
  };
  var isHost = (host2, domain) => host2 === domain || host2.endsWith(`.${domain}`);
  // Archive.org answers 401 for a restricted item and 403 for one taken down. Neither is a
  // check a browser can pass: a login there gives the app no access, it only stays in the
  // console's browser. The status, when it is that refusal, else null.
  function archiveRefusal(release, message) {
    try {
      if (!isHost(webURL(release.browserUrl || release.url).host, "archive.org")) return null;
    } catch {
      return null;
    }
    return /\bHTTP (401|403)\b/.exec(message)?.[1] ?? null;
  }
  function sourceKind(release) {
    if (release.manifestUrl) return "manifest";
    const value = release.browserUrl || release.url;
    if (!value) return "unavailable";
    const { host: host2, path } = webURL(value);
    const provider = Object.keys(hosts2).find((name) => hosts2[name].some((domain) => isHost(host2, domain)));
    if (provider === "mediafire" && host2.startsWith("download")) return "direct";
    if (provider === "vikingfile" && /^\/d\//.test(path) && !release.browserUrl) return "direct";
    if (provider) return provider;
    if (host2 === "archive.org" && path.startsWith("/download/") || host2 === "github.com" && path.includes("/releases/download/") || /\.(?:ffpfsc|ffpfs|ffpkg|exfat|pkg|zip|rar|7z)(?:[?#]|$)/i.test(path)) return "direct";
    if (release.requiresBrowser || release.source?.startsWith("pegasus")) return "browser";
    return "direct";
  }
  var decode = (value) => value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  function absolute(value, base) {
    value = decode(value);
    if (value.startsWith("//")) value = `${webURL(base).origin.split(":")[0]}:${value}`;
    else if (value.startsWith("/")) value = webURL(base).origin + value;
    else if (!/^https?:/i.test(value)) value = base.split(/[?#]/)[0].replace(/[^/]*$/, "") + value;
    webURL(value);
    if (base.startsWith("https:") && !value.startsWith("https:")) throw new Error("Provider attempted an insecure redirect.");
    return value;
  }
  function attribute(tag, key) {
    return new RegExp(`(?:^|\\s)${key}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
  }
  function anchor(html, id) {
    const tag = (html.match(/<a\b[^>]*>/gi) || []).find((value) => attribute(value, "id") === id);
    return tag && attribute(tag, "href");
  }
  var BrowserRequired = class extends Error {
    constructor(url, message = "Browser verification required. Open the source, then enter its final file URL.") {
      super(message);
      this.name = "BrowserRequired";
      this.url = webURL(url).url;
    }
  };
  var htmlResponse = (response) => /(?:text\/html|application\/xhtml)/i.test(response.headers?.["content-type"] || "");
  function createSourceResolver({ http }) {
    async function request(url, options = {}) {
      webURL(url);
      const response = await http.request(url, { maxBytes: 1024 * 1024, ...options });
      if (response.status === 404 || response.status === 410) throw new Error(`Source unavailable: HTTP ${response.status}. Choose another source.`);
      if ([401, 403, 429].includes(response.status)) throw new BrowserRequired(url);
      if (!response.ok && !(response.status >= 300 && response.status < 400)) throw new Error(`Provider HTTP ${response.status}.`);
      return response;
    }
    async function direct(url, signal, headers) {
      webURL(url);
      const response = await request(url, { method: "HEAD", signal, headers });
      if (htmlResponse(response)) throw new BrowserRequired(url);
      if (response.status >= 300) throw new BrowserRequired(url, "The final file redirects with custom headers. Choose another source.");
      return { url: webURL(response.url || url).url, headers, rejectHtml: true };
    }
    async function resolve2(release, { signal, directURL, wait } = {}) {
      if (directURL) return direct(directURL, signal);
      const url = release.browserUrl || release.url;
      const kind = sourceKind(release);
      if (kind === "unavailable") throw new Error("Source unavailable: no download URL.");
      if (kind === "direct") return { url: webURL(url).url, rejectHtml: true };
      if (kind === "manifest") throw new Error("Split manifests must be resolved by the queue.");
      if (kind === "browser" || kind === "datanodes" || kind === "akirabox") throw new BrowserRequired(url);
      if (kind === "filekeeper") return filekeeper(url, signal, wait);
      if (kind === "datavaults") return xfilesharing(url, "DataVaults", signal, wait);
      const response = await request(url, { signal });
      const base = response.url || url;
      if (response.headers?.["content-disposition"]?.includes("attachment")) return direct(base, signal);
      const html = await response.text();
      let candidate;
      if (kind === "mediafire") candidate = anchor(html, "downloadButton");
      if (kind === "vikingfile") candidate = anchor(html, "download-link");
      if (kind === "buzzheavier") {
        const button = (html.match(/<[a-z]+\b[^>]*>/gi) || []).find((tag) => attribute(tag, "hx-get")?.includes("/download"));
        const route = button && attribute(button, "hx-get");
        if (route) {
          const next = await request(absolute(route, base), {
            signal,
            followRedirects: false,
            headers: { "HX-Request": "true", "HX-Current-URL": base }
          });
          candidate = next.headers?.["hx-redirect"] || next.headers?.location;
        }
      }
      if (!candidate) throw new BrowserRequired(url);
      return direct(absolute(candidate, base), signal);
    }
    // A page's countdown, waited out as its own script would; `wait` tells the caller how long, so a
    // deadline on the whole resolve can make room for it.
    async function countdown(seconds, signal, wait) {
      const ms = (Math.min(Math.max(seconds, 0), 90) + 1) * 1e3;
      wait?.(ms);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(done, ms);
        function done() {
          signal?.removeEventListener("abort", stop);
          resolve();
        }
        function stop() {
          clearTimeout(timer);
          reject(new Error("Countdown cancelled."));
        }
        if (signal?.aborted) stop();
        else signal?.addEventListener("abort", stop);
      });
    }
    const encodeForm = (form) => Object.entries(form).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`.replace(/%20/g, "+")).join("&");
    // The file link on a file host's last page: an absolute link to another host or a file server
    // subdomain, by its /d/ route or a file name.
    function fileLink(html, pageHost) {
      return (html.match(/<a\b[^>]*>/gi) || []).map((value) => attribute(value, "href")).find((href) => {
        if (!href || !/^https?:\/\//i.test(decode(href))) return false;
        try {
          return webURL(decode(href)).host !== pageHost && /\/d\/|\.(?:7z|rar|zip|pkg|exfat|ffpkg|ffpfs|ffpfsc|bin)(?:[?#]|$)/i.test(decode(href));
        } catch {
          return false;
        }
      });
    }
    const CAPTCHA = /g-recaptcha|h-captcha|cf-turnstile|captcha_code|name=["']code["']/i;
    // Posts a step of a free-download form; the file link it leads to, or null and the next page.
    async function submit(target, form, signal) {
      const answer = await request(target, { method: "POST", body: encodeForm(form), signal, followRedirects: false });
      if (answer.headers?.location) return { link: answer.headers.location };
      if (!answer.ok || answer.headers?.["content-disposition"]) return { link: null, html: "" };
      const html = await answer.text();
      return { link: fileLink(html, webURL(target).host), html };
    }
    // FileKeeper (XFileSharing) waits out a countdown, then its page script posts the free-download
    // form (op=download2, down_direct=1), and the answer redirects to the file. A page that asks for
    // a captcha or a password goes to the browser; a form that yields no link fails over.
    async function filekeeper(url, signal, wait) {
      const response = await request(url, { signal });
      const base = response.url || url;
      const html = await response.text();
      const tag = (html.match(/<[a-z]+\b[^>]*\bdata-code\s*=[^>]*>/gi) || [])[0];
      if (!tag) throw new BrowserRequired(url);
      if (attribute(tag, "data-has-captcha") === "true" || attribute(tag, "data-has-password") === "true") throw new BrowserRequired(url);
      const code = attribute(tag, "data-code");
      if (!code || !/^[a-z0-9]{6,32}$/i.test(code)) throw new BrowserRequired(url);
      await countdown(Number.parseInt(attribute(tag, "data-countdown") || "5", 10) || 5, signal, wait);
      const form = { op: "download2", id: code, rand: attribute(tag, "data-rand") || "", referer: attribute(tag, "data-referer") || "", method_free: attribute(tag, "data-method") || "Free download", down_direct: "1" };
      for (const target of [...new Set([base, url])]) {
        const { link } = await submit(target, form, signal);
        if (link) return direct(absolute(link, target), signal);
      }
      throw new Error("FileKeeper gave no download link. Choose another source.");
    }
    // The fields a form posts: its named inputs (checkboxes only when checked), plus `button`, the
    // submit button the user would press.
    function formFields(html, op, button) {
      const form = (html.match(/<form\b[\s\S]*?<\/form>/gi) || []).find((value) => new RegExp(`name=["']op["'][^>]*value=["']${op}["']|value=["']${op}["'][^>]*name=["']op["']`, "i").test(value));
      if (!form) return null;
      const fields = {};
      for (const tag of form.match(/<input\b[^>]*>/gi) || []) {
        const name = attribute(tag, "name");
        const type = (attribute(tag, "type") || "text").toLowerCase();
        if (!name || type === "submit" || type === "image" || (type === "checkbox" || type === "radio") && !/\schecked\b/i.test(tag)) continue;
        fields[name] = decode(attribute(tag, "value") || "");
      }
      const pressed = (form.match(/<(?:button|input)\b[^>]*>/gi) || []).find((tag) => attribute(tag, "name") === button);
      if (pressed) fields[button] = decode(attribute(pressed, "value") || "");
      return fields;
    }
    // DataVaults (stock XFileSharing): the free-download button posts op=download1, the next page
    // counts down and posts op=download2, whose answer redirects to the file or links it.
    async function xfilesharing(url, name, signal, wait) {
      const response = await request(url, { signal });
      const base = response.url || url;
      let html = await response.text();
      const first = formFields(html, "download1", "method_free");
      if (first) {
        first.method_free || (first.method_free = "Free Download");
        const step = await submit(base, first, signal);
        if (step.link) return direct(absolute(step.link, base), signal);
        html = step.html;
      }
      if (CAPTCHA.test(html) || /name=["']password["']/i.test(html)) throw new BrowserRequired(url);
      const second = formFields(html, "download2", "method_free");
      if (!second) throw new Error(`${name} gave no download form. Choose another source.`);
      const timer = /id=["']countdown[^"']*["'][^>]*>(?:\s*<[^>]+>)*\s*(\d{1,3})\b/i.exec(html);
      if (timer) await countdown(Number(timer[1]), signal, wait);
      const { link } = await submit(base, second, signal);
      if (link) return direct(absolute(link, base), signal);
      throw new Error(`${name} gave no download link. Choose another source.`);
    }
    return { resolve: resolve2 };
  }
  function cancellation() {
    const listeners4 = /* @__PURE__ */ new Set();
    const signal = { aborted: false, addEventListener: (_, fn) => listeners4.add(fn), removeEventListener: (_, fn) => listeners4.delete(fn) };
    return { signal, cancel() {
      signal.aborted = true;
      for (const fn of listeners4) fn();
      listeners4.clear();
    } };
  }

export { archiveRefusal, BrowserRequired, cancellation, createSourceResolver, sourceKind, webURL };
