# CLAUDE.md — MedLab Project Context

## Project Overview

MedLab is a full-stack **Progressive Web Application (PWA)** for tracking and analyzing medical test results. It consists of:
- **Backend:** Node.js + Express 5 REST API with SQLite database.
- **Frontend:** Vanilla JavaScript ES modules served from `public/`, with Service Worker for offline support.

## Technology Stack

| Layer       | Technologies |
|-------------|--------------|
| Runtime     | Node.js 18+  |
| Web Server  | Express 5    |
| Database    | SQLite (via `better-sqlite3-multiple-ciphers`) + migration system |
| Auth        | JWT with bcrypt password hashing, token revocation (jti blacklist) |
| Validation  | Zod (request schemas) |
| Email       | Nodemailer (SMTP, fallback dev-mode token in response) |
| Frontend    | Vanilla JS modules, Chart.js, Service Worker, manifest.json |
| Testing     | Node.js native test runner (E2E), Vitest (unit) |
| Security    | Helmet, CORS, rate limiting, XSS prevention (`escapeHTML`) |

## Project Structure
