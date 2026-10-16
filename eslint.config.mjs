import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Os testes carregam o código em vm e guardam o resultado numa variável local chamada `module`.
  { files: ['tests/**'], rules: { '@next/next/no-assign-module-variable': 'off' } },
  globalIgnores(['.next/**', 'next-env.d.ts']),
])
