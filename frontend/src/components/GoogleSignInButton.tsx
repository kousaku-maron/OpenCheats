import { createAuthClient } from 'better-auth/client';
import { useState } from 'preact/hooks';

const authClient = createAuthClient();

export function GoogleSignInButton() {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    setStatus('');

    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/',
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Google sign-in failed');
      setLoading(false);
    }
  };

  return (
    <div className="stack-sm">
      <button type="button" className="auth-google-button" onClick={handleSignIn} disabled={loading}>
        <span className="auth-google-mark" aria-hidden="true">
          G
        </span>
        {loading ? 'Google に接続中...' : 'Google でログイン'}
      </button>
      {status ? <p className="form-helper form-helper-error">{status}</p> : null}
    </div>
  );
}
