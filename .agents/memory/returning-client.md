---
name: Returning client recognition
description: WhatsApp bot skips branch/dept/category selection for returning clients.
---

In the `menu` step handler (whatsapp.ts), after user presses "1" and name is confirmed, the bot queries:
```sql
SELECT branch_id, department_id, category_id FROM tickets
WHERE whatsapp_phone = ? AND branch_id IS NOT NULL AND ...
ORDER BY created_at DESC LIMIT 1
```
If a previous ticket exists, it sets `conv.branchId/departmentId/categoryId` from that ticket and jumps `conv.step = "description"`, sending a friendly confirmation message showing the pre-filled branch/dept/category names.

First-time clients still go through the full branch → department → category flow.

**Why:** Improves UX for repeat users — they only need to describe the new problem, not re-enter org structure every time.

**How to apply:** The pre-filled values can be edited by the admin in the ticket detail after creation. Users can't change them during the WhatsApp flow for now (intentional — keeps the flow short).
