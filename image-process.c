#include <stdint.h>
#include <stdlib.h>
#include <emscripten.h>

// 定義像素結構體，包含 R, G, B, A 四個頻道
typedef struct {
    uint8_t r;
    uint8_t g;
    uint8_t b;
    uint8_t a;
} Pixel;

// 分配記憶體，以供 JavaScript 寫入與讀取像素數據
EMSCRIPTEN_KEEPALIVE
uint8_t* allocMemory(int size) {
    return (uint8_t*)malloc(size);
}

// 釋放記憶體，防止 Wasm 記憶體洩漏
EMSCRIPTEN_KEEPALIVE
void freeMemory(void* ptr) {
    free(ptr);
}

/**
 * 圖片裁切函數
 * @param src_ptr 原始圖片像素指針 (RGBA)
 * @param sw 原始圖片寬度
 * @param sh 原始圖片高度
 * @param x 裁剪起點 X 坐標
 * @param y 裁剪起點 Y 坐標
 * @param cw 裁剪區域寬度
 * @param ch 裁剪區域高度
 * @param dst_ptr 裁切後圖片像素指針 (RGBA)
 */
EMSCRIPTEN_KEEPALIVE
void cropImage(uint8_t* src_ptr, int sw, int sh, int x, int y, int cw, int ch, uint8_t* dst_ptr) {
    Pixel* src = (Pixel*)src_ptr;
    Pixel* dst = (Pixel*)dst_ptr;

    for (int dy = 0; dy < ch; dy++) {
        for (int dx = 0; dx < cw; dx++) {
            int sx = x + dx;
            int sy = y + dy;
            
            // 安全防呆：如果超出原始圖片範圍，則填充透明像素
            if (sx >= 0 && sx < sw && sy >= 0 && sy < sh) {
                dst[dy * cw + dx] = src[sy * sw + sx];
            } else {
                dst[dy * cw + dx] = (Pixel){0, 0, 0, 0};
            }
        }
    }
}

/**
 * 圖片旋轉函數 (支援 90, 180, 270 度旋轉)
 * @param src_ptr 原始圖片像素指針 (RGBA)
 * @param w 原始圖片寬度
 * @param h 原始圖片高度
 * @param degree 旋轉角度 (90, 180, 270)
 * @param dst_ptr 旋轉後圖片像素指針 (RGBA)
 */
EMSCRIPTEN_KEEPALIVE
void rotateImage(uint8_t* src_ptr, int w, int h, int degree, uint8_t* dst_ptr) {
    Pixel* src = (Pixel*)src_ptr;
    Pixel* dst = (Pixel*)dst_ptr;

    if (degree == 90) {
        // 旋轉 90 度，目標寬為 h，高為 w
        for (int dy = 0; dy < w; dy++) {
            for (int dx = 0; dx < h; dx++) {
                int sx = dy;
                int sy = h - 1 - dx;
                dst[dy * h + dx] = src[sy * w + sx];
            }
        }
    } else if (degree == 180) {
        // 旋轉 180 度，目標寬為 w，高為 h
        for (int dy = 0; dy < h; dy++) {
            for (int dx = 0; dx < w; dx++) {
                int sx = w - 1 - dx;
                int sy = h - 1 - dy;
                dst[dy * w + dx] = src[sy * w + sx];
            }
        }
    } else if (degree == 270) {
        // 旋轉 270 度，目標寬為 h，高為 w
        for (int dy = 0; dy < w; dy++) {
            for (int dx = 0; dx < h; dx++) {
                int sx = w - 1 - dy;
                int sy = dx;
                dst[dy * h + dx] = src[sy * w + sx];
            }
        }
    }
}

/**
 * 圖片灰階化函數 (In-place)
 * @param img_ptr 圖片像素指針 (RGBA)
 * @param w 圖片寬度
 * @param h 圖片高度
 */
EMSCRIPTEN_KEEPALIVE
void applyGrayscale(uint8_t* img_ptr, int w, int h) {
    Pixel* img = (Pixel*)img_ptr;
    int total_pixels = w * h;

    for (int i = 0; i < total_pixels; i++) {
        // 使用亮度法公式：gray = (r * 77 + g * 150 + b * 29) >> 8
        uint32_t gray = (img[i].r * 77 + img[i].g * 150 + img[i].b * 29) >> 8;
        img[i].r = (uint8_t)gray;
        img[i].g = (uint8_t)gray;
        img[i].b = (uint8_t)gray;
        // 保持 Alpha (透明度) 頻道不變
    }
}
