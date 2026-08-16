// Minimal baseline-JPEG decoder — just enough to read the pixels of a tiny
// face thumbnail so face.js can build an embedding.
//
// WHY THIS EXISTS: React Native has no <canvas>, and expo-image-manipulator
// hands back a JPEG (as base64), not raw pixels. To turn a photo into a numeric
// vector on the device we have to decode those bytes ourselves. The images we
// decode here are 16x16, so a compact, obviously-correct decoder beats a fast
// one; a full-frame decoder is never asked for.
//
// Supports: baseline sequential DCT, Huffman, grayscale or YCbCr, any sampling
// factors. Does NOT support progressive JPEG. expo-image-manipulator writes
// baseline JPEG, so that is fine — and decodeJpegGray returns null rather than
// throwing if it ever meets something it does not understand.

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];

function base64ToBytes(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = String(b64).replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = chars.indexOf(clean[i]);
    const c1 = chars.indexOf(clean[i + 1]);
    const c2 = chars.indexOf(clean[i + 2]);
    const c3 = chars.indexOf(clean[i + 3]);
    const n = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3);
    out[p++] = (n >> 16) & 255;
    if (c2 >= 0) out[p++] = (n >> 8) & 255;
    if (c3 >= 0) out[p++] = n & 255;
  }
  return out.subarray(0, p);
}

function buildHuffmanTable(codeLengths, values) {
  // Maps a (length, code) pair to a value via successive canonical codes.
  const table = new Map();
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < codeLengths[len - 1]; i++) {
      table.set(`${len}:${code}`, values[k++]);
      code++;
    }
    code <<= 1;
  }
  return table;
}

function idct2d(block, out) {
  // Straightforward separable float IDCT. 16x16 images mean a handful of
  // blocks, so clarity is worth more than speed here.
  const tmp = new Float32Array(64);
  for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
      tmp[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16) * (u === 0 ? Math.SQRT1_2 : 1);
    }
  }
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let sum = 0;
      for (let v = 0; v < 8; v++) {
        for (let u = 0; u < 8; u++) {
          sum += block[v * 8 + u] * tmp[u * 8 + x] * tmp[v * 8 + y];
        }
      }
      out[y * 8 + x] = sum / 4;
    }
  }
}

