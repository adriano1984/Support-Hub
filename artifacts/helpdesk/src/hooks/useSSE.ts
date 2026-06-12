import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useSSE() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem("hd_token");
    if (!token) return;

    const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const url = `${BASE}/api/events`;
    let abortController = new AbortController();
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    async function connect() {
      if (!active) return;
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          if (active) retryTimeout = setTimeout(connect, 8000);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            if (!block.trim() || block.startsWith(":")) continue;

            let eventName = "message";
            let data = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event: ")) eventName = line.slice(7).trim();
              if (line.startsWith("data: ")) data = line.slice(6).trim();
            }

            if (eventName === "connected") continue;

            if (eventName === "ticket:new" || eventName === "ticket:updated") {
              window.dispatchEvent(new CustomEvent("sse:ticket:updated", { detail: tryParse(data) }));
              queryClient.invalidateQueries({ queryKey: ["getDashboard"] });
              queryClient.invalidateQueries({ queryKey: ["getTickets"] });
            }

            if (eventName === "message:new") {
              const payload = tryParse(data);
              window.dispatchEvent(new CustomEvent("sse:message:new", { detail: payload }));
              queryClient.invalidateQueries({ queryKey: ["getTickets"] });
              if (payload?.ticketId) {
                queryClient.invalidateQueries({ predicate: (q) => {
                  const key = q.queryKey;
                  return Array.isArray(key) && key[0] === "getTicket" && key[1] === payload.ticketId;
                }});
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
      if (active) retryTimeout = setTimeout(connect, 8000);
    }

    connect();

    return () => {
      active = false;
      abortController.abort();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [queryClient]);
}

function tryParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return {}; }
}
