# Debtflow — Setup

## 1. Supabase
1. Creá cuenta en supabase.com
2. Nuevo proyecto → copiá la URL y las keys (Settings → API)
3. Abrí SQL Editor y pegá el contenido de `backend/db/schema.sql` → Run

## 2. Twilio
1. Creá cuenta en twilio.com
2. Console → copiá Account SID y Auth Token

## 3. Vapi
1. Creá cuenta en vapi.ai
2. Dashboard → API Keys → generá una key
3. Settings → Webhooks → URL: http://TU_SERVIDOR:3001/webhooks/vapi
4. Copiá el webhook secret

## 4. Backend
```bash
cd backend
cp .env.example .env
# Editá .env con tus keys reales
npm install
# Generar ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Pegar el resultado en ENCRYPTION_KEY del .env
npm run dev
```

## 5. Frontend
```bash
# En la carpeta raíz del proyecto
npm run dev
```

## 6. Crear primer admin
En Supabase SQL Editor:
```sql
UPDATE users SET role = 'admin' WHERE email = 'tu@email.com';
```

## Estructura de carpetas
```
debtflow/
├── src/              ← Frontend React
├── backend/          ← API Node.js
│   ├── routes/
│   ├── services/     ← Twilio, Vapi, Scheduler
│   ├── middleware/
│   └── db/schema.sql
└── .env              ← Frontend env
```
