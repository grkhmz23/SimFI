import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    // Try to parse JSON error body for a cleaner message
    try {
      const parsed = JSON.parse(text);
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      if (parsed.message) {
        throw new Error(parsed.message);
      }
    } catch {
      // Not JSON or no expected fields
    }
    throw new Error(text || `${res.status}: ${res.statusText}`);
  }
}

export async function apiRequest<T = any>(
  method: string,
  url: string,
  data?: unknown | undefined,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...(extraHeaders || {}),
  };
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Exponential backoff retry delay
const retryDelay = (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 60000, // 1 minute stale time
      retry: (failureCount, error: any) => {
        // Don't retry on 401/403 errors
        if (error?.message?.includes('401') || error?.message?.includes('403')) {
          return false;
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },
      retryDelay,
    },
    mutations: {
      retry: (failureCount, error: any) => {
        // Don't retry auth errors or client errors (4xx)
        if (error?.message?.includes('401') || 
            error?.message?.includes('403') ||
            error?.message?.includes('400')) {
          return false;
        }
        // Retry network errors up to 2 times
        return failureCount < 2;
      },
      retryDelay,
    },
  },
});
