import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/'] },
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  eslintConfigPrettier,
  {
    files: ['src/**/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }],
    },
  },
);
