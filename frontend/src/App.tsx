import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth';
import { useAuth } from './auth-context';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SharedTeamPage from './pages/SharedTeamPage';
import TeamPage from './pages/TeamPage';

function Header() {
  const { user, logout } = useAuth();
  const onLoginPage = useLocation().pathname === '/login';
  return (
    <header className="header">
      <Link to="/" className="brand">VGC Lab</Link>
      {user ? (
        <div className="row">
          <span className="muted">{user.username}</span>
          <button className="ghost" onClick={logout}>Log out</button>
        </div>
      ) : (
        !onLoginPage && <Link to="/login" className="ghost button">Log in</Link>
      )}
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Header />
        <main className="main">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
            <Route path="/teams/:id" element={<RequireAuth><TeamPage /></RequireAuth>} />
            <Route path="/t/:shareId" element={<SharedTeamPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="footer muted">
          Fan project for learning purposes. Pokémon and all related names and images are © Nintendo, Game Freak and The Pokémon Company.
          Data and sprites from Pokémon Showdown.
        </footer>
      </AuthProvider>
    </BrowserRouter>
  );
}
