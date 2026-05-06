require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const logger     = require('./utils/logger');
const scheduler  = require('./services/scheduler');

const app = express();

// ── Seguridad HTTP ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'https://api.vapi.ai',
  ],
  credentials: true,
}));

// ── Webhook ANTES de express.json() (necesita raw body para HMAC) ─
app.use('/webhooks', require('./routes/webhooks'));

app.use(express.json({ limit: '1mb' }));

// ── Rate limiting ─────────────────────────────────────────────────
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20,
  message: { error: 'Demasiados intentos, esperá 15 minutos' } }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 120 }));

// ── Rutas ─────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/deudores', require('./routes/deudores'));
app.use('/api/llamadas', require('./routes/llamadas'));
app.use('/api/agente',   require('./routes/agente'));
app.use('/api/admin',    require('./routes/admin'));

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', ts: Date.now() }));

// ── Manejo global de errores ──────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error(err.stack || err.message);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`Debtflow backend corriendo en :${PORT}`);
  scheduler.init();
});
