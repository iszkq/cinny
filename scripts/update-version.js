import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const version = process.argv[2];

if (!version) {
  console.error('Version argument missing');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const newVersionTag = `v${version}`;

const updateFile = (relativePath, transform, successMessage) => {
  const absPath = path.join(root, relativePath);

  if (!fs.existsSync(absPath)) {
    console.warn(`File not found: ${relativePath}`);
    return;
  }

  const content = fs.readFileSync(absPath, 'utf8');
  const updated = transform(content);

  if (updated === content) {
    console.warn(`No changes made in ${relativePath}`);
    return;
  }

  fs.writeFileSync(absPath, updated);
  console.log(successMessage);
};

// Update package.json + package-lock.json safely
execSync(`npm version ${version} --no-git-tag-version`, {
  cwd: root,
  stdio: 'inherit',
});

console.log(`Updated package.json and package-lock.json -> ${version}`);

updateFile(
  'src-tauri/Cargo.toml',
  (content) => content.replace(/^version = "\d+\.\d+\.\d+"$/m, `version = "${version}"`),
  `Updated src-tauri/Cargo.toml -> ${version}`
);

updateFile(
  'src-tauri/tauri.conf.json',
  (content) => content.replace(/"version": "\d+\.\d+\.\d+"/, `"version": "${version}"`),
  `Updated src-tauri/tauri.conf.json -> ${version}`
);

[
  'src/app/features/settings/about/About.tsx',
  'src/app/pages/auth/AuthFooter.tsx',
  'src/app/pages/client/WelcomePage.tsx',
].forEach((filePath) => {
  updateFile(
    filePath,
    (content) => content.replace(/v\d+\.\d+\.\d+/g, newVersionTag),
    `Updated ${filePath} -> ${newVersionTag}`
  );
});
