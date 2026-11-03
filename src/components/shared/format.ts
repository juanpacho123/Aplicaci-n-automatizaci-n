const TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE || "America/Bogota";

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(d);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: TZ }).format(d);
}

export function formatNumber(n: number): string {
  return n.toLocaleString("es-CO");
}

export { formatBytes } from "@/lib/validation/names";
