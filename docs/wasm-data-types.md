# WebAssembly 圖片處理：資料型別與流向詳解

在進行 WebAssembly (Wasm) 的圖片處理時，理解 C 語言、Wasm 記憶體視圖與 JavaScript 像素陣列之間的關係至關重要。

## 1. 核心型別對照

| 型別名稱 | 所屬環境 | 特性描述 |
| :--- | :--- | :--- |
| **`uint8_t`** | **C 語言 (math.c)** | 來自 `<stdint.h>`。8 位元無符號整數 (0~255)。代表單一頻道的像素值 (R, G, B 或 A)。 |
| **`HEAPU8`** | **Wasm 介面層 (math.js)** | 底層是 `Uint8Array`。它是 JavaScript 讀寫 Wasm 線性記憶體 (Linear Memory) 的「視圖」。指標 (Pointer) 在這裡對應陣列索引。 |
| **`Uint8ClampedArray`** | **網頁 API (Canvas)** | 瀏覽器 `ImageData` 專用。具備「飽和運算」(Clamping) 特性：超過 255 自動鎖定在 255，小於 0 鎖定在 0，防止顏色溢位。 |

---

## 2. 資料流向圖 (Data Flow)

處理一張圖片的完整週期如下：

### A. 擷取像素 (JavaScript)
從 Canvas 取得像素資料。
```javascript
const imageData = ctx.getImageData(0, 0, w, h);
const pixels = imageData.data; // 這裡獲得的是 Uint8ClampedArray
```

### B. 記憶體分配與傳輸 (JS -> Wasm)
由於 Wasm 無法直接讀取 JS 物件，我們必須在 Wasm 堆積 (Heap) 空間中申請記憶體，並手動將像素「複製」進去。
1. **申請空間**：呼叫 C 的 `malloc` (包裝成 `_allocMemory`) 取得一個指標 `ptr`。
2. **寫入資料**：使用 `Module.HEAPU8.set(pixels, ptr)` 將資料拷貝至 Wasm 記憶體。

### C. 運算執行 (C 語言)
呼叫 C 函數。C 語言將 `ptr` 視為 `uint8_t*` 陣列進行像素操作（如灰階化）。
```c
void makeGrayscale(uint8_t* data, int width, int height) { ... }
```

### D. 讀取結果 (Wasm -> JS)
運算完畢後，資料仍在 Wasm 的記憶體裡，我們需要把它讀出來。
```javascript
const result = Module.HEAPU8.subarray(ptr, ptr + length); // 取得運算後的視圖
```

### E. 渲染畫面 (JavaScript -> Canvas)
將結果轉回 `Uint8ClampedArray` 並放回 Canvas 顯示。
```javascript
const output = new ImageData(new Uint8ClampedArray(result), w, h);
ctx.putImageData(output, 0, 0);
```

### F. 清理記憶體 (C 語言)
**重要**：Wasm 的記憶體不會自動被垃圾回收 (GC)，必須手動釋放以避免洩漏。
```javascript
Module._freeMemory(ptr);
```

---

## 3. 關鍵結論

- **指標即索引**：在 C 語言裡的 `ptr` (指標) 就是一個地址，在 JavaScript 裡，它代表 `Module.HEAPU8` 陣列的開頭索引。
- **類型轉換**：從 Wasm 取回的資料通常需要封裝進 `new Uint8ClampedArray()` 才能安全地交給 Canvas 渲染。
- **效能優勢**：圖片處理涉及大量循環運算，Wasm 的執行效率遠高於原生 JavaScript，是處理 4K 圖像或影片濾鏡的最佳方案。
