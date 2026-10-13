// Deployed as a Cloudflare Worker at https://ibba-proxy.yanivop.workers.dev
//
// ibasketball.co.il's Cloudflare WAF blocks requests from GitHub Actions'
// IP ranges (confirmed: identical requests succeed from a regular machine,
// get 403 from Actions runners — retries and a browser User-Agent didn't
// help). This proxies only the SportsPress API path through Cloudflare's
// own network instead, which isn't flagged the same way.
//
// To redeploy: Cloudflare dashboard → Workers & Pages → ibba-proxy →
// Edit code → paste this file → Deploy.

const ALLOWED_PREFIX = "/wp-json/sportspress/v2/";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith(ALLOWED_PREFIX)) {
      return new Response("Not found", { status: 404 });
    }

    const upstream = "https://ibasketball.co.il" + url.pathname + url.search;

    const res = await fetch(upstream, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      },
    });

    return new Response(res.body, {
      status: res.status,
      headers: res.headers,
    });
  },
};
