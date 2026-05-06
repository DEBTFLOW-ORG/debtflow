import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
});

// Inyectar JWT en cada request
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('df_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Si el token expiró → redirigir al login
api.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('df_token');
      window.location.href = '/';
    }
    return Promise.reject(err.response?.data?.error || 'Error de conexión');
  }
);

export const authApi = {
  register: (body)  => api.post('/auth/register', body),
  login:    (body)  => api.post('/auth/login',    body),
  me:       ()      => api.get('/auth/me'),
};

export const deudoresApi = {
  list:   ()        => api.get('/deudores'),
  create: (body)    => api.post('/deudores', body),
  update: (id, b)   => api.put(`/deudores/${id}`, b),
  remove: (id)      => api.delete(`/deudores/${id}`),
};

export const campanasApi = {
  list:   ()        => api.get('/campanas'),
  create: (body)    => api.post('/campanas', body),
  update: (id, b)   => api.put(`/campanas/${id}`, b),
  remove: (id)      => api.delete(`/campanas/${id}`),
};

export const llamadasApi = {
  list: () => api.get('/llamadas'),
};

export const agenteApi = {
  get:  ()      => api.get('/agente'),
  save: (body)  => api.put('/agente', body),
};

export const adminApi = {
  users:    ()           => api.get('/admin/users'),
  stats:    ()           => api.get('/admin/stats'),
  llamadas: ()           => api.get('/admin/llamadas'),
  setPlan:  (id, plan)   => api.put(`/admin/users/${id}/plan`, { plan }),
  setRole:  (id, role)   => api.put(`/admin/users/${id}/role`, { role }),
};
