import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';

vi.mock('./DatabaseService', () => ({
  DatabaseService: { all: vi.fn(), allAsync: vi.fn(), get: vi.fn(), getDatabase: vi.fn() },
}));
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return { config: { ...actual.config, flashpointPath: '/nonexistent-flashpoint' } };
});

import { DatabaseService } from './DatabaseService';
import { GameService } from './GameService';
import { MatureContentService } from './MatureContentService';
import type { Game } from './GameService';

let db: BetterSqlite3.Database;

beforeEach(() => {
  db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE game (
      id TEXT PRIMARY KEY, title TEXT, alternateTitles TEXT, developer TEXT, publisher TEXT,
      series TEXT, platformName TEXT, platformsStr TEXT, library TEXT, orderTitle TEXT,
      tagsStr TEXT, extreme INTEGER DEFAULT 0
    );
    CREATE TABLE tag_category (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE tag (id INTEGER PRIMARY KEY, categoryId INTEGER);
    CREATE TABLE tag_alias (id INTEGER PRIMARY KEY, tagId INTEGER, name TEXT);
    CREATE TABLE game_tags_tag (gameId TEXT, tagId INTEGER, PRIMARY KEY (gameId, tagId));
    INSERT INTO tag_category VALUES (1, 'genre'), (2, 'meta'), (3, 'default');
    INSERT INTO tag VALUES (10, 1), (11, 3), (12, 2), (13, 1);
    INSERT INTO tag_alias VALUES (1, 10, 'Puzzle'), (2, 11, 'Cubes'), (3, 12, 'Auto-zipped'),
      (4, 13, 'Gore');
  `);
  const games: [string, string, string, string, string][] = [
    ['src', 'Cube Logic', 'Ann', 'Cube Logic', 'arcade'],
    ['sequel', 'Cube Logic 2', 'Ann', 'Cube Logic', 'arcade'],
    ['cubes', 'Cube Stack', 'Bo', '', 'arcade'],
    ['puzzle', 'Any Puzzle', 'Cy', '', 'arcade'],
    ['zipped', 'Also Zipped', 'Di', '', 'arcade'],
    ['gory', 'Gory Cubes', 'Ed', '', 'arcade'],
    ['cartoon', 'Cube Cartoon', 'Fi', '', 'theatre'],
  ];
  const insert = db.prepare(
    "INSERT INTO game (id, title, developer, series, library, platformName) VALUES (?, ?, ?, ?, ?, 'Flash')"
  );
  for (const game of games) insert.run(...game);
  const tag = db.prepare('INSERT INTO game_tags_tag VALUES (?, ?)');
  for (const [gameId, tagId] of [
    ['src', 10],
    ['src', 11],
    ['src', 12],
    ['sequel', 10],
    ['cubes', 10],
    ['cubes', 11],
    ['puzzle', 10],
    ['zipped', 12],
    ['gory', 11],
    ['gory', 13],
    ['cartoon', 11],
  ] as const) {
    tag.run(gameId, tagId);
  }
  // Puzzle is the common tag; give it more games so Cubes is the rarer, stronger match
  for (let i = 0; i < 20; i++) tag.run(`filler-${i}`, 10);

  vi.mocked(DatabaseService.all).mockImplementation(
    (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params) as unknown[]
  );
  vi.mocked(DatabaseService.allAsync).mockImplementation(
    async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params) as unknown[]
  );
  MatureContentService.invalidate();
});

afterEach(() => {
  db.close();
  vi.clearAllMocks();
});

function serviceFor(id: string): GameService {
  const service = new GameService();
  const source = db.prepare('SELECT * FROM game WHERE id = ?').get(id) as Game;
  vi.spyOn(service, 'getGameById').mockResolvedValue(source);
  return service;
}

describe('related games', () => {
  it('ranks the same series first, then games sharing rarer tags', async () => {
    const related = await serviceFor('src').getRelatedGames('src', 10);
    expect(related.map((game) => game.id)).toEqual(['sequel', 'cubes', 'puzzle']);
  });

  it('ignores meta tags, other libraries and mature games unless asked', async () => {
    const ids = (await serviceFor('src').getRelatedGames('src', 10)).map((game) => game.id);
    expect(ids).not.toContain('zipped');
    expect(ids).not.toContain('cartoon');
    expect(ids).not.toContain('gory');

    const withMature = await serviceFor('src').getRelatedGames('src', 10, true);
    expect(withMature.map((game) => game.id)).toContain('gory');
  });
});
