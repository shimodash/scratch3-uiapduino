#!/usr/bin/env node
//
// スケッチの .bin を base64 の .js に焼き直す。
//
//   sketches/ScratchUiapduino.ino.bin
//     → scratch-vm/src/extensions/scratch3_uiapduino/sketchBin.js
//
// 拡張機能に .bin を同梱するのは、拡張機能とスケッチの版を必ず一致させるため。
// 別々に配ると、今ある「プロトコルが合わないので焼き直してください」を
// 置き場所を変えて作り直すだけになる。
//
// ── なぜ .bin を直接 import しないのか ──────────────────────────────────
// この生成物は Xcratch 版 (rollup) とデスクトップ版 (webpack) の両方でビルドされる。
// バイナリを import するには双方にローダの設定が要るが、ただの .js にしておけば
// どちらもそのまま通る。
//
// ── なぜ npm run build に繋がないのか ───────────────────────────────────
// .bin を作るには arduino-cli が要る。持っていない環境でもビルドできるように、
// 生成物はリポジトリに追跡させ、このスクリプトは .ino を直したときだけ手で走らせる。
//
// 使い方 (xcratch/ で):
//   node ./scripts/embed-bin.mjs [.bin のパス]
//
// 出力は決定的。同じ .bin からは必ず同じ .js が出るので、
// 走らせ直しても中身が変わらなければ git の差分は出ない。

import path from 'path';
import crypto from 'crypto';
import fs from 'fs-extra';

/** CH32V003 の Flash。これを超える .bin は焼けない。 */
const FLASH_SIZE = 16384;

/** base64 を 1 行に詰める文字数。長い 1 行にすると差分が読めず lint にも掛かる。 */
const CHUNK = 80;

const projectDir = process.cwd();
const binPath = process.argv[2] ?
    path.resolve(process.argv[2]) :
    path.resolve(projectDir, '../sketches/ScratchUiapduino.ino.bin');
const inoPath = path.resolve(projectDir, '../sketches/ScratchUiapduino/ScratchUiapduino.ino');
const outPath = path.resolve(
    projectDir, '../scratch-vm/src/extensions/scratch3_uiapduino/sketchBin.js');

if (!fs.existsSync(binPath)) {
    console.error(`.bin がありません: ${binPath}`);
    console.error('arduino-cli でビルドして、.bin だけを sketches/ へ置いてください。');
    process.exit(1);
}

const bin = fs.readFileSync(binPath);

// 焼けないものを埋め込んでも、実機で初めて分かることになる。ここで止める。
if (bin.length > FLASH_SIZE) {
    console.error(`.bin が大きすぎます: ${bin.length} > ${FLASH_SIZE}`);
    process.exit(1);
}
if (bin.length === 0) {
    console.error(`.bin が空です: ${binPath}`);
    process.exit(1);
}

// プロトコル番号は .ino が持ち主。ここで写しておくと、拡張機能側の定数と
// 突き合わせて「.bin を作り直し忘れたまま配る」を実行時に弾ける。
if (!fs.existsSync(inoPath)) {
    console.error(`スケッチがありません: ${inoPath}`);
    process.exit(1);
}
const ino = fs.readFileSync(inoPath, 'utf-8');
const matched = ino.match(/^#define\s+PROTOCOL_VERSION\s+(\d+)/m);
if (!matched) {
    console.error(`PROTOCOL_VERSION を読めません: ${inoPath}`);
    process.exit(1);
}
const protocolVersion = Number(matched[1]);

const sha256 = crypto.createHash('sha256').update(bin)
    .digest('hex');
const base64 = bin.toString('base64');

const chunks = [];
for (let i = 0; i < base64.length; i += CHUNK) {
    chunks.push(`    '${base64.slice(i, i + CHUNK)}'`);
}

const source = `// このファイルは xcratch/scripts/embed-bin.mjs が作る。手で直さない。
//
// 中身は sketches/ScratchUiapduino.ino.bin をそのまま base64 にしたもの。
// 「スケッチを書き込む」ブロックが、これを基板の Flash へ流し込む。
//
// .ino を直したら、ビルドし直した .bin を sketches/ へ置いてから
//   node ./scripts/embed-bin.mjs
// を走らせ、この生成物と docs/uiapduino.mjs を一緒にコミットすること。

/**
 * 同梱している .bin (base64)。
 *
 * 1 行が長くなりすぎないように分けてあるだけで、繋げば元の 1 本に戻る。
 * @type {string}
 */
export const SKETCH_BIN_BASE64 = [
${chunks.join(',\n')}
].join('');

/** @type {number} 元の .bin の大きさ (バイト)。復号できたかの確認に使う */
export const SKETCH_BIN_SIZE = ${bin.length};

/** @type {string} 元の .bin の SHA-256。配布物と突き合わせるときに使う */
export const SKETCH_BIN_SHA256 = '${sha256}';

/**
 * この .bin が名乗るプロトコル番号 (.ino の PROTOCOL_VERSION)。
 *
 * uiapduinoProcessor.js の PROTOCOL_VERSION と食い違っていたら、
 * .bin を作り直し忘れている。書き込みブロックはその場合に焼かずに止まる。
 * @type {number}
 */
export const SKETCH_BIN_PROTOCOL_VERSION = ${protocolVersion};
`;

fs.writeFileSync(outPath, source);

console.log(`埋め込み: ${path.relative(projectDir, binPath)}`);
console.log(`  ${bin.length} バイト / SHA-256 ${sha256}`);
console.log(`  PROTOCOL_VERSION ${protocolVersion}`);
console.log(`出力: ${path.relative(projectDir, outPath)}`);
