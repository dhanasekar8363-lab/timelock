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
    let appUrlListener = null;
    if (Capacitor.isNativePlatform()) {
      App.addListener('appUrlOpen', async ({ url }) => {
        console.log('🔗 Deep link received:', url);

        try {
          const parsedUrl = new URL(url);
          const code = parsedUrl.searchParams.get('code');

          if (code) {
            console.log('🔑 Exchanging code for session...');

            const { data, error } =
              await supabase.auth.exchangeCodeForSession(code);

            if (error) {
              console.error('exchangeCodeForSession error:', error);
            } else {
              console.log('✅ Session created', data);
            }
          }
        } catch (err) {
          console.error('Deep link handling error:', err);
        }
      }).then(handle => { appUrlListener = handle; });
    }

    return () => {
      subscription?.unsubscribe();
      appUrlListener?.remove();
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
