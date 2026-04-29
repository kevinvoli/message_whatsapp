'use client';

import { ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/app/lib/query-client';

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps): React.ReactElement {
  const [client] = useState<QueryClient>(() => createQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export default QueryProvider;
