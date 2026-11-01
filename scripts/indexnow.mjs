// Tells Bing (and the other IndexNow search engines) that the public pages changed, so ChatGPT search and Bing read them again within days.
// Run after a push that changes public pages: npm run indexnow
const SITE = "https://jobpipe.in";
// Proved by public/<key>.txt, which holds the same key. Not a secret.
const KEY = "e46e3fffed3b3f1509df1472480ed4fb";

const sitemap = await (await fetch(`${SITE}/sitemap.xml`)).text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: "jobpipe.in", key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList }),
});
// 200 and 202 both mean accepted.
console.log(`IndexNow: ${res.status} for ${urlList.length} pages`);
if (!res.ok && res.status !== 202) process.exit(1);
