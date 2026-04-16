export function breadcrumb(parts: string[]): string {
  return parts.filter(Boolean).join(" › ");
}
