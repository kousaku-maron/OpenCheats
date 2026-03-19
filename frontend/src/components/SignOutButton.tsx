import { useState } from 'preact/hooks';

type Props = {
  className?: string;
};

export function SignOutButton({ className = 'btn-secondary' }: Props) {
  const [status, setStatus] = useState('');

  const handleSignOut = async () => {
    setStatus('Signing out...');
    try {
      const res = await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await res.text());
      window.location.href = '/login';
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Sign out failed');
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={handleSignOut}>
        Sign out
      </button>
      {status && <p className="status-message">{status}</p>}
    </>
  );
}
