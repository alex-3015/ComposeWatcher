import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import eslintConfigPrettier from 'eslint-config-prettier';
import vueParser from 'vue-eslint-parser';

export default tseslint.config(
  { ignores: ['dist/'] },
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  eslintConfigPrettier,
  {
    files: ['src/**/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }],
    },
  },
);
