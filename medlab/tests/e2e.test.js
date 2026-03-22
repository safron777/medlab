/**
 * MedLab — E2E API tests
 * Run: node --test tests/e2e.test.js
 * Requires server running on PORT (default 4000)
 */

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { db } = require('../db.js');

const BASE = `http://127.0.0.1:${process.env.PORT || 4000}`;

// ── helpers ────────────────────────────────────────────────────────────────
const api = async (method, path, body, token) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
};

const get  = (path, token)        => api('GET',    path, null, token);
const post = (path, body, token)  => api('POST',   path, body, token);
const put  = (path, body, token)  => api('PUT',    path, body, token);
const del  = (path, token)        => api('DELETE', path, null, token);

// ── test state ─────────────────────────────────────────────────────────────
let token, testId, memberId;
const EMAIL    = `e2e_${Date.now()}@test.com`;
const PASSWORD = 'Test1234!';

// ── cleanup ────────────────────────────────────────────────────────────────
before(() => {
  db.prepare('DELETE FROM users WHERE email = ?').run(EMAIL);
});

after(() => {
  db.prepare('DELETE FROM users WHERE email = ?').run(EMAIL);
});

// ══════════════════════════════════════════════════════════════════════════
describe('Auth', () => {

  test('POST /api/auth/register — успешная регистрация', async () => {
    const r = await post('/api/auth/register', { email: EMAIL, password: PASSWORD, name: 'E2E Пользователь' });
    assert.equal(r.status, 200);
    assert.ok(r.body.token, 'должен вернуть token');
    assert.equal(r.body.user.email, EMAIL);
    token = r.body.token;
  });

  test('POST /api/auth/register — дубль email → 409', async () => {
    const r = await post('/api/auth/register', { email: EMAIL, password: PASSWORD, name: 'Дубль' });
    assert.equal(r.status, 409);
    assert.ok(r.body.error);
  });

  test('POST /api/auth/register — отсутствует поле → 400', async () => {
    const r = await post('/api/auth/register', { email: 'x@x.com', password: PASSWORD });
    assert.equal(r.status, 400);
  });

  test('POST /api/auth/login — успешный вход', async () => {
    const r = await post('/api/auth/login', { email: EMAIL, password: PASSWORD });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
    token = r.body.token;
  });

  test('POST /api/auth/login — неверный пароль → 401', async () => {
    const r = await post('/api/auth/login', { email: EMAIL, password: 'wrong' });
    assert.equal(r.status, 401);
  });

  test('POST /api/auth/login — несуществующий email → 401', async () => {
    const r = await post('/api/auth/login', { email: 'no@no.no', password: PASSWORD });
    assert.equal(r.status, 401);
  });

  test('GET /api/auth/me — возвращает профиль', async () => {
    const r = await get('/api/auth/me', token);
    assert.equal(r.status, 200);
    assert.equal(r.body.email, EMAIL);
  });

  test('GET /api/auth/me — без токена → 401', async () => {
    const r = await get('/api/auth/me');
    assert.equal(r.status, 401);
  });

  test('PUT /api/auth/profile — обновление профиля', async () => {
    const r = await put('/api/auth/profile', { name: 'Обновлено', sex: 'male', birthDate: '1990-01-15' }, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.sex, 'male');
    assert.equal(r.body.birthDate, '1990-01-15');
  });

  test('PUT /api/auth/profile — без имени → 400', async () => {
    const r = await put('/api/auth/profile', { sex: 'male' }, token);
    assert.equal(r.status, 400);
  });

});

