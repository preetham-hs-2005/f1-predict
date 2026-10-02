import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const origin = "https://f1predict.dev";
const dist = new URL("../dist/", import.meta.url);
const distPath = fileURLToPath(dist);
const pages = JSON.parse(await readFile(new URL("../seo/pages.json", import.meta.url), "utf8"));
const builtIndex = await readFile(new URL("index.html", dist), "utf8");
const scripts = [...builtIndex.matchAll(/<script\b[^>]*type="module"[^>]*><\/script>/g)].map(([tag]) => tag).join("\n    ");
const styles = [...builtIndex.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(([tag]) => tag).join("\n    ");
if (!scripts || !styles) throw new Error("Vite assets missing from dist/index.html");

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const jsonLd = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const fileFor = (path) => join(distPath, path === "/" ? "index.html" : `${path.slice(1)}.html`);

function documentFor(page, indexable) {
  const url = `${origin}${page.path}`;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description || "");
  const schema = indexable ? [
    { "@context": "https://schema.org", "@type": "WebSite", name: "F1 Predictor Pro", url: origin, description: pages[0].description },
    ...(page.path === "/" ? [{ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "F1 Predictor Pro", url: origin, applicationCategory: "GameApplication", operatingSystem: "Web browser", description: page.description, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }] : [{ "@context": "https://schema.org", "@type": "WebPage", name: page.title, url, description: page.description, isPartOf: { "@type": "WebSite", name: "F1 Predictor Pro", url: origin } }]),
  ] : [];
  const fallback = indexable ? `<main style="max-width:900px;margin:8vh auto;padding:24px;font:16px/1.7 Arial,sans-serif;color:#f3f5f7">
      <nav aria-label="Main navigation" style="display:flex;flex-wrap:wrap;gap:18px;font-size:14px"><a href="/">Home</a><a href="/how-it-works">How it works</a><a href="/standings">Standings</a><a href="/results">Race analysis</a><a href="/register">Join</a></nav>
      <h1 style="margin-top:48px;line-height:1.15">${escapeHtml(page.heading)}</h1>
      ${page.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n      ")}
      ${(page.questions || []).map(({ question, answer }) => `<section><h2>${escapeHtml(question)}</h2><p>${escapeHtml(answer)}</p></section>`).join("\n      ")}
      <p><a href="/how-it-works">Learn how predictions work</a> · <a href="/register">Create an account</a></p>
    </main>` : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#101411" />
    <meta name="robots" content="${indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow"}" />
    <meta name="author" content="F1 Predictor Pro" />
    <title>${title}</title>
    ${indexable ? `<meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="F1 Predictor Pro" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${origin}/og-cover.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${origin}/og-cover.png" />
    ${schema.map((item) => `<script type="application/ld+json">${jsonLd(item)}</script>`).join("\n    ")}` : ""}
    <link rel="icon" href="/favicon.ico" />
    ${styles}
    ${scripts}
  </head>
  <body style="margin:0;background:#111317">
    <div id="root">${fallback}</div>
  </body>
</html>`;
}

for (const page of pages) await writeFile(fileFor(page.path), documentFor(page, true));
for (const path of ["/login", "/register", "/forgot-password", "/reset-password", "/dashboard", "/leaderboard", "/predictions", "/discussions", "/admin", "/app"]) {
  await writeFile(fileFor(path), documentFor({ path, title: "F1 Predictor Pro", description: "" }, false));
}
await writeFile(join(distPath, "404.html"), documentFor({ path: "/404", title: "Page not found | F1 Predictor Pro", description: "" }, false));
await writeFile(join(distPath, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((page) => `  <url><loc>${origin}${page.path}</loc></url>`).join("\n")}\n</urlset>\n`);
console.log(`Generated ${pages.length} public pages, private noindex shells, and sitemap.xml`);
