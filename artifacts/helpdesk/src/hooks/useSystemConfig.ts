import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type SystemConfig = Record<string, string>;

export function useSystemConfig() {
  return useQuery<SystemConfig>({
    queryKey: ["system-config"],
    queryFn: () => apiFetch<SystemConfig>("/api/settings/system-config"),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}

export function useClientLabel() {
  const { data } = useSystemConfig();
  return {
    singular: data?.client_label ?? "Colaborador",
    plural: data?.clients_label ?? "Colaboradores",
  };
}