// ══════════════════════════════════════════════════════════════════════════
describe('Tests (анализы)', () => {

  const PAYLOAD = {
    name: 'ОАК',
    category: 'blood',
    date: '2026-03-01',
    lab: 'Invitro',
    parameters: [
      { name: 'Гемоглобин', value: '145', unit: 'г/л', refLow: '132', refHigh: '173' },
      { name: 'Глюкоза',    value: '7.5', unit: 'ммоль/л', refLow: '3.9', refHigh: '6.1' },
    ],
  };

  test('POST /api/tests — создание анализа', async () => {
    const r = await post('/api/tests', PAYLOAD, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.name, 'ОАК');
    assert.equal(r.body.parameters.length, 2);
    testId = r.body.id;
  });

  test('POST /api/tests — без токена → 401', async () => {
    const r = await post('/api/tests', PAYLOAD);
    assert.equal(r.status, 401);
  });

  test('GET /api/tests — список анализов', async () => {
    const r = await get('/api/tests', token);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.tests));
    assert.ok(r.body.tests.length >= 1);
    assert.ok(r.body.tests.find(t => t.id === testId));
    assert.ok(typeof r.body.total === 'number');
    assert.ok(typeof r.body.pages === 'number');
  });

  test('GET /api/tests?search= — поиск работает', async () => {
    const r = await get('/api/tests?search=ОАК', token);
    assert.equal(r.status, 200);
    assert.ok(r.body.tests.find(t => t.id === testId));
  });

  test('GET /api/tests?category=blood — фильтр по категории', async () => {
    const r = await get('/api/tests?category=blood', token);
    assert.equal(r.status, 200);
    assert.ok(r.body.tests.every(t => t.category === 'blood'));
  });

  test('GET /api/tests — изоляция: чужие не видны', async () => {
    const r2 = await post('/api/auth/register', {
      email: `other_${Date.now()}@test.com`, password: PASSWORD, name: 'Другой'
    });
    const token2 = r2.body.token;
    const list = await get('/api/tests', token2);
    assert.equal(list.status, 200);
    assert.ok(!list.body.tests.find(t => t.id === testId), 'чужой анализ не должен быть виден');
    db.prepare('DELETE FROM users WHERE id = ?').run(r2.body.user.id);
  });

  test('PUT /api/tests/:id — обновление', async () => {
    const r = await put(`/api/tests/${testId}`, { ...PAYLOAD, name: 'ОАК обновлён', notes: 'примечание' }, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.name, 'ОАК обновлён');
    assert.equal(r.body.notes, 'примечание');
  });

  test('PUT /api/tests/:id — чужой → 403', async () => {
    const r2 = await post('/api/auth/register', {
      email: `hacker_${Date.now()}@test.com`, password: PASSWORD, name: 'Хакер'
    });
    const r = await put(`/api/tests/${testId}`, { ...PAYLOAD, name: 'взлом' }, r2.body.token);
    assert.ok([403, 404].includes(r.status));
    db.prepare('DELETE FROM users WHERE id = ?').run(r2.body.user.id);
  });

  test('GET /api/tests/parameter/:name — история показателя', async () => {
    const r = await get('/api/tests/parameter/%D0%93%D0%BB%D1%8E%D0%BA%D0%BE%D0%B7%D0%B0', token);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
    assert.ok(r.body.length >= 1);
    assert.equal(parseFloat(r.body[0].value), 7.5);
  });

  test('DELETE /api/tests/:id — удаление', async () => {
    // создаём второй анализ для удаления
    const tmp = await post('/api/tests', { ...PAYLOAD, name: 'Временный' }, token);
    const tmpId = tmp.body.id;
    const r = await del(`/api/tests/${tmpId}`, token);
    assert.equal(r.status, 200);
    assert.ok(r.body.success);
    const list = await get('/api/tests', token);
    assert.ok(!list.body.tests.find(t => t.id === tmpId));
  });

  test('DELETE /api/tests/:id — несуществующий → 404', async () => {
    const r = await del('/api/tests/nonexistent', token);
    assert.equal(r.status, 404);
  });

});

