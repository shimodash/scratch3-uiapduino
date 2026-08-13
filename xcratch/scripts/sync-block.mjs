#!/usr/bin/env node
//
// 拡張本体を src/vm/extensions/block/ へコピーする。npm run build の前に自動で走る。
//
// 実体は scratch-vm/src/extensions/scratch3_uiapduino/ にあり、デスクトップ版と共有している。
// 直すのは必ずそちら。ここに置かれるのは複製で、ビルドのたびに上書きされる
// (.gitignore で追跡もしていない)。
//
// ── なぜリンクではなくコピーなのか ────────────────────────────────────────
// 最初はジャンクションで繋いでいたが、rollup がリンクを実体パスへ解決するため、
// 本体の中の `../../util/cast` がこのリポジトリ側 (scratch-vm/src/util) を指してしまい、
// そこには何も置いていないので解決できなかった。
// rollup の preserveSymlinks を立てても変わらなかった。
// 実ファイルとして置けば、xcx-example と同じ形になり小細工が要らない。

import path from 'path';
import fs from 'fs-extra';

const projectDir = process.cwd();
const srcDir = path.resolve(projectDir, '../scratch-vm/src/extensions/scratch3_uiapduino');
const dstDir = path.resolve(projectDir, 'src/vm/extensions/block');

// ⚠ 拡張本体が読むファイルを増やしたら、ここにも足すこと。
//   足さないと複製されず、rollup が解決できずにビルドが落ちる。
//   sketchBin.js は embed-bin.mjs の生成物。
const files = ['index.js', 'uiapduinoProcessor.js', 'rv003usbFlasher.js', 'sketchBin.js'];

if (!fs.existsSync(srcDir)) {
    console.error(`拡張本体が見つかりません: ${srcDir}`);
    process.exit(1);
}

fs.ensureDirSync(dstDir);
files.forEach(name => {
    const from = path.resolve(srcDir, name);
    if (!fs.existsSync(from)) {
        console.error(`ありません: ${from}`);
        process.exit(1);
    }
    fs.copySync(from, path.resolve(dstDir, name));
    console.log(`コピー: ${name}`);
});
