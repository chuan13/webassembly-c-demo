# WebAssembly 記憶體視圖詳解：HEAPU8, HEAP32, HEAPF32

在 Emscripten 環境中，JavaScript 透過不同的「視圖 (View)」來存取 Wasm 的線性記憶體。理解這些視圖的差異對於正確傳遞資料至 C 語言至關重要。

## 1. 核心視圖對照表

| 視圖名稱 | JavaScript 型別 | 對應 C 型別 | 單位長度 | 索引計算方式 (地址為 `ptr`) |
| :--- | :--- | :--- | :--- | :--- |
| **`HEAPU8`** | `Uint8Array` | `uint8_t`, `unsigned char` | 1 Byte | `HEAPU8[ptr]` |
| **`HEAP32`** | `Int32Array` | `int`, `int32_t`, `指標 (Pointer)` | 4 Bytes | `HEAP32[ptr >> 2]` |
| **`HEAPF32`** | `Float32Array` | `float` | 4 Bytes | `HEAPF32[ptr >> 2]` |

---

## 2. 為何需要「位移運算 (>> 2)」？

Wasm 的記憶體地址是以 **Byte (位元組)** 為單位的連續空間。但當我們使用 `Int32Array` (HEAP32) 或 `Float32Array` (HEAPF32) 時，JavaScript 將記憶體視為一個 **32 位元元素的陣列**。

### 例子：讀取地址 400
假設有一個指標 `ptr = 400`。
*   在 **`HEAPU8`** 中，它是第 **400** 個元素。
*   在 **`HEAP32`** 中，因為每個元素佔 4 位元組，它其實是第 **100** 個元素 ($400 \div 4 = 100$)。

在 JavaScript 中，最有效率的除以 4 方式就是位元右移兩位 (`>> 2`)：
```javascript
const value = Module.HEAP32[ptr >> 2];
```

---

## 3. 實戰應用場景

### A. 處理像素數據 (HEAPU8)
圖片的像素（R, G, B, A）通常是 0~255 的數值，適合用 `uint8_t` 儲存。
```javascript
// 將 JS 的像素陣列寫入 Wasm 地址 ptr
Module.HEAPU8.set(pixelData, ptr);
```

### B. 讀取回傳的長度或指標 (HEAP32)
當 C 語言函數透過指標參數傳回一個整數（例如轉檔後的檔案大小）時，必須用 `HEAP32` 讀取。
```c
// C 語言
void getLength(int* outLen) { *outLen = 50000; }
```
```javascript
// JavaScript
const outLenPtr = Module._malloc(4);
Module._getLength(outLenPtr);
const actualLen = Module.HEAP32[outLenPtr >> 2]; // 得到 50000
```

### C. 處理科學運算或亮度 (HEAPF32)
涉及到浮點數（如圖片亮度調整因子 `0.5f`）時使用。
```javascript
// 假設 ptr 指向一個 float 變數
Module.HEAPF32[ptr >> 2] = 0.75;
```

---

## 4. 常見錯誤提醒
1.  **忘記除以 4**：存取 `HEAP32[ptr]` 會讀到錯誤的記憶體位置（偏移了 4 倍）。
2.  **型別不匹配**：用 `HEAP32` 去讀取 `float` 資料會得到無意義的整數值（位元解析錯誤）。
3.  **邊界問題**：Wasm 32位元環境中，指標本身就是 `i32`，所以存取「指標的指標」時，一律使用 `HEAP32`。
