import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth-context';

/** After this long without an answer, explain that the free-tier API is waking up. */
const SLOW_REQUEST_MS = 3000;

export default function LoginPage() {
  const { user, login } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [slow, setSlow] = useState(false);

  // The API sleeps when idle on the free tier. Waking it now means it is usually
  // ready by the time the form is filled in. The result itself is not needed.
  useEffect(() => {
    void api.health().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), SLOW_REQUEST_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [pending]);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      if (mode === 'register') await api.register(username, email, password);
      await login(username, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  const idleLabel = mode === 'login' ? 'Log in' : 'Sign up';
  const pendingLabel = mode === 'login' ? 'Logging in…' : 'Creating account…';

  return (
    <form className="card auth" onSubmit={submit} aria-busy={pending}>
      <h1>{mode === 'login' ? 'Log in' : 'Create account'}</h1>
      <label>
        {mode === 'login' ? 'Username or email' : 'Username'}
        <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
      </label>
      {mode === 'register' && (
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
      )}
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : undefined} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={pending}>
        {pending && <span className="spinner" aria-hidden="true" />}
        {pending ? pendingLabel : idleLabel}
      </button>
      {slow && (
        <p className="muted small" role="status">
          Waking up the server. On the free hosting tier this can take up to a minute the first time.
        </p>
      )}
      <button type="button" className="ghost" disabled={pending} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
        {mode === 'login' ? 'No account? Sign up' : 'Have an account? Log in'}
      </button>
    </form>
  );
}
