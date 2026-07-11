---
name: Status Flow
description: Fluxo de status dos chamados — apenas 3 estados, sem Ag.Cliente/Ag.Analista
---
Os status válidos são: open, in_progress, closed.
Ag. Cliente e Ag. Analista foram removidos em v1.1.
Fluxo forward-only para não-admins: open→in_progress→closed.
Admins podem mudar para qualquer status.

**Why:** Usuário pediu remoção explícita (v1.1 requirement).
**How to apply:** Sempre que adicionar lógica de status, usar apenas esses 3 valores. Verificar tickets.ts (allowed list), TicketDetail.tsx (STATUS_FLOW), Tickets.tsx (filtros), StatusBadge.tsx (casos do switch).
