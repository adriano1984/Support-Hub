---
name: Ticket navigation context
description: How prev/next ticket navigation works between the Tickets list and TicketDetail pages.
---

`TicketNavigationProvider` in `contexts/TicketNavigationContext.tsx` wraps the whole app. Tickets.tsx calls `setTicketIds(data.tickets.map(t => t.id))` after every list fetch. TicketDetail.tsx calls `prevId(id)`, `nextId(id)`, `indexOf(id)` to render ‹ N/total › buttons in the header.

**Why:** wouter's routing loses list context when navigating to a detail page; a context is the lightest way to share the ordered ID list without URL pollution.

**How to apply:** If the Tickets page adds filtering/pagination that changes which IDs are visible, the context auto-updates because setTicketIds is called on every list fetch.
