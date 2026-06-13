import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface TicketNavContext {
  ticketIds: number[];
  setTicketIds: (ids: number[]) => void;
  prevId: (currentId: number) => number | null;
  nextId: (currentId: number) => number | null;
  indexOf: (id: number) => number;
}

const Ctx = createContext<TicketNavContext>({
  ticketIds: [],
  setTicketIds: () => {},
  prevId: () => null,
  nextId: () => null,
  indexOf: () => -1,
});

export function TicketNavigationProvider({ children }: { children: ReactNode }) {
  const [ticketIds, setTicketIds] = useState<number[]>([]);

  const prevId = useCallback((id: number) => {
    const idx = ticketIds.indexOf(id);
    return idx > 0 ? ticketIds[idx - 1] : null;
  }, [ticketIds]);

  const nextId = useCallback((id: number) => {
    const idx = ticketIds.indexOf(id);
    return idx >= 0 && idx < ticketIds.length - 1 ? ticketIds[idx + 1] : null;
  }, [ticketIds]);

  const indexOf = useCallback((id: number) => ticketIds.indexOf(id), [ticketIds]);

  return (
    <Ctx.Provider value={{ ticketIds, setTicketIds, prevId, nextId, indexOf }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTicketNavigation() {
  return useContext(Ctx);
}
