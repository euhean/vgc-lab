import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth-context';

export default function LoginPage() {
  const { user, login } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'register') await api.register(username, email, password);
      await login(username, password);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form className="card auth" onSubmit={submit}>
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
      <button type="submit">{mode === 'login' ? 'Log in' : 'Sign up'}</button>
      <button type="button" className="ghost" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
        {mode === 'login' ? 'No account? Sign up' : 'Have an account? Log in'}
      </button>
    </form>
  );
}
