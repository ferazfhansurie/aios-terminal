console.log('process.type:', process.type)
console.log('process.versions.electron:', process.versions.electron)
console.log('process.versions.node:', process.versions.node)
const e = require('electron')
console.log('typeof electron:', typeof e)
if (typeof e === 'object' && e !== null) {
  console.log('electron.app:', typeof e.app)
} else {
  console.log('electron value:', e)
}
process.exit(0)
