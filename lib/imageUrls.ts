export function pocketbaseThumbUrl(uri?: string | null, size = "600x600"): string | null {
  if (!uri) return null;
  if (!/^https?:\/\//i.test(uri) || !uri.includes("/api/files/")) return uri;
  if (/[?&]thumb=/i.test(uri)) {
    return uri.replace(/([?&])thumb=[^&]*/i, `$1thumb=${size}`);
  }
  return `${uri}${uri.includes("?") ? "&" : "?"}thumb=${size}`;
}
