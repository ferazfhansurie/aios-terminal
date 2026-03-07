#!/usr/bin/env node
// Patches the Electron.app bundle name so the dock shows "AIOS Terminal" in dev mode
const { execSync } = require('child_process')
const path = require('path')

const plist = path.join(__dirname, '../node_modules/electron/dist/Electron.app/Contents/Info.plist')
const name = 'AIOS Terminal'

try {
  execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleName '${name}'" "${plist}"`)
  execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName '${name}'" "${plist}"`)
  console.log(`Renamed Electron.app to "${name}"`)
} catch (e) {
  console.warn('rename-electron: skipped (non-macOS or plist not found)')
}
