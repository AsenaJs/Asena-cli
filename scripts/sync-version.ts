#!/usr/bin/env bun

/**
 * PrePublish script to sync version across the codebase
 * This ensures version consistency before publishing to npm
 */

import { join } from 'path';

const ROOT_DIR = join(import.meta.dir, '..');
const PACKAGE_JSON_PATH = join(ROOT_DIR, 'package.json');
const COMMANDS_TS_PATH = join(ROOT_DIR, 'lib/commands/Commands.ts');
const README_PATH = join(ROOT_DIR, 'README.md');

interface PackageJson {
  version: string;
  [key: string]: any;
}

/**
 * Reads and parses package.json
 */
async function getPackageVersion(): Promise<string> {
  const packageJson = (await Bun.file(PACKAGE_JSON_PATH).json()) as PackageJson;

  return packageJson.version;
}

/**
 * Updates version in Commands.ts
 */
async function updateCommandsVersion(version: string): Promise<void> {
  const content = await Bun.file(COMMANDS_TS_PATH).text();

  // Replace the hardcoded version using regex
  const updatedContent = content.replace(
    /this\.program\.version\(['"][\d.]+['"]\);/,
    `this.program.version('${version}');`,
  );

  if (content === updatedContent) {
    console.warn('⚠️  No version found to update in Commands.ts');

    return;
  }

  await Bun.write(COMMANDS_TS_PATH, updatedContent);

  console.log(`✅ Updated Commands.ts version to ${version}`);
}

/**
 * Updates version badge in README.md
 */
async function updateReadmeVersion(version: string): Promise<void> {
  const content = await Bun.file(README_PATH).text();

  // Replace version badge
  const updatedContent = content.replace(
    /\[!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-[\d.]+-blue\.svg\)\]/,
    `[![Version](https://img.shields.io/badge/version-${version}-blue.svg)]`,
  );

  if (content === updatedContent) {
    console.warn('⚠️  No version badge found to update in README.md');

    return;
  }

  await Bun.write(README_PATH, updatedContent);

  console.log(`✅ Updated README.md version badge to ${version}`);
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🔄 Syncing version across codebase...\n');

    const version = await getPackageVersion();

    console.log(`📦 Current version: ${version}\n`);

    await updateCommandsVersion(version);

    await updateReadmeVersion(version);

    console.log('\n✨ Version sync completed successfully!');
  } catch (error) {
    console.error('❌ Error syncing version:', error);

    process.exit(1);
  }
}

main();
