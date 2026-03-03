import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a mock client during build time that logs warnings
    if (typeof window === 'undefined') {
      console.warn('Supabase credentials missing - using mock client for build');
      // Return a minimal mock that won't crash during SSR
      return new Proxy({} as SupabaseClient, {
        get(target, prop) {
          if (prop === 'from') {
            return () => ({
              select: () => ({ data: null, error: null }),
              insert: () => ({ data: null, error: null }),
              update: () => ({ data: null, error: null }),
              delete: () => ({ data: null, error: null }),
              eq: () => ({ data: null, error: null }),
              order: () => ({ data: null, error: null }),
              limit: () => ({ data: null, error: null }),
            });
          }
          return target[prop as keyof SupabaseClient];
        },
      });
    }
    throw new Error('Supabase credentials missing from environment variables.');
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseInstance;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    const client = getSupabaseClient();
    return client[prop as keyof SupabaseClient];
  },
});
