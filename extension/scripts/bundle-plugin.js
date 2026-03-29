#!/usr/bin/env node
/**
 * Copies plugin/channel/ and plugin/commands/ into the extension directory
 * and installs channel dependencies so they are included in the VSIX.
 */
const { cpSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');
const { execSync } = require('child_process');

const extensionRoot = join(__dirname, '..');
const pluginRoot = join(extensionRoot, '..', 'plugin');

// Copy channel server
const channelSrc = join(pluginRoot, 'channel');
const channelDest = join(extensionRoot, 'channel');
if (!existsSync(channelSrc)) {
  console.error('plugin/channel/ not found — skipping bundle');
  process.exit(1);
}
mkdirSync(channelDest, { recursive: true });
cpSync(channelSrc, channelDest, { recursive: true, filter: (src) => !src.includes('node_modules') });

// Install channel dependencies
console.log('Installing channel dependencies...');
execSync('npm install --omit=dev', { cwd: channelDest, stdio: 'inherit' });

// Copy commands
const commandsSrc = join(pluginRoot, 'commands');
const commandsDest = join(extensionRoot, 'commands');
if (existsSync(commandsSrc)) {
  mkdirSync(commandsDest, { recursive: true });
  cpSync(commandsSrc, commandsDest, { recursive: true });
}

console.log('Plugin bundled successfully.');
