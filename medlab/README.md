# 🧬 MedLab — PWA для медицинских анализов

Прогрессивное веб-приложение для хранения, отслеживания и анализа медицинских показателей.

## 🚀 Быстрый старт

### Требования
- Node.js 18+

### Установка

```bash
cd medlab
npm install

# Скопируйте и заполните переменные окружения
cp ../.env.example .env
```

### Запуск

```bash
npm start          # http://localhost:3000
```

### Тесты

```bash
npm test           # e2e API-тесты (запускает сервер на PORT=4000)
```

---

## ✨ Возможности

| Функция | Описание |
|---------|----------|
| **Аутентификация** | Регистрация, вход, JWT с отзывом при logout |
| **Анализы** | CRUD с параметрами, референсами, вложениями |
| **Семья** | Отдельные профили для членов семьи |
| **Поиск / фильтры** | Серверный поиск по названию, лаборатории, врачу, параметрам |
| **Пагинация** | Постраничная загрузка (50 записей) |
| **Графики** | Динамика показателей (Chart.js) |
| **PDF-импорт** | Автоматическое распознавание результатов из PDF лабораторий |
| **Персональные нормы** | Референсы с учётом пола и возраста |
| **Расчётные показатели** | eGFR, HOMA-IR, коэффициент атерогенности |
| **Экспорт** | JSON-бэкап и CSV для Excel |
| **Сброс пароля** | Через email (SMTP) или dev-токен |
| **Удаление аккаунта** | Полное удаление данных (GDPR) |
| **Уведомления** | Push-напоминания о визитах к врачу |
| **PWA** | Работает офлайн, устанавливается на рабочий стол |

---

## 🏗 Структура проекта

```
medlab/
├── server.js                  # Express API
├── db.js                      # SQLite (better-sqlite3) + migration runner
├── lib/
│   └── mailer.js              # Nodemailer (SMTP)
├── middleware/
│   └── validate.js            # Zod validation middleware
├── validators/
│   ├── auth.schemas.js
│   ├── test.schemas.js
│   └── member.schemas.js
├── migrations/
│   ├── 001_initial.sql        # users, tests, parameters, jwt_blacklist…
│   ├── 002_add_test_name.sql
│   └── 003_password_reset.sql
├── scripts/
│   └── migrate-from-json.js   # Одноразовая миграция с JSON → SQLite
├── tests/
│   └── e2e.test.js            # 37 e2e тестов (node --test)
├── data/
│   └── medlab.db              # SQLite база (создаётся автоматически)
└── public/
    ├── index.html
    ├── css/app.css
    ├── sw.js                  # Service Worker (PWA)
    ├── manifest.json
    └── js/                    # ES-модули
        ├── app.js             # Точка входа + window exports
        ├── state.js           # Мутабельное состояние
        ├── api.js             # apiFetch, exportData, exportCsv
        ├── auth.js            # Login, register, profile, сброс пароля
        ├── tests.js           # CRUD анализов, рендеринг
        ├── members.js         # Профили членов семьи
        ├── dashboard.js       # Дашборд, уведомления, годовой отчёт
        ├── charts.js          # Chart.js графики
        ├── pdf-import.js      # PDF-парсер
        ├── navigation.js      # Страницы, оверлеи
        ├── constants.js       # Категории, референсы, расчёты
        └── utils.js           # escapeHTML, toast, formatDate…
```

---

## 🔐 Безопасность

- Пароли: **bcrypt** (12 раундов)
- JWT: 30 дней, с `jti` для отзыва при logout
- Rate limiting: 20 req/15 мин на auth, 200 req/мин на API
- Валидация входных данных: **zod** на каждом эндпоинте
- XSS: `escapeHTML()` во всех шаблонах

---

## 🌐 API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/register` | Регистрация |
| POST | `/api/auth/login` | Вход |
| POST | `/api/auth/logout` | Выход (отзыв токена) |
| GET  | `/api/auth/me` | Текущий пользователь |
| PUT  | `/api/auth/profile` | Обновление профиля |
| POST | `/api/auth/reset-password-request` | Запрос сброса пароля |
| POST | `/api/auth/reset-password` | Установка нового пароля |
| DELETE | `/api/account` | Удаление аккаунта |
| GET  | `/api/tests` | Список анализов (с поиском и пагинацией) |
| POST | `/api/tests` | Создать анализ |
| PUT  | `/api/tests/:id` | Обновить анализ |
| DELETE | `/api/tests/:id` | Удалить анализ |
| GET  | `/api/tests/parameter/:name` | История показателя |
| GET  | `/api/members` | Список членов семьи |
| POST | `/api/members` | Добавить |
| PUT  | `/api/members/:id` | Обновить |
| DELETE | `/api/members/:id` | Удалить |
| GET  | `/api/export` | JSON-бэкап |
| GET  | `/api/export/csv` | CSV для Excel |
| POST | `/api/import` | Восстановить из бэкапа |

### Query-параметры `GET /api/tests`

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `page` | number | 1 | Номер страницы |
| `limit` | number | 50 | Записей на страницу (макс. 100) |
| `search` | string | — | Поиск по названию, лаборатории, врачу, параметрам |
| `category` | string | — | `blood`, `urine`, `biochem`, `hormones`, `vitamins`, `other` |
| `dateFrom` | date | — | С даты (YYYY-MM-DD) |
| `dateTo` | date | — | По дату |
| `memberId` | string | — | UUID члена семьи |

---

## ⚙️ Переменные окружения

```bash
# Обязательно
JWT_SECRET=<64-байтный hex>   # node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Опционально
PORT=3000
NODE_ENV=production

# SMTP для сброса пароля (без настройки — dev-режим: токен в ответе API)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
SMTP_FROM=MedLab <your@email.com>

# Публичный URL приложения (используется в ссылке письма)
APP_URL=https://your-domain.com
```

---

## 📱 Установка как PWA

В Chrome/Safari: **«Установить приложение»** или **«Добавить на главный экран»**.

Приложение кешируется и работает офлайн (просмотр ранее загруженных данных).

---

## 🐳 Деплой

```bash
NODE_ENV=production JWT_SECRET=<secret> npm start
```

Или через systemd / Docker — сервер слушает `PORT` (по умолчанию 3000), пишет логи в stdout.
