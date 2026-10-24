/** Client-side slug preview (server validates authoritatively). */
export function previewSlugFromName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}
