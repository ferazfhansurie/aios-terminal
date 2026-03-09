import fs from 'fs'
import path from 'path'
import os from 'os'

export interface AiosInstance {
  id: string
  name: string
  path: string
  created: number
}

const AIOS_DIR = path.join(os.homedir(), '.aios')
const REGISTRY_PATH = path.join(AIOS_DIR, 'instances.json')
const DEFAULT_INSTANCE_PATH = path.join(os.homedir(), 'Repo/firaz/adletic/aios-firaz')

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readRegistry(): AiosInstance[] {
  if (!fs.existsSync(REGISTRY_PATH)) return []
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
  } catch {
    return []
  }
}

function writeRegistry(instances: AiosInstance[]) {
  ensureDir(AIOS_DIR)
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(instances, null, 2), 'utf-8')
}

/** Ensure the default aios-firaz instance is registered */
export function ensureDefaultInstance(): AiosInstance {
  let instances = readRegistry()
  const existing = instances.find(i => i.path === DEFAULT_INSTANCE_PATH)
  if (existing) return existing

  const def: AiosInstance = {
    id: 'aios-firaz',
    name: 'Adletic (Firaz)',
    path: DEFAULT_INSTANCE_PATH,
    created: Date.now(),
  }
  instances.unshift(def)
  writeRegistry(instances)
  return def
}

export function listInstances(): AiosInstance[] {
  ensureDefaultInstance()
  return readRegistry()
}

export function getActiveInstanceId(): string {
  const activePath = path.join(AIOS_DIR, 'active')
  if (fs.existsSync(activePath)) {
    const id = fs.readFileSync(activePath, 'utf-8').trim()
    const instances = readRegistry()
    if (instances.find(i => i.id === id)) return id
  }
  return ensureDefaultInstance().id
}

export function setActiveInstanceId(id: string) {
  ensureDir(AIOS_DIR)
  fs.writeFileSync(path.join(AIOS_DIR, 'active'), id, 'utf-8')
}

export function getInstanceById(id: string): AiosInstance | undefined {
  return readRegistry().find(i => i.id === id)
}

export function getActiveInstance(): AiosInstance {
  const id = getActiveInstanceId()
  return getInstanceById(id) || ensureDefaultInstance()
}

/** Create a new instance by copying the template directory */
export function createInstance(name: string, templateDir: string): AiosInstance {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const id = `aios-${slug}-${Date.now().toString(36)}`

  // Create instance directory next to the default
  const parentDir = path.dirname(DEFAULT_INSTANCE_PATH)
  const instancePath = path.join(parentDir, id)

  // Copy template recursively
  copyDirSync(templateDir, instancePath)

  const instance: AiosInstance = {
    id,
    name,
    path: instancePath,
    created: Date.now(),
  }

  const instances = readRegistry()
  instances.push(instance)
  writeRegistry(instances)

  return instance
}

export function deleteInstance(id: string): boolean {
  const instances = readRegistry()
  const instance = instances.find(i => i.id === id)
  if (!instance) return false
  // Don't delete the default
  if (instance.path === DEFAULT_INSTANCE_PATH) return false

  // Remove from registry
  writeRegistry(instances.filter(i => i.id !== id))

  // Remove directory
  if (fs.existsSync(instance.path)) {
    fs.rmSync(instance.path, { recursive: true, force: true })
  }

  return true
}

export function renameInstance(id: string, newName: string): boolean {
  const instances = readRegistry()
  const instance = instances.find(i => i.id === id)
  if (!instance) return false
  instance.name = newName
  writeRegistry(instances)
  return true
}

/** Check if a directory looks like an AIOS-compatible folder (.claude/ exists) */
export function isAiosFolder(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, '.claude'))
}

/** Add an existing AIOS folder as an instance */
export function addExistingFolder(folderPath: string): AiosInstance | null {
  const resolved = path.resolve(folderPath)
  if (!isAiosFolder(resolved)) return null

  const instances = readRegistry()
  // Don't add duplicates
  const existing = instances.find(i => i.path === resolved)
  if (existing) return existing

  const folderName = path.basename(resolved)
  const slug = folderName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const id = `aios-${slug}-${Date.now().toString(36)}`

  const instance: AiosInstance = {
    id,
    name: folderName,
    path: resolved,
    created: Date.now(),
  }

  instances.push(instance)
  writeRegistry(instances)
  return instance
}

function copyDirSync(src: string, dest: string) {
  ensureDir(dest)
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
