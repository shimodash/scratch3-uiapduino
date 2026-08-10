/**
 * UIAPSerial.cpp — UIAPduino (CH32V003) の USART1 ドライバ
 *
 * arduino_core_ch32 の libraries/SDmin/examples/SDLog/UIAPSerial.cpp の複製。
 * 変えてあるのは _RX_BUF_SIZE だけ (64 → 256)。理由は下のコメントを参照。
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 tarosay
 */

#include <Arduino.h>
#include "UIAPSerial.h"

UIAPSerial uart;

// ── RX リングバッファ (割り込み駆動) ─────────────────────────────────────────
//
// ⚠ 元は 64 バイト。ここでは 256 にしてある。
//
//   このスケッチはコマンドを 1 つずつ処理するので、1 つのコマンドを実行している
//   間はホストがバッファを吸い出せない。いちばん長いのはキーボードのタイプで、
//   29 文字なら約 1.2 秒デバイスを占有する (1 文字 40ms)。
//
//   その間も受信は割り込みで積まれ続ける。64 バイトでは 9600 baud で 67ms 分
//   しかなく、1 回タイプしただけで溢れる。256 なら 266ms 分。
//   10Hz で 1 行 12 バイトのセンサーなら 2.1 秒分になり、タイプ 1 回を挟んでも
//   取りこぼさない。
//
//   ⚠ 256 が上限。_rxHead / _rxTail が uint8_t なので、これ以上にするなら
//     インデックスを uint16_t にする必要がある (RAM も 2048 しかない)。
//
// サイズは 2 の累乗にすること。ビットマスクでインデックスを回している。
#define _RX_BUF_SIZE 256u
static volatile uint8_t _rxBuf[_RX_BUF_SIZE];
static volatile uint8_t _rxHead = 0;   // ISR が書く
static volatile uint8_t _rxTail = 0;   // メインループが読む

// USART1 RX 割り込みハンドラ
// RXNE または ORE 発生時に DATAR を読み出してリングバッファへ格納。
// DATAR の読み出しにより RXNE / ORE フラグが自動クリアされる。
// バッファ満杯の場合は最新バイトを破棄（先着優先）。
extern "C" __attribute__((interrupt)) void USART1_IRQHandler(void);
void USART1_IRQHandler(void) {
    if (USART1->STATR & (USART_FLAG_RXNE | USART_FLAG_ORE)) {
        uint8_t b = (uint8_t)(USART1->DATAR & 0xFFu);   // 読み出しで RXNE/ORE クリア
        uint8_t next = (uint8_t)((_rxHead + 1u) & (_RX_BUF_SIZE - 1u));
        if (next != _rxTail) {   // バッファ満杯でなければ格納（満杯時は破棄）
            _rxBuf[_rxHead] = b;
            _rxHead = next;
        }
    }
}

// ── USART1 送受信初期化 ───────────────────────────────────────────────────────
// TX = PD5 (AF push-pull 2MHz), RX = PD6 (入力プルアップ)
void UIAPSerial::begin(uint32_t baud)
{
  RCC->APB2PCENR |= RCC_APB2Periph_GPIOD | RCC_APB2Periph_USART1;

  // PD5: AF push-pull 2MHz (CNF=10, MODE=10 → 0xA)
  // PD6: 入力プルアップ    (CNF=10, MODE=00 → 0x8)
  GPIOD->CFGLR = (GPIOD->CFGLR & ~((0xFu << 20) | (0xFu << 24)))
               | (0xAu << 20)   // PD5 TX: AF push-pull 2MHz
               | (0x8u << 24);  // PD6 RX: input pull-up
  GPIOD->OUTDR |= (1u << 6);    // PD6 プルアップ有効

  // ボーレート設定 (クロック 48MHz)
  USART1->BRR   = (uint16_t)(48000000UL / baud);

  // RXNEIE: RXNE割り込み有効 (ビット5)
  USART1->CTLR1 = USART_Mode_Rx | USART_Mode_Tx | USART_CTLR1_UE | USART_CTLR1_RXNEIE;

  // 受信バッファクリア・ORE クリア
  volatile uint16_t dummy = USART1->DATAR;
  (void)dummy;

  // NVIC: USART1 割り込み有効化
  NVIC_EnableIRQ(USART1_IRQn);
}

// ── RX: 受信データあり？ ──────────────────────────────────────────────────────
uint8_t UIAPSerial::available()
{
  return (_rxHead != _rxTail) ? 1u : 0u;
}

// ── RX: 1 バイト読み出し ──────────────────────────────────────────────────────
uint8_t UIAPSerial::read()
{
  if (_rxHead == _rxTail) return 0u;
  uint8_t b = _rxBuf[_rxTail];
  _rxTail = (uint8_t)((_rxTail + 1u) & (_RX_BUF_SIZE - 1u));
  return b;
}

// ── TX: 1 バイト送信 ──────────────────────────────────────────────────────────
void UIAPSerial::write(uint8_t b)
{
  while (!(USART1->STATR & USART_FLAG_TXE)) {}
  USART1->DATAR = b;
}

// ── TX: 文字列送信 ────────────────────────────────────────────────────────────
void UIAPSerial::print(const char* s)
{
  while (*s) write((uint8_t)*s++);
}

// ── TX: 文字列送信 + CRLF ─────────────────────────────────────────────────────
void UIAPSerial::println(const char* s)
{
  print(s);
  write('\r');
  write('\n');
}
