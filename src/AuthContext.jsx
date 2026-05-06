import { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // Al cargar la app, verificar si hay token guardado
  useEffect(() => {
    const token = localStorage.getItem('df_token');
    if (!token) { setLoading(false); return; }
    authApi.me()
      .then(u  => setUser(u))
      .catch(() => localStorage.removeItem('df_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await authApi.login({ email, password });
    localStorage.setItem('df_token', res.token);
    setUser(res.user);
    return res.user;
  };

  const register = async (email, password) => {
    const res = await authApi.register({ email, password });
    localStorage.setItem('df_token', res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    localStorage.removeItem('df_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
