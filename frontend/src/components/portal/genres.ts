/** Genre tags offered as categories, with shorter labels where the tag is long */
export const GENRES: readonly { tag: string; label?: string }[] = [
  { tag: 'Action' },
  { tag: 'Adventure' },
  { tag: 'Puzzle' },
  { tag: 'Shooter' },
  { tag: 'Platformer' },
  { tag: 'Sports' },
  { tag: 'Strategy' },
  { tag: 'Driving' },
  { tag: 'Escape the Room', label: 'Escape' },
  { tag: 'Dress Up' },
];

const GENRE_TAGS = new Set([...GENRES.map((genre) => genre.tag), 'Arcade', 'Simulation', 'Toy']);

/** The first genre among a game's semicolon-separated tags, else its first tag */
export function primaryGenre(tagsStr: string | undefined): string | undefined {
  const tags = (tagsStr ?? '')
    .split(';')
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.find((tag) => GENRE_TAGS.has(tag)) ?? tags[0];
}
