import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const config = vi.hoisted(() => ({ flashpointPath: '' }));
vi.mock('../config', () => ({ config }));
vi.mock('./DatabaseService', () => ({ DatabaseService: { all: vi.fn() } }));
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { MatureContentService } from './MatureContentService';

describe('MatureContentService.extremeTagNames', () => {
  beforeEach(() => {
    config.flashpointPath = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-prefs-'));
  });

  it("uses the tags of the install's extreme filter groups", () => {
    fs.writeFileSync(
      path.join(config.flashpointPath, 'preferences.json'),
      JSON.stringify({
        tagFilters: [
          { name: 'Violence', extreme: true, tags: ['Gore', 'Strong Language'] },
          { name: 'Mature Topics', extreme: false, tags: ['Drugs'] },
          { name: 'Custom', extreme: true, tags: ['Gore', 'Crude Humor'] },
        ],
      })
    );
    expect(MatureContentService.extremeTagNames()).toEqual([
      'Gore',
      'Strong Language',
      'Crude Humor',
    ]);
  });

  it("falls back to the launcher's defaults without preferences", () => {
    const names = MatureContentService.extremeTagNames();
    expect(names).toContain('Adult');
    expect(names).toContain('Strong Language');
    expect(names).not.toContain('Drugs');
  });
});
