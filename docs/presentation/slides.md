# WebAssembly 圖片批次處理：C 與 JS 的高效能協同
<!-- slide -->

## 1. 專案簡介與核心挑戰

### 傳統瀏覽器影像處理的痛點
*   當使用者批次處理數十張高解析度大圖時，純 JavaScript 的解碼與運算極易引發主執行緒卡頓，造成使用者介面「凍結」。
*   **解決方案**：
    *   將耗時的像素級像素處理（如裁切、旋轉、灰階）交給由 C 編譯而成的 **WebAssembly (Wasm)**。
    *   而 JavaScript 專注於檔案解碼、UI 渲染與 ZIP 打包。
*   目標：提供近乎原生的批次處理效能，同時維持網頁端零安裝的優勢。

<!-- slide -->

## 2. C 側像素處理：`uint8_t` 到 `Pixel` 的強轉型

### 程式碼範例 ([image-process.c](../../image-process.c))
```c
typedef struct {
    uint8_t r;
    uint8_t g;
    uint8_t b;
    uint8_t a;
} Pixel;

void applyGrayscale(uint8_t* img_ptr, int w, int h) {
    Pixel* img = (Pixel*)img_ptr; // 強制轉型！
    ...
}
```

### 為什麼可以這樣轉型？
1.  **記憶體連續性 (Memory Layout)**：HTML Canvas 的 `ImageData.data` 是連續的一維 `Uint8ClampedArray`，排列為 `[R, G, B, A, R, G, B, A, ...]`。
2.  **無 Padding 的結構體**：`Pixel` 包含 4 個 `uint8_t` (各 1 byte)，總大小為 4 bytes。在記憶體中完美的緊密排列，沒有任何空隙。
3.  **指標算術 (Pointer Arithmetic)**：轉型為 `Pixel*` 後，`img[i]` 可以直接以 4 bytes 為單位進行偏移，極大地提高了像素讀寫的程式碼可讀性與效能。

<!-- slide -->

## 3. WebAssembly 與 JavaScript 的數據橋樑

### 記憶體模型：Linear Memory
*   Wasm 與 JS 無法直接共享物件，只能透過一個共享的**線性記憶體 (Linear Memory)** 進行數據傳遞。
*   JS 端的 `wasmModule.HEAPU8` 是一個 `Uint8Array` 視圖，直接映射到 Wasm 的記憶體。
*   **數據交換流程**：
    1.  JS 分配 Wasm 記憶體：`srcPtr = _allocMemory(size)`（指針在 JS 側只是一個整數）。
    2.  JS 複製數據：`HEAPU8.set(pixels, srcPtr)`。
    3.  C 側處理：執行 `_applyGrayscale(srcPtr, w, h)`。
    4.  JS 讀取數據：`HEAPU8.subarray(dstPtr, dstPtr + dstSize)`。

<!-- slide -->

## 4. 關鍵工程實踐：記憶體管理與零拷貝

### 1. 手動記憶體管理（預防洩漏）
*   Wasm 記憶體不受 JS 垃圾回收 (GC) 控制。
*   **必須**使用 `try-finally` 確保在每次處理完單張圖片後，手動呼叫 `_freeMemory(ptr)`。
*   否則在批次處理數百張圖片時，會迅速發生**記憶體洩漏 (Memory Leak)** 導致瀏覽器分頁崩潰。

### 2. 零拷貝 (Zero-copy) 讀取
*   `HEAPU8.subarray()` 僅建立一個指向現有記憶體段的視圖，**不進行任何數據拷貝**。
*   這使得處理後的像素可以直接傳入 `new ImageData()`，發揮極致性能。

<!-- slide -->

## 5. AI Agent 協作開發新範式：自動化閉環

### 如何高效指揮 AI Agent 實作？
1.  **精準的架構界線**：定義 C 側為「無狀態 (Stateless)」的純運算函數，JS 側為狀態與 I/O 控制器。
2.  **提供自動化部署工具 (`pnpm dlx serve`)**：讓 Agent 能夠自主在本地架設網頁伺服器。
3.  **提供 Chrome 控制工具 (`chrome-devtools-mcp`)**：
    *   Agent 可以自主在虛擬瀏覽器中加載網頁。
    *   自動模擬上傳圖片、點擊按鈕、框選裁切。
    *   自動檢測主控台有無 Wasm 錯誤或記憶體崩潰。
4.  **自主修復的閉環 (Feedback Loop)**：Agent 讀取瀏覽器報錯後，自行回頭修改 C 與 JS 代碼，直至測試通過，達到零人工干預的交付。
