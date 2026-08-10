#pragma once
#include <stdint.h>

/**
 * UIAPSerial — UIAPduino (CH32V003) の USART1 ドライバ
 *
 * arduino_core_ch32 の libraries/SDmin/examples/SDLog/ にあるものと同じ。
 * ライブラリではなくスケッチに同梱する決まりなので、ここへ複製してある
 * (core の README「UIAPSerial（推奨・デフォルト）」を参照)。
 *
 * ⚠ 標準の `Serial` (HardwareSerial) は使わない。
 *   一度も呼ばなくても Flash を約 4748 バイト消費する。UIAPduino は 16KB しか
 *   ないので、キーボードとマウスを載せたまま入る余地がない。
 *
 * ピン (固定):
 *   TX  PD5  = D15 (= A5)
 *   RX  PD6  = D16 (= A6)
 *
 * このドライバを begin() した時点で上の 4 つは使えなくなる。
 * 弾くのはスケッチ側 (digitalPinOk / analogChannelOk) の仕事。
 */
class UIAPSerial {
public:
  void    begin(uint32_t baud);

  // RX
  uint8_t available();
  uint8_t read();

  // TX
  void    write(uint8_t b);
  void    print(const char* s);
  void    println(const char* s = "");
};

extern UIAPSerial uart;
