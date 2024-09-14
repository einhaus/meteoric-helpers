/* eslint-disable @typescript-eslint/naming-convention */
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import sonarjs from 'eslint-plugin-sonarjs';
import prettier from 'eslint-plugin-prettier';
import globals from 'globals';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment, @typescript-eslint/prefer-ts-expect-error
// @ts-ignore
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [
    {
        ignores: ['**/.eslintrc.cjs', '**/node_modules/**/*', '**/dist/**/*', '**/test/**/*']
    },
    ...compat.extends('plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'),
    {
        plugins: {
            '@typescript-eslint': typescriptEslint,
            sonarjs,
            prettier
        },

        languageOptions: {
            globals: {
                ...globals.node
            },

            parser: tsParser,
            ecmaVersion: 5,
            sourceType: 'commonjs',

            parserOptions: {
                project: './tsconfig.json',
                projectFolderIgnoreList: ['**/node_modules/**', '**/dist/**', '**/test/**']
            }
        },

        rules: {
            'prefer-arrow-callback': 'error',
            'sonarjs/no-collapsible-if': 'error',
            'sonarjs/no-collection-size-mischeck': 'error',
            'sonarjs/no-duplicated-branches': 'error',
            'sonarjs/no-gratuitous-expressions': 'error',
            'sonarjs/no-nested-template-literals': 'error',
            'sonarjs/no-redundant-boolean': 'error',
            'sonarjs/no-unused-collection': 'error',
            'sonarjs/no-useless-catch': 'error',
            'sonarjs/prefer-object-literal': 'error',
            'sonarjs/no-all-duplicated-branches': 'error',
            'sonarjs/no-element-overwrite': 'error',
            'sonarjs/no-empty-collection': 'error',
            'sonarjs/no-extra-arguments': 'error',
            'sonarjs/no-identical-conditions': 'error',
            'sonarjs/no-identical-expressions': 'error',
            'sonarjs/no-ignored-return': 'error',
            'sonarjs/no-one-iteration-loop': 'error',
            'sonarjs/no-use-of-empty-return-value': 'error',
            'sonarjs/non-existent-operator': 'error',
            'for-direction': 'error',
            'no-prototype-builtins': 'error',
            'no-template-curly-in-string': 'error',
            'no-unsafe-negation': 'error',
            'array-callback-return': 'error',
            'block-scoped-var': 'error',
            eqeqeq: ['error', 'smart'],
            'guard-for-in': 'error',
            'no-alert': 'error',
            'no-caller': 'error',
            'no-div-regex': 'error',
            'no-eval': 'error',
            'no-extend-native': 'error',
            'no-extra-bind': 'error',
            'no-extra-label': 'error',
            'no-floating-decimal': 'error',
            'no-implied-eval': 'error',
            'no-iterator': 'error',
            'no-labels': 'error',
            'no-lone-blocks': 'error',
            'no-loop-func': 'error',
            'no-new': 'error',
            'no-new-func': 'error',
            'no-new-wrappers': 'error',
            'no-proto': 'error',
            'no-restricted-properties': 'error',
            'no-return-assign': 'error',
            'no-return-await': 'off',
            'no-self-compare': 'error',
            'no-throw-literal': 'error',
            'no-unmodified-loop-condition': 'error',
            'no-useless-call': 'error',
            'no-useless-concat': 'error',
            'no-useless-escape': 'error',
            'no-useless-return': 'error',
            'no-void': 'error',
            'no-with': 'error',
            'wrap-iife': 'error',
            yoda: 'error',
            'consistent-this': ['warn', 'that'],
            'func-name-matching': 'error',

            'func-style': [
                'warn',
                'declaration',
                {
                    allowArrowFunctions: true
                }
            ],

            'lines-between-class-members': [
                'error',
                'always',
                {
                    exceptAfterSingleLine: true
                }
            ],

            'max-statements': ['warn', 40],
            'max-depth': ['warn', 5],
            complexity: ['warn', 20],
            'max-params': ['warn', 5],
            'max-len': ['warn', 140],
            'no-array-constructor': 'warn',
            'no-bitwise': 'warn',
            'no-lonely-if': 'error',
            'no-multi-assign': 'warn',
            'no-nested-ternary': 'warn',
            'no-new-object': 'warn',
            'no-unneeded-ternary': 'warn',
            'one-var': ['warn', 'never'],
            'operator-assignment': 'warn',

            'padding-line-between-statements': [
                'error',
                {
                    blankLine: 'always',
                    prev: 'multiline-block-like',
                    next: '*'
                },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: 'multiline-block-like'
                },
                {
                    blankLine: 'always',
                    prev: 'multiline-const',
                    next: '*'
                },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: 'multiline-const'
                },
                {
                    blankLine: 'always',
                    prev: 'multiline-var',
                    next: '*'
                },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: 'multiline-var'
                },
                {
                    blankLine: 'always',
                    prev: 'multiline-let',
                    next: '*'
                },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: 'multiline-let'
                },
                {
                    blankLine: 'always',
                    prev: 'multiline-expression',
                    next: '*'
                },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: 'multiline-expression'
                }
            ],

            'no-duplicate-imports': 'error',
            'no-useless-computed-key': 'error',
            'no-useless-rename': 'error',
            'no-var': 'error',
            'object-shorthand': 'error',
            'prefer-const': 'error',

            'prefer-destructuring': [
                'warn',
                {
                    object: true,
                    array: false
                }
            ],

            'prefer-numeric-literals': 'warn',
            'prefer-rest-params': 'warn',
            'prefer-spread': 'warn',
            'prefer-template': 'warn',
            '@typescript-eslint/consistent-type-imports': 'error',
            'no-loss-of-precision': 'off',
            '@typescript-eslint/no-loss-of-precision': ['error'],
            '@typescript-eslint/no-unnecessary-type-constraint': 'error',
            '@typescript-eslint/adjacent-overload-signatures': 'error',
            '@typescript-eslint/array-type': 'error',
            '@typescript-eslint/promise-function-async': 'error',
            '@typescript-eslint/no-misused-new': 'error',
            '@typescript-eslint/await-thenable': 'error',
            'require-await': 'off',
            '@typescript-eslint/require-await': 'error',
            '@typescript-eslint/return-await': ['error', 'in-try-catch'],
            '@typescript-eslint/no-unsafe-return': 'error',
            '@typescript-eslint/prefer-ts-expect-error': 'error',

            '@typescript-eslint/consistent-type-assertions': [
                'error',
                {
                    assertionStyle: 'as',
                    objectLiteralTypeAssertions: 'allow'
                }
            ],

            '@typescript-eslint/no-array-constructor': 'error',
            '@typescript-eslint/switch-exhaustiveness-check': 'error',
            '@typescript-eslint/no-empty-interface': 'error',
            '@typescript-eslint/no-empty-function': 'error',
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unnecessary-qualifier': 'error',
            '@typescript-eslint/method-signature-style': ['error', 'property'],
            '@typescript-eslint/no-base-to-string': 'error',

            '@typescript-eslint/no-extraneous-class': [
                'error',
                {
                    allowStaticOnly: true
                }
            ],

            '@typescript-eslint/no-namespace': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',

            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_'
                }
            ],

            'no-useless-constructor': 'off',
            '@typescript-eslint/no-useless-constructor': 'error',
            '@typescript-eslint/prefer-string-starts-ends-with': 'error',
            '@typescript-eslint/prefer-includes': 'error',
            '@typescript-eslint/prefer-readonly': 'error',
            '@typescript-eslint/prefer-function-type': 'error',
            '@typescript-eslint/prefer-optional-chain': 'error',
            '@typescript-eslint/prefer-as-const': 'error',
            '@typescript-eslint/require-array-sort-compare': 'error',
            '@typescript-eslint/restrict-plus-operands': 'error',
            '@typescript-eslint/unified-signatures': 'error',
            '@typescript-eslint/no-floating-promises': 'error',

            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: 'default',
                    format: ['camelCase'],

                    filter: {
                        regex: '^(EventEmitter|WebSocket|child_process|Choices|Big|value)$',
                        match: false
                    }
                },
                {
                    selector: 'variable',
                    format: ['camelCase', 'PascalCase', 'UPPER_CASE']
                },
                {
                    selector: 'variable',
                    types: ['boolean'],
                    format: ['PascalCase'],
                    prefix: ['is', 'should', 'has', 'can', 'did', 'will', 'does', 'are', 'do']
                },
                {
                    selector: 'parameter',
                    format: ['camelCase'],
                    leadingUnderscore: 'allow'
                },
                {
                    selector: 'memberLike',
                    modifiers: ['private'],
                    format: ['camelCase']
                },
                {
                    selector: 'typeLike',
                    format: ['PascalCase']
                }
            ],

            '@typescript-eslint/restrict-template-expressions': [
                'error',
                {
                    allowNumber: true
                }
            ]
        }
    }
];