// ══════════════════════════════════════════════════════════════════════════
describe('Members (семья)', () => {

  test('GET /api/members — пустой список', async () => {
    const r = await get('/api/members', token);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  test('POST /api/members — добавление члена семьи', async () => {
    const r = await post('/api/members', { name: 'Мама', sex: 'female', birthDate: '1960-05-20', relation: 'mother' }, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.name, 'Мама');
    assert.ok(r.body.id);
    memberId = r.body.id;
  });

  test('POST /api/members — без имени → 400', async () => {
    const r = await post('/api/members', { sex: 'female' }, token);
    assert.equal(r.status, 400);
  });

  test('GET /api/members — содержит добавленного', async () => {
    const r = await get('/api/members', token);
    assert.ok(r.body.find(m => m.id === memberId));
  });

  test('PUT /api/members/:id — обновление', async () => {
    const r = await put(`/api/members/${memberId}`, { name: 'Мама обновлена', sex: 'female', birthDate: '1960-05-20' }, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.name, 'Мама обновлена');
  });

  test('DELETE /api/members/:id — удаление', async () => {
    const r = await del(`/api/members/${memberId}`, token);
    assert.equal(r.status, 200);
    assert.ok(r.body.success);
    const list = await get('/api/members', token);
    assert.ok(!list.body.find(m => m.id === memberId));
  });

});

// ══════════════════════════════════════════════════════════════════════════
describe('Export / Import', () => {

  test('GET /api/export — возвращает структуру бэкапа', async () => {
    const r = await get('/api/export', token);
    assert.equal(r.status, 200);
    assert.ok(r.body.exportedAt);
    assert.ok(r.body.version >= 1);
    assert.ok(Array.isArray(r.body.tests));
    assert.ok(r.body.profile);
    assert.ok(Array.isArray(r.body.members));
  });

  test('GET /api/export — без токена → 401', async () => {
    const r = await get('/api/export');
    assert.equal(r.status, 401);
  });

  test('POST /api/import — восстановление из бэкапа', async () => {
    // получаем бэкап
    const backup = (await get('/api/export', token)).body;
    const originalCount = backup.tests.length;

    // удаляем все анализы
    for (const t of backup.tests) await del(`/api/tests/${t.id}`, token);
    const after = (await get('/api/tests', token)).body;
    assert.equal(after.tests.length, 0);

    // импортируем
    const r = await post('/api/import', backup, token);
    assert.equal(r.status, 200);
    assert.ok(r.body.success);
    assert.equal(r.body.imported, originalCount);

    // проверяем восстановление
    const restored = (await get('/api/tests', token)).body;
    assert.equal(restored.tests.length, originalCount);
  });

  test('POST /api/import — дубли пропускаются', async () => {
    const backup = (await get('/api/export', token)).body;
    const r = await post('/api/import', backup, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.imported, 0);
    assert.equal(r.body.skipped, backup.tests.length);
  });

  test('POST /api/import — неверный формат → 400', async () => {
    const r = await post('/api/import', { bad: 'data' }, token);
    assert.equal(r.status, 400);
  });

});

// ══════════════════════════════════════════════════════════════════════════
describe('Password Reset', () => {

  test('POST /api/auth/reset-password-request — возвращает токен (dev)', async () => {
    const r = await post('/api/auth/reset-password-request', { email: EMAIL });
    assert.equal(r.status, 200);
    assert.ok(r.body.success);
    assert.ok(r.body.token, 'dev mode должен вернуть токен');
  });

  test('POST /api/auth/reset-password — смена пароля', async () => {
    const req = await post('/api/auth/reset-password-request', { email: EMAIL });
    const resetToken = req.body.token;
    const r = await post('/api/auth/reset-password', { token: resetToken, password: 'NewPass123!' });
    assert.equal(r.status, 200);
    assert.ok(r.body.success);
    // Восстанавливаем пароль
    await post('/api/auth/reset-password-request', { email: EMAIL }).then(async req2 => {
      await post('/api/auth/reset-password', { token: req2.body.token, password: PASSWORD });
    });
  });

  test('POST /api/auth/reset-password — неверный токен → 400', async () => {
    const r = await post('/api/auth/reset-password', { token: 'invalid-token', password: 'NewPass123!' });
    assert.equal(r.status, 400);
  });

  test('POST /api/auth/reset-password — слабый пароль → 400', async () => {
    const req = await post('/api/auth/reset-password-request', { email: EMAIL });
    const r = await post('/api/auth/reset-password', { token: req.body.token, password: '123' });
    assert.equal(r.status, 400);
  });

});

// ══════════════════════════════════════════════════════════════════════════
describe('Logout & JWT Revocation', () => {

  test('POST /api/auth/logout — токен инвалидируется', async () => {
    const loginRes = await post('/api/auth/login', { email: EMAIL, password: PASSWORD });
    const tmpToken = loginRes.body.token;
    const logoutRes = await post('/api/auth/logout', {}, tmpToken);
    assert.equal(logoutRes.status, 200);
    const meRes = await get('/api/auth/me', tmpToken);
    assert.equal(meRes.status, 401, 'токен должен быть отозван после logout');
  });

});

// ══════════════════════════════════════════════════════════════════════════
describe('Health (Sprint 5)', () => {

  test('GET /health — ok без авторизации', async () => {
    const res = await fetch(`${BASE}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok', 'status должен быть ok');
    assert.equal(body.db, 'ok', 'db должен быть ok');
    assert.ok(typeof body.uptime === 'number', 'uptime должен быть числом');
    assert.ok(typeof body.version === 'string', 'version должен быть строкой');
    assert.ok(body.timestamp, 'timestamp должен присутствовать');
  });

  test('GET /health — поле uptime растёт со временем', async () => {
    const r1 = await (await fetch(`${BASE}/health`)).json();
    const r2 = await (await fetch(`${BASE}/health`)).json();
    assert.ok(r2.uptime >= r1.uptime, 'uptime должен быть >= предыдущего');
  });

});

// ══════════════════════════════════════════════════════════════════════════
describe('CSV Export (Sprint 4)', () => {

  test('GET /api/export/csv — без токена → 401', async () => {
    const r = await get('/api/export/csv');
    assert.equal(r.status, 401);
  });

  test('GET /api/export/csv — возвращает text/csv с BOM и заголовком', async () => {
    const res = await fetch(`${BASE}/api/export/csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const ct = res.headers.get('content-type') || '';
    assert.ok(ct.includes('text/csv'), `Content-Type должен содержать text/csv, получили: ${ct}`);
    const text = await res.text();
    // BOM снимается при декодировании TextDecoder (fetch spec), проверяем содержимое
    assert.ok(text.includes('Дата'), 'первая строка должна содержать заголовок "Дата"');
    assert.ok(text.includes('Показатель'), 'первая строка должна содержать "Показатель"');
    assert.ok(text.includes('\r\n') || text.includes('\n'), 'должны быть строки CSV');
  });

  test('GET /api/export/csv — Content-Disposition содержит filename', async () => {
    const res = await fetch(`${BASE}/api/export/csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cd = res.headers.get('content-disposition') || '';
    assert.ok(cd.includes('attachment'), 'должен быть attachment');
    assert.ok(cd.includes('.csv'), 'filename должен заканчиваться на .csv');
  });

});

// ══════════════════════════════════════════════════════════════════════════
describe('Attachments (Story 8.1)', () => {

  let attachTestId;

  test('POST /api/tests — сохраняет вложения', async () => {
    const dataUrl = 'data:text/plain;base64,SGVsbG8gTWVkTGFi';
    const r = await post('/api/tests', {
      name: 'Тест с вложением',
      date: '2026-01-15',
      category: 'other',
      parameters: [],
      attachments: [{ name: 'report.txt', type: 'text/plain', size: 12, data: dataUrl }],
    }, token);
    assert.equal(r.status, 200);
    attachTestId = r.body.id;
    assert.ok(attachTestId, 'id должен присутствовать');
  });

  test('GET /api/tests — вложения включены в ответ', async () => {
    const data = (await get('/api/tests', token)).body;
    const saved = data.tests.find(t => t.id === attachTestId);
    assert.ok(saved, 'созданный тест должен быть в списке');
    assert.equal(saved.attachments.length, 1, 'должно быть 1 вложение');
    assert.equal(saved.attachments[0].name, 'report.txt');
    assert.equal(saved.attachments[0].data, 'data:text/plain;base64,SGVsbG8gTWVkTGFi');
  });

  test('PUT /api/tests/:id — обновление заменяет вложения', async () => {
    const newDataUrl = 'data:text/plain;base64,VXBkYXRlZA==';
    const r = await put(`/api/tests/${attachTestId}`, {
      name: 'Тест с вложением',
      date: '2026-01-15',
      category: 'other',
      parameters: [],
      attachments: [
        { name: 'report.txt', type: 'text/plain', size: 12, data: 'data:text/plain;base64,SGVsbG8gTWVkTGFi' },
        { name: 'updated.txt', type: 'text/plain', size: 7, data: newDataUrl },
      ],
    }, token);
    assert.equal(r.status, 200);
    const data = (await get('/api/tests', token)).body;
    const saved = data.tests.find(t => t.id === attachTestId);
    assert.equal(saved.attachments.length, 2, 'должно быть 2 вложения после PUT');
  });

  test('DELETE /api/tests/:id — каскадно удаляет вложения', async () => {
    await del(`/api/tests/${attachTestId}`, token);
    const count = db.prepare('SELECT COUNT(*) as n FROM attachments WHERE test_id = ?').get(attachTestId).n;
    assert.equal(count, 0, 'вложения должны быть удалены каскадно');
  });

});
