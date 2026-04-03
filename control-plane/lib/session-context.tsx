'use client';

import { createContext, useContext } from 'react';
import { SessionData } from './api-types';

const SessionContext = createContext<SessionData | null>(null);

export function SessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: SessionData;
}): React.ReactElement {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSessionData(): SessionData {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error('Session context is not available');
  }
  return session;
}
