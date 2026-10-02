export function appUrl(): string {
  const configured = process.env.APP_URL;
  if (!configured) {
    return process.env.NODE_ENV === "production" ? "https://f1predict.dev" : "http://localhost:8080";
  }
  const url = new URL(configured);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS in production");
  }
  if (!(["https:", "http:"].includes(url.protocol))) throw new Error("APP_URL must be an HTTP or HTTPS URL");
  return url.origin;
}
