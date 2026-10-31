import type { MetadataRoute } from "next";

// The app's own pages sit behind a sign-in, so keep search engines to the front page, the policy pages,
// the share image and Google's ownership file.
const APP = ["/chat", "/companies", "/jobs", "/messages", "/network", "/resume", "/stories", "/tracker", "/tracks", "/waitlist"];

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: APP }, sitemap: "https://jobpipe.in/sitemap.xml" };
}
