import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import pages from "../../../seo/pages.json";

const origin = "https://f1predict.dev";
const privateTitles: Record<string, string> = {
  "/login": "Sign in | F1 Predictor Pro",
  "/register": "Create an account | F1 Predictor Pro",
  "/forgot-password": "Forgot password | F1 Predictor Pro",
  "/reset-password": "Reset password | F1 Predictor Pro",
  "/dashboard": "Dashboard | F1 Predictor Pro",
  "/leaderboard": "Leaderboard | F1 Predictor Pro",
  "/predictions": "Prediction history | F1 Predictor Pro",
  "/discussions": "Discussions | F1 Predictor Pro",
  "/admin": "Admin | F1 Predictor Pro",
};

function meta(attribute: "name" | "property", key: string, value: string | null) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (value === null) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = value;
}

export function RouteSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const path = pathname !== "/" ? pathname.replace(/\/$/, "") : "/";
    const page = pages.find((entry) => entry.path === path);
    const title = page?.title || privateTitles[path] || (path.startsWith("/predict/") ? "Make a prediction | F1 Predictor Pro" : "Page not found | F1 Predictor Pro");
    document.title = title;
    meta("name", "robots", page ? "index, follow, max-image-preview:large" : "noindex, nofollow");
    meta("name", "description", page?.description || null);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (page) {
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = `${origin}${page.path}`;
    } else canonical?.remove();

    for (const [key, value] of Object.entries({
      "og:site_name": page ? "F1 Predictor Pro" : null,
      "og:type": page ? "website" : null,
      "og:title": page?.title || null,
      "og:description": page?.description || null,
      "og:url": page ? `${origin}${page.path}` : null,
      "og:image": page ? `${origin}/og-cover.png` : null,
    })) meta("property", key, value);
    for (const [key, value] of Object.entries({
      "twitter:card": page ? "summary_large_image" : null,
      "twitter:title": page?.title || null,
      "twitter:description": page?.description || null,
      "twitter:image": page ? `${origin}/og-cover.png` : null,
    })) meta("name", key, value);

    document.head.querySelectorAll('script[type="application/ld+json"]').forEach((element) => element.remove());
    if (page) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": page.path === "/" ? "SoftwareApplication" : "WebPage",
        name: page.path === "/" ? "F1 Predictor Pro" : page.title,
        url: `${origin}${page.path}`,
        description: page.description,
        ...(page.path === "/" ? { applicationCategory: "GameApplication", operatingSystem: "Web browser", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } } : {}),
      }).replace(/</g, "\\u003c");
      document.head.appendChild(script);
    }
  }, [pathname]);

  return null;
}
