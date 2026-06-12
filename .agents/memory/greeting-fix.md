---
name: Greeting message fix + AI integration status
description: Analyst greeting removed sign-off text; OpenRouter AI blocked on free tier.
---

`notifyStatusChange` in `whatsapp.ts`: the `in_progress` greeting message no longer appends `\n\n\nAtenciosamente,\n${nome}`. Message ends cleanly after "continuidade à tratativa da sua solicitação."

AI integration: OpenRouter via `setupReplitAIIntegrations` is NOT available on Replit free tier. Do NOT retry. Existing `overlay/ai.ts` uses Groq (requires user to set `GROQ_API_KEY` manually).

**Why:** Free-tier users cannot use third-party connectors (Stripe, OpenRouter, etc.) through Replit integrations.
