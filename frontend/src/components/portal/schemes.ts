/**
 * Portal color schemes. Each scheme is a set of CSS custom properties: `--p-*` drive the
 * portal's own styles, the rest override the shadcn tokens so shared components match.
 */
export interface PortalScheme {
  label: string;
  tokens: Record<string, string>;
}

export const PORTAL_SCHEMES = {
  slate: {
    label: 'Slate',
    tokens: {
      '--p-bg': '#4c6878',
      '--p-bg-mix': '#2f4553',
      '--p-text': '#f1f5e9',
      '--p-meta': '#d3e4c1',
      '--p-box': '#c3dea2',
      '--p-box-end': '#87a96e',
      '--p-box-light': '#e6f3d3',
      '--p-highlight': '#fbfff3',
      '--p-header-ink': '#26371f',
      '--p-header-ink-soft': '#3d5232',
      '--p-select-glow': 'rgba(233, 246, 214, 0.55)',
      '--p-tile-top': '#050505',
      '--p-tile-bottom': '#3d3d3d',
      '--p-chrome-1': '#f4f4f4',
      '--p-chrome-2': '#8a8a8a',
      '--p-chrome-3': '#555555',

      '--background': '203 28% 25%',
      '--foreground': '80 41% 94%',
      '--card': '204 30% 21%',
      '--card-foreground': '80 41% 94%',
      '--popover': '204 30% 21%',
      '--popover-foreground': '80 41% 94%',
      '--primary': '87 48% 75%',
      '--primary-foreground': '103 28% 17%',
      '--secondary': '203 25% 33%',
      '--secondary-foreground': '80 41% 94%',
      '--muted': '203 25% 31%',
      '--muted-foreground': '89 39% 83%',
      '--accent': '203 25% 36%',
      '--accent-foreground': '80 41% 94%',
      '--destructive': '0 62% 45%',
      '--destructive-foreground': '80 41% 94%',
      '--border': '203 22% 40%',
      '--input': '203 22% 40%',
      '--ring': '87 48% 75%',
      '--scrollbar-track': '203 28% 22%',
      '--scrollbar-thumb': '95 26% 55%',
      '--scrollbar-thumb-hover': '87 48% 75%',
    },
  },
} satisfies Record<string, PortalScheme>;

export type PortalSchemeName = keyof typeof PORTAL_SCHEMES;

/**
 * Applies a scheme to <body>, which wins over the app theme on <html> and also reaches
 * dialogs and menus portalled into the body. Returns a function that removes it.
 */
export function applyPortalScheme(name: PortalSchemeName): () => void {
  const { tokens } = PORTAL_SCHEMES[name];
  const style = document.body.style;
  for (const [property, value] of Object.entries(tokens)) {
    style.setProperty(property, value);
  }
  document.body.classList.add('portal');
  return () => {
    for (const property of Object.keys(tokens)) {
      style.removeProperty(property);
    }
    document.body.classList.remove('portal');
  };
}
