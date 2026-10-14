import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';

vi.mock('./DatabaseService', () => ({
  DatabaseService: { all: vi.fn(), allAsync: vi.fn(), get: vi.fn(), getDatabase: vi.fn() },
}));
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
// No preferences file here, so the launcher's default extreme tags apply
vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return { config: { ...actual.config, flashpointPath: '/nonexistent-flashpoint' } };
});

import { DatabaseService } from './DatabaseService';
import { GameService } from './GameService';
import { MatureContentService } from './MatureContentService';

let db: BetterSqlite3.Database;

const games = [
  ['a', 'Ant Attack', '2008-06-03'],
  ['b', 'Bloodbath', '2008-06-04'],
  ['c', 'Cat Chase', '2008'],
  ['d', 'Dog Dash', '2008-06'],
  ['e', 'Eel Escape', '2008-06-09'],
  ['f', 'Frog Frenzy', '2008-06-08'],
];

beforeEach(() => {
  db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE game (
      id TEXT PRIMARY KEY, title TEXT, alternateTitles TEXT, developer TEXT, publisher TEXT,
      platformName TEXT, platformsStr TEXT, library TEXT, orderTitle TEXT, releaseDate TEXT, tagsStr TEXT,
      broken INTEGER DEFAULT 0, extreme INTEGER DEFAULT 0, launchCommand TEXT
    );
    CREATE TABLE game_data (id INTEGER PRIMARY KEY, gameId TEXT, launchCommand TEXT, presentOnDisk INTEGER);
    CREATE TABLE tag_alias (id INTEGER PRIMARY KEY, tagId INTEGER, name TEXT);
    CREATE TABLE game_tags_tag (gameId TEXT, tagId INTEGER, PRIMARY KEY (gameId, tagId));
    INSERT INTO tag_alias VALUES (1, 10, 'Gore'), (2, 11, 'Puzzle');
    INSERT INTO game_tags_tag VALUES ('b', 10), ('a', 11);
  `);
  const insert = db.prepare(
    "INSERT INTO game (id, title, orderTitle, releaseDate, platformName, library) VALUES (?, ?, lower(?), ?, 'HTML5', 'arcade')"
  );
  for (const [id, title, date] of games) insert.run(id, title, title, date);
  vi.mocked(DatabaseService.all).mockImplementation(
    (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params) as unknown[]
  );
  vi.mocked(DatabaseService.allAsync).mockImplementation(
    async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params) as unknown[]
  );
  vi.mocked(DatabaseService.get).mockImplementation(
    (sql: string, params: unknown[] = []) => db.prepare(sql).get(...params) as unknown
  );
  MatureContentService.invalidate();
});

afterEach(() => {
  db.close();
  vi.clearAllMocks();
});

const query = {
  sortBy: 'title',
  sortOrder: 'asc' as const,
  page: 1,
  limit: 50,
  showBroken: false,
  showExtreme: false,
  fields: 'list' as const,
};
const titles = (result: { data: { title: string }[] }) => result.data.map((g) => g.title);

describe('game search for discovery', () => {
  it('hides games with extreme tags unless asked to show them', async () => {
    expect(titles(await new GameService().searchGames(query))).not.toContain('Bloodbath');
    expect(titles(await new GameService().searchGames({ ...query, showExtreme: true }))).toContain(
      'Bloodbath'
    );
    expect(await new GameService().getRandomGame('arcade', undefined, false)).not.toMatchObject({
      id: 'b',
    });
  });

  it('finds games released in a date range, only where the day is known', async () => {
    const result = await new GameService().searchGames({
      ...query,
      showExtreme: true,
      releasedFrom: '2008-06-02',
      releasedTo: '2008-06-08',
      sortBy: 'releaseDate',
      sortOrder: 'desc',
    });
    expect(titles(result)).toEqual(['Frog Frenzy', 'Bloodbath', 'Ant Attack']);
  });

  it('shuffles by seed, consistently across pages', async () => {
    const service = new GameService();
    const shuffle = (seed: number, page: number, limit: number) =>
      service.searchGames({ ...query, showExtreme: true, sortBy: 'random', seed, page, limit });

    const all = titles(await shuffle(7, 1, 6));
    expect(titles(await shuffle(7, 1, 6))).toEqual(all);
    expect([...titles(await shuffle(7, 1, 3)), ...titles(await shuffle(7, 2, 3))]).toEqual(all);
    const others = await Promise.all(
      [1, 2, 3, 4, 5].map(async (seed) => titles(await shuffle(seed, 1, 6)))
    );
    expect(others.some((order) => order.join() !== all.join())).toBe(true);
  });
});
