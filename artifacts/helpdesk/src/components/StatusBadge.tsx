import { Badge } from "@/components/ui/badge";
import { TicketStatus } from "@workspace/api-client-react";

interface StatusBadgeProps {
  status: TicketStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case "open":
      return <Badge className="bg-blue-500 hover:bg-blue-600">Aberto</Badge>;
    case "in_progress":
      return <Badge className="bg-amber-500 hover:bg-amber-600 text-amber-950">Em Atendimento</Badge>;
    case "waiting_client":
      return <Badge className="bg-orange-500 hover:bg-orange-600 text-white">Ag. Cliente</Badge>;
    case "waiting_analyst":
      return <Badge className="bg-violet-500 hover:bg-violet-600 text-white">Ag. Analista</Badge>;
    case "closed":
      return <Badge variant="secondary" className="bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">Fechado</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
