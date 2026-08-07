#!/usr/bin/env node
//
// ビルドに必要なリンクを張る。ビルドの前に一度だけ実行する。
//
// xcratch/src/vm/ の下に、scratch-vm から借りる 2 つのリンクを張る。
//
//   extension-support -> <scratch-vm>/src/extension-support   (ArgumentType / BlockType)
//   util              -> <scratch-vm>/src/util                (Cast)
//
// 拡張本体 (extensions/block) はここでは扱わない。sync-block.mjs がコピーしていて、
// npm run build のたびに自動で走る。理由はそちらのコメントを参照。
//
// ⚠ Windows ではシンボリックリンクに開発者モードか管理者権限が要る。
//   ジャンクションなら一般ユーザ権限で作れて、Node からも rollup からも
//   ふつうのディレクトリに見える。build-scratch3-uiapduino.ps1 が
//   scratch-gui を node_modules へ入れるときと同じ理由。
//
// 使い方:
//   node ./scripts/setup-dev.mjs <scratch-vm へのパス>
//   省略時は ../scratch-vm を見る。

import path from 'path';
import fs from 'fs-extra';

const linkType = process.platform === 'win32' ? 'junction' : 'dir';

const projectDir = process.cwd();
const vmPath = process.argv[2] || '../scratch-vm';
const vmSrc = path.resolve(projectDir, vmPath, 'src');

if (!fs.existsSync(vmSrc)) {
    console.error(`scratch-vm が見つかりません: ${vmSrc}`);
    console.error('build-scratch3-uiapduino.ps1 が clone したものを指すか、別途 clone してください。');
    process.exit(1);
}

/**
 * リンクを 1 つ張る。既に同じ先を指していれば何もしない。
 * @param {string} target - リンク先 (実体)
 * @param {string} linkPath - 作る場所
 * @returns {void}
 */
const makeLink = (target, linkPath) => {
    if (!fs.existsSync(target)) {
        console.error(`リンク先がありません: ${target}`);
        process.exit(1);
    }
    try {
        const stats = fs.lstatSync(linkPath);
        if (stats.isSymbolicLink()) {
            if (path.resolve(fs.readlinkSync(linkPath)) === path.resolve(target)) {
                console.log(`そのまま: ${linkPath}`);
                return;
            }
            fs.unlinkSync(linkPath);
        } else {
            // リンクではない実体が居座っている。消さずに退避する。
            fs.renameSync(linkPath, `${linkPath}~`);
            console.log(`退避: ${linkPath} -> ${linkPath}~`);
        }
    } catch (err) {
        // まだ無い。作るだけ。
    }
    fs.ensureDirSync(path.dirname(linkPath));
    fs.symlinkSync(target, linkPath, linkType);
    console.log(`張った: ${linkPath} -> ${target}`);
};

const vmDev = path.resolve(projectDir, 'src/vm');

makeLink(path.resolve(vmSrc, 'extension-support'), path.resolve(vmDev, 'extension-support'));
makeLink(path.resolve(vmSrc, 'util'), path.resolve(vmDev, 'util'));
