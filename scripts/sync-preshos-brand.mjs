import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const source = resolve(process.argv[2] || '../presh-opsai-dash');
const css = readFileSync(resolve(source, 'app/globals.css'), 'utf8');
const tailwind = readFileSync(resolve(source, 'tailwind.config.mjs'), 'utf8');
if (!tailwind.includes("sans: ['Inter'"))
  throw new Error('Review the PRESHos font mapping before syncing.');
const split = css.indexOf('    .dark {');
const light = css.slice(css.indexOf('    :root {'), split);
const dark = css.slice(split);
const token = (block, name) => {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Missing PRESHos token: ${name}`);
  return `hsl(${match[1]})`;
};
const values = {
  brand: token(light, 'brand-blue'),
  brandHover: token(light, 'brand-blue-hover'),
  background: token(dark, 'background'),
  panel: token(dark, 'card'),
  border: token(dark, 'border'),
  text: token(dark, 'foreground'),
  muted: token(dark, 'muted'),
};
const out = 'apps/frontend/public/preshos';
mkdirSync(out, { recursive: true });
const assets = {
  'icon.svg': 'public/images/app-icon-primary.svg',
  'favicon.ico': 'app/favicon.ico',
};
for (const [target, path] of Object.entries(assets))
  copyFileSync(resolve(source, path), `${out}/${target}`);
const sourceRef = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: source,
  encoding: 'utf8',
}).trim();
const hashes = Object.fromEntries(
  ['app/globals.css', 'tailwind.config.mjs', ...Object.values(assets)].map(
    (path) => [
      path,
      createHash('sha256')
        .update(readFileSync(resolve(source, path)))
        .digest('hex'),
    ],
  ),
);
writeFileSync(
  `${out}/source.json`,
  JSON.stringify(
    {
      repository: 'presh-marketing/preshos',
      sourceRef,
      font: 'Inter',
      hashes,
      values,
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  'apps/frontend/src/app/preshos-brand.scss',
  `/* Generated from PRESHos ${sourceRef}; run scripts/sync-preshos-brand.mjs. */
:root .dark, :root .light {
  --presh-brand: ${values.brand};
  --presh-brand-hover: ${values.brandHover};
  --presh-ink: #0b0f14;
  --new-bgColor: ${values.background};
  --new-bgColorInner: ${values.panel};
  --new-border: ${values.border};
  --new-btn-primary: var(--presh-brand);
  --new-ai-btn: var(--presh-brand-hover);
  --new-textColor: 250 250 250;
  --new-btn-text: ${values.text};
  --new-settings: ${values.muted};
  --new-box-hover: ${values.muted};
  --new-table-border: ${values.border};
  --new-table-header: ${values.panel};
  --new-table-text-focused: var(--presh-brand);
  --color-custom50: var(--presh-brand);
  --color-forth: var(--presh-brand);
}
.preshos-auth { background: var(--new-bgColor); }
.preshos-auth-panel { background: var(--new-bgColorInner); }
.preshos-wordmark { display: inline-flex; align-items: center; gap: 12px; font-size: 28px; font-weight: 600; color: var(--new-btn-text); }
.bg-btnPrimary, .bg-forth { color: var(--presh-ink); }
.preshos-auth a { color: var(--presh-brand); }
.preshos-auth input:focus-visible, .preshos-auth button:focus-visible, .preshos-auth a:focus-visible { outline: 2px solid var(--presh-brand) !important; outline-offset: 3px; }
`,
);
