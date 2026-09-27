import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  // Absent in files that opt into the node environment (e.g. src/theme tests).
  globalThis.localStorage?.clear()
})
