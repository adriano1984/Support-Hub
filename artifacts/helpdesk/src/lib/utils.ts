import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const TZ = "America/Sao_Paulo";

export function formatDateBR(dateStr: string | null | undefined, includeTime = true): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function formatDateOnlyBR(dateStr: string | null | undefined): string {
  return formatDateBR(dateStr, false);
}

export function formatTimeBR(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function nowBR(): string {
  return new Date().toLocaleString("pt-BR", { timeZone: TZ });
}
