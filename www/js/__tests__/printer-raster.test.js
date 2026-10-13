/**
 * @fileoverview Byte-for-byte comparison of the optimized ESC/POS raster packing
 * against the original per-pixel implementation it replaced.
 */

import { packMonochromeRaster, buildRasterPrintCommand } from '../services/printer.js';

// Original implementation from printer.js write() (pre-optimization), kept verbatim.
function legacyEscPos(pixels, width, height) {
    const threshold = 128;
    const bytesPerLine = Math.ceil(width / 8);
    const bitmapData = [];
    for (let y = 0; y < height; y++) {
        const line = new Array(bytesPerLine).fill(0);
        for (let x = 0; x < width; x++) {
            const pixelIndex = (y * width + x) * 4;
            const r = pixels[pixelIndex];
            const g = pixels[pixelIndex + 1];
            const b = pixels[pixelIndex + 2];
            const gray = (r + g + b) / 3;
            if (gray < threshold) {
                const byteIndex = Math.floor(x / 8);
                const bitIndex = 7 - (x % 8);
                line[byteIndex] |= (1 << bitIndex);
            }
        }
        bitmapData.push(...line);
    }
    const commands = [];
    commands.push(0x1B, 0x40);
    commands.push(0x1B, 0x61, 0x01);
    commands.push(0x1D, 0x76, 0x30, 0x00);
    commands.push(bytesPerLine & 0xFF);
    commands.push((bytesPerLine >> 8) & 0xFF);
    commands.push(height & 0xFF);
    commands.push((height >> 8) & 0xFF);
    commands.push(...bitmapData);
    commands.push(0x1B, 0x64, 0x03);
    commands.push(0x1D, 0x56, 0x41, 0x03);
    return { bitmap: Uint8Array.from(bitmapData), command: new Uint8Array(commands) };
}

// Deterministic synthetic RGBA image: random noise biased around the threshold,
// plus solid black/white bands and antialiasing-like grey edges.
function syntheticImage(width, height, seed = 12345) {
    let s = seed >>> 0;
    const rand = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
    };
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            let r, g, b;
            if (y % 17 === 0) {
                r = g = b = 0;
            } else if (y % 13 === 0) {
                r = g = b = 255;
            } else if (rand() < 0.3) {
                // Values straddling the threshold (sum 383 / 384 / 385)
                const base = 127 + Math.floor(rand() * 3);
                r = base; g = base; b = 128 + Math.floor(rand() * 2) - 1;
            } else {
                r = Math.floor(rand() * 256);
                g = Math.floor(rand() * 256);
                b = Math.floor(rand() * 256);
            }
            pixels[i] = r;
            pixels[i + 1] = g;
            pixels[i + 2] = b;
            pixels[i + 3] = rand() < 0.05 ? 0 : 255;
        }
    }
    return pixels;
}

describe('ESC/POS raster packing', () => {
    test.each([
        [384, 600],  // receipt width used by the app
        [13, 7],     // width not a multiple of 8
        [8, 1],
        [1, 3],
        [384, 300]   // height > 255 exercises the yH byte
    ])('matches legacy output for %ix%i', (width, height) => {
        const pixels = syntheticImage(width, height, width * 31 + height);
        const legacy = legacyEscPos(pixels, width, height);

        const raster = packMonochromeRaster(pixels, width, height);
        expect(raster).toEqual(legacy.bitmap);

        const command = buildRasterPrintCommand(raster, Math.ceil(width / 8), height);
        expect(command).toEqual(legacy.command);
    });

    test('command is a standalone buffer (bluetoothSerial.write sends data.buffer)', () => {
        const pixels = syntheticImage(16, 4);
        const raster = packMonochromeRaster(pixels, 16, 4);
        const command = buildRasterPrintCommand(raster, 2, 4);
        expect(command.byteOffset).toBe(0);
        expect(command.buffer.byteLength).toBe(command.length);
    });
});
