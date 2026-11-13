// Run: node --test web/js/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryAnomalies, detectSubscriptions, guessCategory, parseQuickEntry } from '../analytics.js';
import { DEMO_DATA } from '../demo_data.js';

const txs = DEMO_DATA.transactions;

test('quick entry parses amount, date words and income marker', () => {
  assert.deepEqual(parseQuickEntry('mercado 54,90 ontem', '2026-11-12'),
    { amount: 5490, kind: 'expense', date: '2026-11-11', description: 'Mercado' });
  assert.equal(parseQuickEntry('+ freela 1.200', '2026-11-12').amount, 120000);
  assert.equal(parseQuickEntry('+ freela 1.200', '2026-11-12').kind, 'income');
  assert.equal(parseQuickEntry('uber 23.5 10/11', '2026-11-12').date, '2026-11-10');
  assert.equal(parseQuickEntry('99 taxi 30', '2026-11-12').amount, 3000);
  assert.equal(parseQuickEntry('netflix', '2026-11-12'), null);
});

test('subscriptions: finds fixed monthly charges, skips frequent purchases', () => {
  const subs = detectSubscriptions(txs, { today: '2026-11-12' });
  const names = subs.map(s => s.name);
  for (const n of ['Netflix', 'Spotify', 'Aluguel', 'Celular (Vivo)']) assert.ok(names.includes(n), n);
  for (const n of ['iFood', 'Uber', 'Sushi Yama']) assert.ok(!names.includes(n), n);
  assert.equal(subs.find(s => s.name === 'Netflix').kind, 'subscription');
  assert.equal(subs.find(s => s.name === 'Netflix').monthly, 5590);
});

test('anomalies compare like-for-like days in a month in progress', () => {
  const rows = categoryAnomalies(txs, 2026, 11, 6, 12);
  assert.ok(rows.length > 0);
  for (const r of rows) assert.equal(r.diff, r.current - r.average);
});

test('category guess learns from history', () => {
  const id = guessCategory('ifood', txs);
  assert.equal(DEMO_DATA.categories.find(c => c.id === id).name, 'Alimentação');
});
