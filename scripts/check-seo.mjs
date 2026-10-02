import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const pages = JSON.parse(await readFile(join(root, "seo/pages.json"), "utf8"));
const sitemap = await readFile(join(root, "dist/sitemap.xml"), "utf8");
const robots = await readFile(join(root, "dist/robots.txt"), "utf8");
const vercel = JSON.parse(await readFile(join(root, "vercel.json"), "utf8"));

assert.match(robots, /Sitemap: https:\/\/f1predict\.dev\/sitemap\.xml/);
assert.equal((sitemap.match(/<url>/g) || []).length, pages.length);
assert.equal(vercel.cleanUrls, true);
assert.equal(vercel.rewrites.some(({ source }) => source === "/(.*)"), false);
assert.equal(vercel.rewrites.find(({ source }) => source === "/predict/:path*")?.destination, "/app");
await stat(join(root, "dist/og-cover.png"));

for (const page of pages) {
  const filename = page.path === "/" ? "index.html" : `${page.path.slice(1)}.html`;
  const html = await readFile(join(root, "dist", filename), "utf8");
  const canonical = `https://f1predict.dev${page.path}`;
  assert.ok(sitemap.includes(`<loc>${canonical}</loc>`), `${page.path} missing from sitemap`);
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}"`), `${page.path} missing canonical`);
  assert.ok(html.includes('<meta name="robots" content="index, follow'), `${page.path} is not indexable`);
  assert.ok(html.includes("<h1"), `${page.path} lacks crawlable heading`);
  assert.ok(html.includes(page.description.replaceAll("&", "&amp;")), `${page.path} metadata mismatch`);
  assert.ok(html.includes("/assets/index-"), `${page.path} lacks app bundle`);
}

for (const path of ["login", "register", "forgot-password", "reset-password", "dashboard", "leaderboard", "predictions", "discussions", "admin", "app", "404"]) {
  const html = await readFile(join(root, "dist", `${path}.html`), "utf8");
  assert.ok(html.includes('content="noindex, nofollow"'), `${path} is indexable`);
  assert.equal(html.includes('rel="canonical"'), false, `${path} has a public canonical`);
}

console.log("SEO build checks passed");
