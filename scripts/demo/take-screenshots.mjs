#!/usr/bin/env node
// Takes the README's screenshots (docs/images) from an app running on the demo
// data, with a fresh user database. See docs/08-development/demo-data.md.
//
//   node scripts/demo/take-screenshots.mjs [base URL, default http://localhost:3100]
//
// Needs Playwright: npm install --no-save playwright && npx playwright install chromium
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:3100';
const images = join(dirname(new URL(import.meta.url).pathname), '../../docs/images');
const user = { username: 'demo', email: 'demo@example.com', password: 'demo-password' };

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1280, height: 1060 },
});
const page = await context.newPage();
const api = context.request;

async function call(method, url, data) {
  const response = await api.fetch(url, { method, data });
  if (!response.ok())
    throw new Error(`${method} ${url}: ${response.status()} ${await response.text()}`);
  return response.json();
}

const { needsSetup } = await call('GET', '/api/auth/setup-status');
if (needsSetup) await call('POST', '/api/auth/register', user);
const { tokens } = await call('POST', '/api/auth/login', {
  username: user.username,
  password: user.password,
});
const auth = { Authorization: `Bearer ${tokens.accessToken}` };

async function findGame(title) {
  const response = await api.post('/api/games', {
    data: { search: title, limit: 1 },
    headers: auth,
  });
  const [game] = (await response.json()).data;
  if (game?.title !== title) throw new Error(`demo game not found: ${title}`);
  return game;
}

// Recently played, oldest first, for the homepage's "Jump back in"
for (const title of [
  'Moon Mower',
  'Jelly Jump',
  'Laser Llama',
  'Lemonade Empire',
  'Crayon Kart',
  'Drum Doodle',
  'Pocket Pirates',
]) {
  const game = await findGame(title);
  const start = await api.post('/api/play/start', {
    data: { gameId: game.id, gameTitle: game.title },
    headers: auth,
  });
  const { sessionId } = await start.json();
  await api.post('/api/play/end', { data: { sessionId }, headers: auth });
}

async function settle() {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  await page.waitForTimeout(500);
}

await page.goto('/login');
await page.getByPlaceholder('Enter your username').fill(user.username);
await page.getByPlaceholder('Enter your password').fill(user.password);
await page.locator('button[type="submit"]').click();
await page.waitForURL((url) => url.pathname !== '/login');
await page.goto('/');
await settle();

// The Time Machine opens on a random week; travel to the one the demo fills
await page.getByTitle('Pick a date').click();
await page.getByRole('combobox', { name: /month/i }).selectOption({ label: 'Jun' });
await page.getByRole('combobox', { name: /year/i }).selectOption('2008');
await page.getByRole('button', { name: /June 16(th)?, 2008/ }).click();
await settle();
await page.screenshot({ path: join(images, 'home.png') });

const penguin = await findGame('Pixel Penguin Panic');
await page.goto(`/browse/${penguin.id}`);
await settle();
await page.screenshot({ path: join(images, 'game.png') });

await page
  .getByRole('button', { name: /^play$/i })
  .first()
  .click();
await page.waitForTimeout(6000);
await page.screenshot({ path: join(images, 'playing.png') });

await browser.close();
console.log(`Screenshots written to ${images}`);