// Decode a baseline JPEG and return a GRID*GRID array of 0..255 luma values,
// resampled by nearest neighbour. Returns null on anything unexpected.
export function decodeJpegGray(base64, outW, outH) {
  try {
    const d = base64ToBytes(base64);
    if (d[0] !== 0xff || d[1] !== 0xd8) return null; // not SOI

    const qt = {};
    const huffDC = {};
    const huffAC = {};
    let frame = null;
    let restartInterval = 0;
    let scanStart = -1;
    let scanComps = null;

    let i = 2;
    while (i < d.length - 1) {
      if (d[i] !== 0xff) { i++; continue; }
      const marker = d[i + 1];
      i += 2;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (marker === 0xd9) break;
      const length = (d[i] << 8) | d[i + 1];
      const segStart = i + 2;
      const segEnd = i + length;

      if (marker === 0xdb) {
        let p = segStart;
        while (p < segEnd) {
          const pq = d[p] >> 4;
          const tq = d[p] & 15;
          p++;
          const tbl = new Int32Array(64);
          for (let k = 0; k < 64; k++) {
            tbl[ZIGZAG[k]] = pq ? (d[p] << 8) | d[p + 1] : d[p];
            p += pq ? 2 : 1;
          }
          qt[tq] = tbl;
        }
      } else if (marker === 0xc0 || marker === 0xc1) {
        frame = {
          height: (d[segStart + 1] << 8) | d[segStart + 2],
          width: (d[segStart + 3] << 8) | d[segStart + 4],
          comps: [],
        };
        const n = d[segStart + 5];
        for (let c = 0; c < n; c++) {
          const o = segStart + 6 + c * 3;
          frame.comps.push({ id: d[o], h: d[o + 1] >> 4, v: d[o + 1] & 15, tq: d[o + 2] });
        }
      } else if (marker === 0xc2) {
        return null; // progressive JPEG — not supported on purpose
      } else if (marker === 0xc4) {
        let p = segStart;
        while (p < segEnd) {
          const tc = d[p] >> 4;
          const th = d[p] & 15;
          p++;
          const counts = [];
          let total = 0;
          for (let k = 0; k < 16; k++) { counts.push(d[p + k]); total += d[p + k]; }
          p += 16;
          const vals = [];
          for (let k = 0; k < total; k++) vals.push(d[p + k]);
          p += total;
          const tbl = buildHuffmanTable(counts, vals);
          if (tc === 0) huffDC[th] = tbl; else huffAC[th] = tbl;
        }
      } else if (marker === 0xdd) {
        restartInterval = (d[segStart] << 8) | d[segStart + 1];
      } else if (marker === 0xda) {
        const n = d[segStart];
        scanComps = [];
        for (let c = 0; c < n; c++) {
          const o = segStart + 1 + c * 2;
          scanComps.push({ id: d[o], dc: d[o + 1] >> 4, ac: d[o + 1] & 15 });
        }
        scanStart = segEnd;
        break;
      }
      i = segEnd;
    }

    if (!frame || scanStart < 0 || !scanComps) return null;

    // ---- entropy-coded data: strip stuffed bytes, stop at the next marker ----
    const bytes = [];
    for (let p = scanStart; p < d.length; p++) {
      if (d[p] === 0xff) {
        const next = d[p + 1];
        if (next === 0x00) { bytes.push(0xff); p++; continue; }
        if (next >= 0xd0 && next <= 0xd7) { bytes.push(0xff, next); p++; continue; }
        break;
      }
      bytes.push(d[p]);
    }

    let bytePos = 0;
    let bitBuf = 0;
    let bitCount = 0;
    const readBit = () => {
      if (bitCount === 0) {
        if (bytePos >= bytes.length) return null;
        if (bytes[bytePos] === 0xff && bytes[bytePos + 1] >= 0xd0 && bytes[bytePos + 1] <= 0xd7) {
          bytePos += 2; // restart marker
        }
        bitBuf = bytes[bytePos++];
        if (bitBuf === undefined) return null;
        bitCount = 8;
      }
      bitCount--;
      return (bitBuf >> bitCount) & 1;
    };
    const decodeHuff = (tbl) => {
      let code = 0;
      for (let len = 1; len <= 16; len++) {
        const b = readBit();
        if (b === null) return null;
        code = (code << 1) | b;
        const v = tbl.get(`${len}:${code}`);
        if (v !== undefined) return v;
      }
      return null;
    };
    const receiveExtend = (s) => {
      if (s === 0) return 0;
      let v = 0;
      for (let k = 0; k < s; k++) {
        const b = readBit();
        if (b === null) return 0;
        v = (v << 1) | b;
      }
      return v < 1 << (s - 1) ? v - (1 << s) + 1 : v;
    };

    const maxH = Math.max(...frame.comps.map((c) => c.h));
    const maxV = Math.max(...frame.comps.map((c) => c.v));
    const mcuW = maxH * 8;
    const mcuH = maxV * 8;
    const mcusX = Math.ceil(frame.width / mcuW);
    const mcusY = Math.ceil(frame.height / mcuH);

    // We only need luma, but every component must still be decoded so the
    // bitstream stays in sync.
    const luma = frame.comps[0];
    const lumaW = mcusX * luma.h * 8;
    const lumaPlane = new Uint8ClampedArray(lumaW * mcusY * luma.v * 8);

    const preds = {};
    frame.comps.forEach((c) => { preds[c.id] = 0; });
    const block = new Float32Array(64);
    const pixels = new Float32Array(64);
    let mcuCount = 0;

    for (let my = 0; my < mcusY; my++) {
      for (let mx = 0; mx < mcusX; mx++) {
        if (restartInterval && mcuCount > 0 && mcuCount % restartInterval === 0) {
          bitCount = 0;
          frame.comps.forEach((c) => { preds[c.id] = 0; });
        }
        mcuCount++;

        for (const comp of frame.comps) {
          const sc = scanComps.find((s) => s.id === comp.id);
          if (!sc) return null;
          const dcTbl = huffDC[sc.dc];
          const acTbl = huffAC[sc.ac];
          const q = qt[comp.tq];
          if (!dcTbl || !acTbl || !q) return null;

          for (let by = 0; by < comp.v; by++) {
            for (let bx = 0; bx < comp.h; bx++) {
              block.fill(0);
              const t = decodeHuff(dcTbl);
              if (t === null) return null;
              preds[comp.id] += receiveExtend(t);
              block[0] = preds[comp.id] * q[0];

              let k = 1;
              while (k < 64) {
                const rs = decodeHuff(acTbl);
                if (rs === null) return null;
                const r = rs >> 4;
                const s = rs & 15;
                if (s === 0) {
                  if (r === 15) { k += 16; continue; }
                  break; // EOB
                }
                k += r;
                if (k > 63) break;
                block[ZIGZAG[k]] = receiveExtend(s) * q[ZIGZAG[k]];
                k++;
              }

              if (comp === luma) {
                idct2d(block, pixels);
                const ox = (mx * comp.h + bx) * 8;
                const oy = (my * comp.v + by) * 8;
                for (let y = 0; y < 8; y++) {
                  for (let x = 0; x < 8; x++) {
                    lumaPlane[(oy + y) * lumaW + ox + x] = pixels[y * 8 + x] + 128;
                  }
                }
              }
            }
          }
        }
      }
    }

    // Luma is sampled at (comp.h/maxH) of full width; map output pixels back
    // through that ratio so subsampled images still line up.
    const sx = luma.h / maxH;
    const sy = luma.v / maxV;
    const out = new Array(outW * outH);
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const fx = Math.min(frame.width - 1, Math.floor((x + 0.5) * (frame.width / outW)));
        const fy = Math.min(frame.height - 1, Math.floor((y + 0.5) * (frame.height / outH)));
        const px = Math.floor(fx * sx);
        const py = Math.floor(fy * sy);
        out[y * outW + x] = lumaPlane[py * lumaW + px];
      }
    }
    return out;
  } catch (e) {
    return null;
  }
}
