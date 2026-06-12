---
name: Supplier conversation flow
description: How supplier WhatsApp conversations are persisted and surfaced in the admin panel.
---

Tables: `supplier_conversations` (phone, name, status, timestamps) + `supplier_messages` (conv_id, direction, type, content, sender_name, media_url).

Helper functions exported from `lib/database.ts`: `getOrCreateSupplierConversation(phone, name)`, `saveSupplierMessage(convId, direction, type, content, senderName, mediaUrl?)`.

WhatsApp flow: menu option "2" sets `conv.mode = "supplier"`, calls `getOrCreateSupplierConversation`, stores `conv.supplierConvId`, saves welcome message. All subsequent inbound messages save via `saveSupplierMessage` and broadcast `supplier:message` SSE event.

API routes in `routes/supplier-conversations.ts`: GET list, GET detail, POST reply (calls `sendSupplierMessage` from whatsapp.ts), PATCH close/reopen. All routes require admin or manager role.

`sendSupplierMessage(phone, text, agentName, conversationId?)` — exported from whatsapp.ts; calls internal `sendMessage`, then saves outbound message + broadcasts SSE.

Frontend page: `pages/SupplierConversations.tsx` — left/right panel, filter tabs (abertas/encerradas). Only visible to admin/manager in shell nav.

**Why:** Managers need to track supplier communication history, reply from the dashboard, and close threads.
