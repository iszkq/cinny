import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Version must use major.minor.patch format');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const newVersionTag = `v${version}`;
const [androidMajor = 0, androidMinor = 0, androidPatch = 0] = version
  .split(/[.+-]/)
  .slice(0, 3)
  .map((segment) => Number.parseInt(segment, 10) || 0);
const androidVersionCode = androidMajor * 1_000_000 + androidMinor * 1_000 + androidPatch;

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
  'src-tauri/Cargo.lock',
  (content) => content.replace(/(name = "cinny-desktop"\r?\nversion = ")[^"]+"/, `$1${version}"`),
  `Updated src-tauri/Cargo.lock -> ${version}`
);

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

updateFile(
  'android/app/build.gradle',
  (content) =>
    content
      .replace(
        /^(\s*versionCode = \(project\.findProperty\("calculatorVersionCode"\) \?: )\d+/m,
        `$1${androidVersionCode}`
      )
      .replace(
        /^[ \t]*versionCode[ \t]+\d+[ \t]*\r?$/m,
        `        versionCode ${androidVersionCode}`
      )
      .replace(/^[ \t]*versionName[ \t]+"[^"]+"[ \t]*\r?$/m, `        versionName "${version}"`),
  `Updated android/app/build.gradle -> ${version} (${androidVersionCode})`
);

updateFile(
  'ios/App/App.xcodeproj/project.pbxproj',
  (content) => content.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`),
  `Updated iOS MARKETING_VERSION -> ${version}`
);

updateFile(
  'README.md',
  (content) => content.replace(/当前版本：`[^`]+`/, `当前版本：\`${version}\``),
  `Updated README.md -> ${version}`
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
