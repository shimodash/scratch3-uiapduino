// entry と拡張本体を 1 つの .mjs にまとめる。これが Xcratch に読ませるモジュール。
//
// 構成は xcratch/xcx-example (MIT License, Copyright (c) 2021-2024 Koji Yokokawa) の
// scripts/rollup.config.mjs に倣っている。Xcratch のローダは
// 「entry と blockClass を名前付きで export する 1 枚の ES モジュール」を期待しており、
// multi-entry で 2 つの入口を束ねるのがその作り方。

import path from 'path';
import fs from 'fs-extra';

import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import importImage from '@rollup/plugin-image';
import multi from '@rollup/plugin-multi-entry';
import json from '@rollup/plugin-json';

const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), './package.json'), 'utf-8'));
const EXTENSION_ID = packageJson.extensionId;
if (!EXTENSION_ID) {
    console.error('package.json に extensionId がありません');
    process.exit(1);
}

// src/vm/extensions/block の中身は sync-block.mjs が置いた複製。
// 実体はこのリポジトリの scratch-vm/src/extensions/scratch3_uiapduino で、
// デスクトップ版とまったく同じファイルをビルドしている。
const blockFile = path.resolve(process.cwd(), './src/vm/extensions/block/index.js');
const entryFile = path.resolve(process.cwd(), './src/gui/lib/libraries/extensions/entry/index.jsx');
const moduleFile = path.resolve(process.cwd(), './dist', `${EXTENSION_ID}.mjs`);

export default {
    input: [entryFile, blockFile],
    context: 'window',
    plugins: [
        multi(),
        importImage(),
        commonjs(),
        nodePolyfills(),
        nodeResolve({
            browser: true,
            preferBuiltins: false,
            modulePaths: [path.resolve(process.cwd(), './node_modules')]
        }),
        json(),
        babel({
            babelrc: false,
            exclude: ['node_modules/**'],
            presets: [
                ['@babel/preset-env', {
                    modules: false,
                    targets: {browsers: ['last 3 versions', 'Safari >= 8', 'iOS >= 8']}
                }],
                '@babel/preset-react'
            ],
            babelHelpers: 'runtime',
            plugins: [
                '@babel/plugin-transform-react-jsx',
                ['@babel/plugin-transform-runtime', {regenerator: true, useESModules: true}]
            ]
        })
    ],
    output: {
        file: moduleFile,
        format: 'es',
        sourcemap: true
    },
    watch: {
        clearScreen: false,
        chokidar: {usePolling: true},
        buildDelay: 500
    },
    external: []
};
