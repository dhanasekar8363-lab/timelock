import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Capacitor } from '@capacitor/core';
import './Login.css';

// On native mobile, OAuth must redirect to the custom app scheme.
// On web/browser, use the normal window.location.origin.
const getRedirectUrl = () => {
  if (Capacitor.isNativePlatform()) {
    return 'com.dhana.timelock://login-callback';
  }
  return `${window.location.origin}/`;
};

export default function Login() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState(null);

  // Redirect already-authenticated users to home
  useEffect(() => {
    if (!loading && user) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  const handleGoogleLogin = async () => {
    try {
      setIsSigningIn(true);
      setError(null);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getRedirectUrl(),
        },
      });

      if (error) {
        console.error('Login error:', error);
        setError('Failed to sign in with Google. Please try again.');
        setIsSigningIn(false);
      }
      // On success, Supabase redirects the browser — no further action needed here
    } catch (err) {
      console.error('Unexpected login error:', err);
      setError('An unexpected error occurred. Please try again.');
      setIsSigningIn(false);
    }
  };

  // Full-page spinner while AuthContext resolves the session
  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-spinner" aria-label="Loading" />
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🔐 Welcome to TimeLock</h1>
        <p className="subtitle">Share moments. Unlock memories.</p>

        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        <button
          className="google-btn"
          onClick={handleGoogleLogin}
          disabled={isSigningIn}
          aria-busy={isSigningIn}
        >
          {isSigningIn ? (
            <>
              <span className="btn-spinner" aria-hidden="true" />
              Connecting…
            </>
          ) : (
            <>
              <svg
                className="google-icon"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <p className="terms">
          By continuing, you agree to our{' '}
          <Link to="/terms">Terms of Service</Link> and{' '}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
