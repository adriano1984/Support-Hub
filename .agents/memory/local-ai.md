---
name: Local AI engine
description: Free local AI for ticket suggestions; no API key needed; learns from ticket history.
---

`overlay/ai-local.ts` exports `analyzeTicketLocally(ticketId, description, messages, categoryName)` → `AiAnalysis`.

Algorithm: tokenize + cosine similarity against last 200 closed/resolved tickets. If similarity > 0.08, returns the best matching ticket's last outbound message as suggestion. Otherwise falls back to keyword-based rule templates (password, network, printer, email, etc.).

The `/api/tickets/:id/ai-suggest` route tries Groq first (if `GROQ_API_KEY` is set), then falls back to local AI silently.

Response shape: `{ suggestion, source: "groq"|"history"|"rules", urgency: "low"|"medium"|"high", similarCount, keywords, similarTickets }`.

Frontend shows meta badge next to the Sparkles button: "📚 N chamado(s) similar(es)" or "🔧 Sugestão por regras" and urgency indicator.

**Why:** User is on free tier, no external AI integrations available. Local approach improves over time as more tickets are closed and resolved.
