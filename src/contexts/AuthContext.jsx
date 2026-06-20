import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check for an existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 2. Keep state in sync whenever Supabase fires an auth event
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // 3. On Android, intercept the deep link that Google sends back after OAuth.
    //    The URL looks like: com.dhana.timelock://login-callback?code=...
    //    Supabase uses the PKCE flow, so we exchange the auth code for a session.
    //
    //    addListener() returns a PROMISE, not a handle. If the effect's cleanup
    //    runs before that promise resolves (fast unmount, StrictMode double
    //    invoke, etc.), a synchronous `handle?.remove()` in cleanup is too early
    //    and silently no-ops, leaking the native listener. We guard against that
    //    by tracking a `cancelled` flag and always removing the handle the
    //    moment it actually resolves, even if that happens after cleanup starts.
    let cancelled = false;
    let listenerPromise = null;

    if (Capacitor.isNativePlatform()) {
      listenerPromise = App.addListener('appUrlOpen', async ({ url }) => {
        try {
          const parsedUrl = new URL(url);
          const code = parsedUrl.searchParams.get('code');

          if (code) {
            const { data, error } =
              await supabase.auth.exchangeCodeForSession(code);

            if (error) {
              console.error('exchangeCodeForSession error:', error);
            }
          }
        } catch (err) {
          console.error('Deep link handling error:', err);
        }
      });

      listenerPromise.then(handle => {
        if (cancelled) {
          // Effect was already cleaned up before registration finished —
          // remove the handle now instead of leaking it.
          handle.remove();
        }
      }).catch(err => {
        console.error('Failed to register appUrlOpen listener:', err);
      });
    }

    return () => {
      subscription?.unsubscribe();
      cancelled = true;
      if (listenerPromise) {
        listenerPromise.then(handle => handle.remove()).catch(() => {});
      }
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
