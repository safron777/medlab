# Architecture Document — MedLab

**Версия:** 1.0
**Дата:** 2026-03-20
**Статус:** Draft

---

## 1. Обзор архитектуры

MedLab — монолитное full-stack веб-приложение. Один Node.js процесс обслуживает и API, и статику. Хранилище мигрирует с JSON-файлов на SQLite.

```
┌─────────────────────────────────────────────┐
│                   Browser                    │
│  PWA (ES-модули, Chart.js, PDF.js)           │
│  Service Worker (offline cache)              │
└────────────────────┬────────────────────────┘
                     │ HTTPS / REST API
┌────────────────────▼────────────────────────┐
│              Express.js Server               │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│  │  Routes  │ │Middleware│ │  Validators │  │
│  │ /api/auth│ │  helmet  │ │    (zod)    │  │
│  │ /api/tests│ │  cors    │ └─────────────┘  │
│  │/api/members│ │rate-limit│                 │
│  └────┬─────┘ └──────────┘                  │
│       │                                      │
│  ┌────▼──────────────────────────────────┐  │
│  │            Database Layer              │  │
│  │         better-sqlite3 (SQLite)        │  │
│  │    Transactions, WAL mode, Indexes     │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │         File Storage                  │   │
│  │   /data/attachments/ (base64 → files) │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

---

## 2. База данных — SQLite Schema

### Таблица `users`
```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,           -- bcrypt hash
  name        TEXT NOT NULL,
  sex         TEXT CHECK(sex IN ('male', 'female', 'other')),
  birth_date  TEXT,                    -- ISO 8601
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
```

### Таблица `jwt_blacklist`
```sql
CREATE TABLE jwt_blacklist (
  jti        TEXT PRIMARY KEY,         -- JWT ID
  expires_at TEXT NOT NULL             -- для автоочистки
);
CREATE INDEX idx_jwt_blacklist_expires ON jwt_blacklist(expires_at);
```

### Таблица `family_members`
```sql
CREATE TABLE family_members (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sex         TEXT CHECK(sex IN ('male', 'female', 'other')),
  birth_date  TEXT,
  relation    TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_family_user ON family_members(user_id);
```

### Таблица `tests`
```sql
CREATE TABLE tests (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id     TEXT REFERENCES family_members(id) ON DELETE SET NULL,
  date          TEXT NOT NULL,          -- ISO 8601
  lab_name      TEXT,
  doctor        TEXT,
  category      TEXT NOT NULL DEFAULT 'other',
  conclusion    TEXT,
  notes         TEXT,
  next_visit    TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_tests_user ON tests(user_id);
CREATE INDEX idx_tests_date ON tests(date DESC);
CREATE INDEX idx_tests_member ON tests(member_id);
```

### Таблица `test_parameters`
```sql
CREATE TABLE test_parameters (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  test_id     TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  value       REAL,
  value_text  TEXT,                     -- для нечисловых значений
  unit        TEXT,
  ref_min     REAL,
  ref_max     REAL,
  ref_text    TEXT,                     -- "отрицательный", "до 5.0"
  is_abnormal INTEGER DEFAULT 0         -- 0/1 boolean
);
CREATE INDEX idx_params_test ON test_parameters(test_id);
CREATE INDEX idx_params_name ON test_parameters(name);  -- для истории параметра
```

### Таблица `attachments`
```sql
CREATE TABLE attachments (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  test_id     TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size        INTEGER NOT NULL,
  path        TEXT NOT NULL             -- путь к файлу на диске
);
CREATE INDEX idx_attach_test ON attachments(test_id);
```

---

## 3. Структура файлов (целевая)

```
medlab/
├── server.js              # Express app, middleware, graceful shutdown
├── db.js                  # SQLite connection, migrations runner
├── routes/
│   ├── auth.js            # POST /api/auth/register, login, logout
│   ├── tests.js           # CRUD /api/tests
│   ├── members.js         # CRUD /api/members
│   ├── export.js          # GET /api/export, POST /api/import
│   └── profile.js         # GET/PUT /api/profile, DELETE /api/account
├── middleware/
│   ├── auth.js            # JWT verify + blacklist check
│   ├── validate.js        # zod validation factory
│   └── rateLimit.js       # tiered rate limits
├── validators/
│   ├── auth.schemas.js    # zod schemas для auth
│   ├── test.schemas.js    # zod schemas для tests
│   └── member.schemas.js  # zod schemas для members
├── migrations/
│   ├── 001_initial.sql
│   └── 002_jwt_blacklist.sql
├── data/
│   ├── medlab.db          # SQLite database
│   └── attachments/       # загруженные файлы
├── public/
│   ├── index.html
│   ├── css/app.css
│   ├── js/
│   │   ├── app.js         # главный модуль, router
│   │   ├── api.js         # fetch-обёртка, auth headers
│   │   ├── auth.js        # login/register формы
│   │   ├── tests.js       # список, форма, детали теста
│   │   ├── charts.js      # Chart.js логика
│   │   ├── members.js     # семейные профили
│   │   ├── pdf-parser.js  # PDF.js логика
│   │   ├── references.js  # референсные значения
│   │   └── utils.js       # escapeHTML, formatDate, etc.
│   └── sw.js
├── tests/
│   ├── e2e.test.js
│   └── parser_test.mjs
└── package.json
```

---

## 4. Ключевые архитектурные решения

### 4.1 SQLite в WAL-режиме
```javascript
// db.js
const db = new Database('./data/medlab.db');
db.pragma('journal_mode = WAL');    // параллельные чтения
db.pragma('foreign_keys = ON');     // каскадные удаления
db.pragma('synchronous = NORMAL');  // баланс скорость/надёжность
```
WAL-режим позволяет нескольким читателям работать одновременно с одним писателем — устраняет race conditions текущей реализации.

### 4.2 Миграции через SQL-файлы
```javascript
// db.js — простой runner без внешних зависимостей
const runMigrations = (db) => {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)`);
  const applied = db.prepare('SELECT name FROM migrations').all().map(r => r.name);
  const files = fs.readdirSync('./migrations').sort();
  for (const file of files) {
    if (!applied.includes(file)) {
      db.exec(fs.readFileSync(`./migrations/${file}`, 'utf-8'));
      db.prepare('INSERT INTO migrations VALUES (?)').run(file);
    }
  }
};
```

### 4.3 Валидация через zod
```javascript
// validators/test.schemas.js
import { z } from 'zod';

export const createTestSchema = z.object({
  date: z.string().datetime(),
  lab_name: z.string().max(200).optional(),
  doctor: z.string().max(200).optional(),
  category: z.enum(['blood', 'urine', 'biochemistry', 'hormones', 'vitamins', 'other']),
  parameters: z.array(z.object({
    name: z.string().min(1).max(200),
    value: z.number().optional(),
    value_text: z.string().max(500).optional(),
    unit: z.string().max(50).optional(),
    ref_min: z.number().optional(),
    ref_max: z.number().optional(),
  })).min(1).max(200),
  conclusion: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});
```

### 4.4 XSS-защита — escapeHTML утилита
```javascript
// public/js/utils.js
export const escapeHTML = (str) => {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
```
Все пользовательские данные в шаблонах проходят через `escapeHTML()`.

### 4.5 JWT с revocation
```javascript
// При logout:
const jti = decoded.jti; // UUID в каждом токене
db.prepare('INSERT INTO jwt_blacklist VALUES (?, ?)').run(jti, expiresAt);

// В auth middleware:
const blacklisted = db.prepare('SELECT 1 FROM jwt_blacklist WHERE jti = ?').get(jti);
if (blacklisted) return res.status(401).json({ error: 'Token revoked' });
```

### 4.6 Пагинация
```javascript
// GET /api/tests?page=1&limit=20&category=blood&search=глюкоза
const { page = 1, limit = 20, category, search } = req.query;
const offset = (page - 1) * limit;

// SQLite запрос с COUNT для total
const total = db.prepare(`SELECT COUNT(*) as n FROM tests WHERE user_id = ?`).get(userId).n;
const tests = db.prepare(`
  SELECT * FROM tests WHERE user_id = ?
  ORDER BY date DESC LIMIT ? OFFSET ?
`).all(userId, limit, offset);

res.json({ tests, total, page, pages: Math.ceil(total / limit) });
```

---

## 5. API эндпоинты

### Auth
| Method | Path | Описание |
|--------|------|----------|
| POST | `/api/auth/register` | Регистрация |
| POST | `/api/auth/login` | Вход, возвращает JWT |
| POST | `/api/auth/logout` | Logout, добавляет jti в blacklist |

### Profile
| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/profile` | Получить профиль |
| PUT | `/api/profile` | Обновить профиль |
| DELETE | `/api/account` | Удалить аккаунт со всеми данными |

### Tests
| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/tests` | Список (пагинация, фильтры, поиск) |
| POST | `/api/tests` | Создать анализ |
| GET | `/api/tests/:id` | Детали анализа с параметрами |
| PUT | `/api/tests/:id` | Обновить анализ |
| DELETE | `/api/tests/:id` | Удалить анализ |
| GET | `/api/tests/parameter/:name` | История параметра для графика |

### Members
| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/members` | Список членов семьи |
| POST | `/api/members` | Добавить члена семьи |
| PUT | `/api/members/:id` | Обновить |
| DELETE | `/api/members/:id` | Удалить |

### Data
| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/export` | Экспорт всех данных JSON |
| POST | `/api/import` | Импорт с дедупликацией |

---

## 6. Стратегия миграции данных

1. Запустить `npm run migrate:from-json` — скрипт читает `data/users.json`, `data/tests.json`, создаёт SQLite БД
2. Проверить целостность: количество записей в JSON = количество строк в SQLite
3. Переключить `server.js` на SQLite
4. JSON-файлы сохранить в `data/backup-pre-migration/` (не удалять неделю)

---

## 7. Риски и митигация

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Потеря данных при миграции | Средняя | Бэкап JSON перед миграцией, транзакционная запись |
| SQLite не поддерживает concurrent writes | Низкая | WAL-режим, запросы быстрые (<1ms) |
| better-sqlite3 нет в зависимостях | — | Уже есть в package.json |
| Регрессия после рефакторинга | Средняя | E2E тесты запускать после каждого PR |
