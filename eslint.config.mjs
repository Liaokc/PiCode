import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', '.worktrees/**'] },
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['**/*.d.ts'],
    rules: {
      // Ambient interface merging (e.g. ImportMetaEnv augmentation) looks "unused" to the rule.
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error'
    }
  }
)
