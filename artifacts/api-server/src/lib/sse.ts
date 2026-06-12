import { type Response } from "express";

interface SSEClient {
  id: string;
  res: Response;
}

const clients = new Map<string, SSEClient>();

export function addSSEClient(id: string, res: Response): void {
  clients.set(id, { id, res });
}

export function removeSSEClient(id: string): void {
  clients.delete(id);
}

export function broadcastEvent(event: string, data: Record<string, unknown> = {}): void {
  if (clients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [id, client] of clients) {
    try {
      client.res.write(payload);
    } catch {
      clients.delete(id);
    }
  }
}
