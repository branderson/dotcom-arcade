import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';

/**
 * Tags in the Flashpoint launcher's default extreme filter groups (Pornography,
 * Fetishes, Violence, Bigotry, Pornography Extreme), for installs whose
 * preferences don't list them.
 */
const DEFAULT_EXTREME_TAGS: readonly string[] = [
  'Anal',
  'Anal Insertion',
  'Cartoon Porn',
  'Adult',
  'Anilingus',
  'Fingering',
  'Oral',
  'Sexual Content',
  'Cunnilingus',
  'Fellatio',
  'Footjob',
  'Handjob',
  'Interspecies',
  'Masturbation',
  'Paizuri',
  'Sex Toys',
  'Tentacles',
  'Touching',
  'Tribadism',
  'Vaginal',
  'Vaginal Insertion',
  'Futanari',
  'Male Futanari',
  'Gynomorph',
  'Andromorph',
  'Intersex',
  'Porn',
  'Fisting',
  'Hentai',
  'Group',
  'Solo',
  'Frottage',
  'Multiple Penises',
  'Ambiguous Penetration',
  'Self Oral',
  'Sex Simulator',
  'Undressing',
  'Age Regression',
  'Asphyxiophilia',
  'BDSM',
  'Bestiality',
  'Bimbofication',
  'Breast Milking',
  'Cannibalism',
  'Enema',
  'Expansion',
  'Flatulence',
  'Gloryhole',
  'Hypnosis',
  'Incest',
  'Infantilism',
  'Inflation',
  'Kabeshiri',
  'Macrophilia',
  'Muscle Growth',
  'Necrophilia',
  'Obesity',
  'Oviposition',
  'Podophilia',
  'Popping',
  'Pregnancy',
  'Quicksand',
  'Scat',
  'Selfcest',
  'Spanking',
  'Tickling',
  'Transformation',
  'Urination',
  'Vomit',
  'Vore',
  'Weight Gain',
  'Gachimuchi',
  'Gore',
  'Strong Violence',
  'Strong Language',
  'Homophobia',
  'Stereotyping',
  'Racism',
  'Transphobia',
  'Sexual Violence',
];

interface TagFilterGroup {
  extreme?: boolean;
  tags?: unknown;
}

let matureGameIds: string | null = null;
let matureGameIdSet: Set<string> | null = null;

/**
 * Decides which games are mature the way the Flashpoint launcher does: a game
 * carrying any tag from a tag filter group marked extreme. The game table's own
 * `extreme` flag is unset in current Flashpoint data, so it isn't enough alone.
 */
export class MatureContentService {
  /** Extreme tags from the install's preferences, else the launcher's defaults. */
  static extremeTagNames(): string[] {
    for (const file of ['preferences.json', '.preferences.defaults.json']) {
      try {
        const prefs = JSON.parse(fs.readFileSync(path.join(config.flashpointPath, file), 'utf8'));
        const groups: TagFilterGroup[] = Array.isArray(prefs.tagFilters) ? prefs.tagFilters : [];
        const tags = groups
          .filter((group) => group.extreme)
          .flatMap((group) => (Array.isArray(group.tags) ? group.tags : []))
          .filter((tag): tag is string => typeof tag === 'string');
        if (tags.length > 0) {
          return [...new Set(tags)];
        }
      } catch {
        // Missing or unreadable; try the next file
      }
    }
    return [...DEFAULT_EXTREME_TAGS];
  }

  /** JSON array of mature game IDs, computed once per database load. */
  static matureGameIdsJson(): string {
    if (matureGameIds === null) {
      const started = Date.now();
      const names = this.extremeTagNames();
      let rows: { gameId: string }[];
      try {
        rows = DatabaseService.all<{ gameId: string }>(
          `SELECT DISTINCT gt.gameId FROM game_tags_tag gt
           WHERE gt.tagId IN (
             SELECT ta.tagId FROM tag_alias ta
             WHERE ta.name COLLATE NOCASE IN (${names.map(() => '?').join(',')})
           )`,
          names
        );
      } catch (error) {
        // Without tag tables only the extreme flag can filter; retry on the next query
        logger.warn(
          '[MatureContent] Could not read game tags; filtering by the extreme flag only',
          error
        );
        return '[]';
      }
      matureGameIds = JSON.stringify(rows.map((row) => row.gameId));
      logger.info(
        `[MatureContent] ${rows.length} mature games from ${names.length} tags in ${Date.now() - started}ms`
      );
    }
    return matureGameIds;
  }

  static isMature(gameId: string): boolean {
    matureGameIdSet ??= new Set(JSON.parse(this.matureGameIdsJson()) as string[]);
    return matureGameIdSet.has(gameId);
  }

  /**
   * SQL condition excluding mature games; pushes its one parameter onto params.
   * Passing the IDs as JSON keeps it a plain parameter for the worker pool.
   */
  static excludeCondition(alias: string, params: unknown[]): string {
    params.push(this.matureGameIdsJson());
    return `(${alias}.extreme = 0 OR ${alias}.extreme IS NULL) AND ${alias}.id NOT IN (SELECT value FROM json_each(?))`;
  }

  /** Forget the computed set, after the database changes. */
  static invalidate(): void {
    matureGameIds = null;
    matureGameIdSet = null;
  }
}
