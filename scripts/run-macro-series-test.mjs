import { readFile, writeFile } from 'node:fs/promises'

const replacements = [
  ['dist-backend-test/backend/macroSeries.test.js', "from './macroSeries'", "from './macroSeries.js'"],
  ['dist-backend-test/backend/macroSeries.js', "from '../providers/live/adapters/censusAdapter'", "from '../providers/live/adapters/censusAdapter.js'"],
  ['dist-backend-test/providers/live/adapters/censusAdapter.js', "from '../types'", "from '../types.js'"],
  ['dist-backend-test/providers/live/adapters/censusAdapter.js', "from './shared'", "from './shared.js'"],
  ['dist-backend-test/providers/live/adapters/shared.js', "from '../types'", "from '../types.js'"]
]

for (const [file, find, replace] of replacements) {
  const current = await readFile(file, 'utf8')
  await writeFile(file, current.replace(find, replace), 'utf8')
}

await import('../dist-backend-test/backend/macroSeries.test.js')
