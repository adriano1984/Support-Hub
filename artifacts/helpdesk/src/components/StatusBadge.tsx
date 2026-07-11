import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case "open":
      return <Badge className="bg-blue-500 hover:bg-blue-600">Aberto</Badge>;
    case "in_progress":
      return <Badge className="bg-amber-500 hover:bg-amber-600 text-amber-950">Em Atendimento</Badge>;
    case "closed":
      return <Badge variant="secondary" className="bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">Fechado</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
