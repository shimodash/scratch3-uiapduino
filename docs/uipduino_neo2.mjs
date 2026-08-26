// uiapduino_neo2.mjs - runtime patch module to add NeoPixel RGB-array support
// This module patches Scratch3Uiapduino prototype to add:
//  - neoSetRgbArray(args) : set an array of RGB colors (JSON string or native array)
//  - _neoWrite override      : resolve colors from direct RGB, string, or index into the array
// If the original class is already available as globalThis.Scratch3Uiapduino, the patch is applied automatically.

export function patchScratch3Uiapduino(Scratch3Uiapduino) {
  if (!Scratch3Uiapduino || !Scratch3Uiapduino.prototype) return;

  var proto = Scratch3Uiapduino.prototype;

  // keep original _neoWrite if present
  if (!proto._neoWrite_original) proto._neoWrite_original = proto._neoWrite;

  // helper to clamp to 0..255
  proto._neoByte = proto._neoByte || function (value) {
    var n = Number(value);
    if (!isFinite(n)) n = 0;
    n = Math.round(n);
    if (n < 0) n = 0;
    if (n > 255) n = 255;
    return n;
  };

  // Add neoSetRgbArray block implementation
  proto.neoSetRgbArray = proto.neoSetRgbArray || function (args) {
    // Accept either a JSON string (argument name: ARRAY or VALUE) or a JS array
    var raw = null;
    if (args && typeof args === 'object') {
      raw = args.ARRAY || args.VALUE || args.VALUE0 || args.VALUE1 || args.TEXT || null;
    } else {
      raw = args;
    }

    var arr = null;
    if (typeof raw === 'string') {
      var s = raw.trim();
      if (s.length === 0) {
        arr = [];
      } else {
        try {
          arr = JSON.parse(s);
        } catch (e) {
          // try a simple CSV / line based parser: each element r,g,b
          var lines = s.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
          arr = lines.map(function (line) {
            var parts = line.split(/[,;\s]+/).map(function (p) { return Number(p); });
            return parts;
          });
        }
      }
    } else if (Array.isArray(raw)) {
      arr = raw;
    }

    if (!Array.isArray(arr)) {
      // invalid input -> clear stored array and return
      this._neoRgbArray = null;
      if (typeof this.onConsoleText === 'function') this.onConsoleText('[uiapduino patch] invalid neo rgb array input');
      return;
    }

    // normalize each element to [r,g,b]
    var normalized = [];
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      if (!Array.isArray(item)) {
        // try if object with r,g,b keys
        if (item && typeof item === 'object' && 'r' in item && 'g' in item && 'b' in item) {
          normalized.push([this._neoByte(item.r), this._neoByte(item.g), this._neoByte(item.b)]);
          continue;
        }
        // skip invalid element
        continue;
      }
      if (item.length < 3) continue;
      normalized.push([this._neoByte(item[0]), this._neoByte(item[1]), this._neoByte(item[2])]);
    }

    this._neoRgbArray = normalized;
    if (typeof this.onConsoleText === 'function') this.onConsoleText('[uiapduino patch] neoRgbArray set, length=' + normalized.length);
  };

  // Override _neoWrite to accept index + rgb which can be:
  //  - [r,g,b] array (direct color)
  //  - number (index into _neoRgbArray)
  //  - string: either JSON '[r,g,b]' or 'r,g,b' or numeric index string
  proto._neoWrite = proto._neoWrite || function (index, rgb) {
    // ensure internal array exists
    if (this._neoRgbArray === undefined) this._neoRgbArray = null;

    var resolved = null;

    if (Array.isArray(rgb) && rgb.length >= 3) {
      resolved = [this._neoByte(rgb[0]), this._neoByte(rgb[1]), this._neoByte(rgb[2])];
    } else if (typeof rgb === 'number') {
      var idx = Math.floor(rgb);
      if (this._neoRgbArray && this._neoRgbArray[idx]) resolved = this._neoRgbArray[idx];
    } else if (typeof rgb === 'string') {
      var s = rgb.trim();
      // try JSON
      if (s.charAt(0) === '[') {
        try { var j = JSON.parse(s); if (Array.isArray(j) && j.length >= 3) resolved = [this._neoByte(j[0]), this._neoByte(j[1]), this._neoByte(j[2])]; } catch (e) {}
      }
      if (!resolved && s.indexOf(',') >= 0) {
        var parts = s.split(/[,;\s]+/).map(function (p) { return Number(p); });
        if (parts.length >= 3 && parts.every(isFinite)) resolved = [this._neoByte(parts[0]), this._neoByte(parts[1]), this._neoByte(parts[2])];
      }
      if (!resolved) {
        var n = parseInt(s, 10);
        if (!isNaN(n) && this._neoRgbArray && this._neoRgbArray[n]) resolved = this._neoRgbArray[n];
      }
    }

    if (!resolved) {
      // nothing to write
      return Promise.resolve();
    }

    // If there's a buffer (common implementation), write directly into it.
    // Many implementations store bytes as 3 bytes per pixel in this._neoBuffer or this._neo_pixels; adapt as available
    var pos = index * 3;
    if (this._neoBuffer && this._neoBuffer.length >= pos + 3) {
      this._neoBuffer[pos] = resolved[0] & 0xFF;
      this._neoBuffer[pos + 1] = resolved[1] & 0xFF;
      this._neoBuffer[pos + 2] = resolved[2] & 0xFF;
      // if auto show is available, trigger it
      if (typeof this._neoAutoShow === 'function') {
        try { return this._neoAutoShow(); } catch (e) { return Promise.resolve(); }
      }
      return Promise.resolve();
    }

    // try common alternative internal array names
    if (this._neo_pixels && this._neo_pixels.length >= pos + 3) {
      this._neo_pixels[pos] = resolved[0] & 0xFF;
      this._neo_pixels[pos + 1] = resolved[1] & 0xFF;
      this._neo_pixels[pos + 2] = resolved[2] & 0xFF;
      if (typeof this._neoAutoShow === 'function') {
        try { return this._neoAutoShow(); } catch (e) { return Promise.resolve(); }
      }
      return Promise.resolve();
    }

    // fallback: call original implementation if available
    if (typeof proto._neoWrite_original === 'function') {
      try {
        return proto._neoWrite_original.call(this, index, resolved);
      } catch (e) {
        return Promise.resolve();
      }
    }

    return Promise.resolve();
  };

  // Expose a convenience getter for the current array as a string
  proto.getNeoRgbArray = proto.getNeoRgbArray || function () {
    return this._neoRgbArray ? JSON.stringify(this._neoRgbArray) : '[]';
  };

}

// If the class is globally available, patch immediately
if (typeof globalThis !== 'undefined' && globalThis.Scratch3Uiapduino) {
  try { patchScratch3Uiapduino(globalThis.Scratch3Uiapduino); if (globalThis.console) globalThis.console.log('[uiapduino patch] applied automatically'); } catch (e) { if (globalThis.console) globalThis.console.warn('[uiapduino patch] failed to auto-apply', e); }
}

// Default export
export default patchScratch3Uiapduino;
