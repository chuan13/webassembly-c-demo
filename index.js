import createModule from './image-process.js';
import { ImagePreviewer } from './preview.js';

/**
 * @typedef {Object} UploadedImage
 * @property {string} id - 唯一識別碼
 * @property {File} file - 原始檔案物件
 * @property {HTMLImageElement} img - 載入完畢的 Image 元素
 * @property {number} width - 圖片原始寬度
 * @property {number} height - 圖片原始高度
 */

// 全局變數
/** @type {any} */
let wasmModule = null;
/** @type {UploadedImage[]} */
let uploadedImages = [];
/** @type {string|null} */
let activeImageId = null;
/** @type {ImagePreviewer|null} */
let previewer = null;

// DOM 元素
const fileUpload = document.getElementById('file-upload');
const btnClearAll = document.getElementById('btn-clear-all');
const imageListContainer = document.getElementById('image-list-container');
const actionToggleGroup = document.getElementById('action-toggle-group');
const rotateOptionsGroup = document.getElementById('rotate-options-group');
const formatToggleGroup = document.getElementById('format-toggle-group');
const btnExecuteProcess = document.getElementById('btn-execute-process');
const canvasWrapper = document.getElementById('canvas-wrapper');
const previewPlaceholder = document.getElementById('preview-placeholder');
const previewCanvas = document.getElementById('preview-canvas');
const statusIndicator = document.getElementById('status-indicator');
const statusMessage = document.getElementById('status-message');
const statusInfo = document.getElementById('status-info');

// 離屏 Canvas 用於批次處理像素
const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');

/**
 * 初始化應用程式
 */
async function init() {
    // 1. 初始化預覽模組
    previewer = new ImagePreviewer(previewCanvas);

    // 2. 異步載入 WebAssembly 膠水程式碼與 Wasm 模組
    try {
        updateStatus('載入 WebAssembly 模組中...', 'processing');
        wasmModule = await createModule();
        updateStatus('Wasm 模組載入成功，準備就緒！', 'ready');
        checkExecuteState();
    } catch (err) {
        console.error('Wasm 載入失敗：', err);
        updateStatus('Wasm 模組載入失敗，請確認編譯是否正確！', 'error');
    }

    // 3. 註冊事件監聽
    setupEventListeners();
}

/**
 * 更新狀態列
 * @param {string} msg - 狀態文字
 * @param {'idle'|'ready'|'processing'|'error'} state - 狀態類型
 */
function updateStatus(msg, state) {
    statusMessage.textContent = msg;
    statusIndicator.className = 'status-indicator';
    
    if (state === 'ready') {
        statusIndicator.classList.add('ready');
    } else if (state === 'processing') {
        statusIndicator.classList.add('processing');
    } else if (state === 'error') {
        statusIndicator.style.backgroundColor = 'var(--danger-color)';
        statusIndicator.style.boxShadow = '0 0 8px var(--danger-color)';
    }
}

/**
 * 檢查並設定執行按鈕的可點擊狀態與文字
 */
function checkExecuteState() {
    const hasImages = uploadedImages.length > 0;
    const isWasmReady = wasmModule !== null;
    
    btnExecuteProcess.disabled = !hasImages || !isWasmReady;
    btnClearAll.disabled = !hasImages;

    const btnTextEl = document.getElementById('btn-execute-text');
    if (btnTextEl) {
        // 動態修改按鈕文字
        const action = getSelectedAction();
        if (action === 'crop') {
            btnTextEl.textContent = '執行批次裁切';
        } else if (action === 'rotate') {
            const angle = getSelectedRotationAngle();
            btnTextEl.textContent = `執行批次旋轉 (${angle}°)`;
        } else if (action === 'grayscale') {
            btnTextEl.textContent = '執行批次灰階';
        }
    }
}

/**
 * 獲取選取的功能模式
 * @returns {'crop'|'rotate'|'grayscale'}
 */
function getSelectedAction() {
    const checkedRadio = actionToggleGroup.querySelector('input[name="action"]:checked');
    return checkedRadio ? checkedRadio.value : 'crop';
}

/**
 * 獲取選取的旋轉角度
 * @returns {90|180|270}
 */
function getSelectedRotationAngle() {
    const checkedRadio = rotateOptionsGroup.querySelector('input[name="rotation-angle"]:checked');
    return checkedRadio ? parseInt(checkedRadio.value, 10) : 90;
}

/**
 * 獲取選取的輸出格式
 * @returns {'jpeg'|'png'|'webp'}
 */
function getSelectedFormat() {
    const checkedRadio = formatToggleGroup.querySelector('input[name="output-format"]:checked');
    return checkedRadio ? checkedRadio.value : 'jpeg';
}

/**
 * 註冊事件監聽器
 */
function setupEventListeners() {
    // 圖片上傳
    fileUpload.addEventListener('change', handleFileUpload);

    // 清空清單
    btnClearAll.addEventListener('click', clearAllImages);

    // 功能模式切換
    actionToggleGroup.addEventListener('change', () => {
        const action = getSelectedAction();
        
        // 切換旋轉選項顯示狀態
        if (action === 'rotate') {
            rotateOptionsGroup.classList.remove('hidden');
        } else {
            rotateOptionsGroup.classList.add('hidden');
        }
        
        if (previewer) {
            previewer.setMode(action);
        }
        
        checkExecuteState();
        updateActiveImageStatusText();
    });

    // 旋轉角度切換
    rotateOptionsGroup.addEventListener('change', () => {
        const angle = getSelectedRotationAngle();
        if (previewer) {
            previewer.setRotation(angle);
        }
        checkExecuteState();
    });

    // 執行批次處理
    btnExecuteProcess.addEventListener('click', executeBatchProcess);
}

/**
 * 處理上傳圖片檔案
 * @param {Event} event 
 */
async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    updateStatus('正在載入與解碼圖片...', 'processing');

    const validExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    let loadedCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const extension = file.name.split('.').pop().toLowerCase();
        
        if (!validExtensions.includes(extension)) {
            alert(`不支援的檔案格式：${file.name}\n僅支援 JPG, PNG, WEBP。`);
            continue;
        }

        try {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            img.src = objectUrl;
            
            // 等待圖片載入完成，取得原始尺寸
            await img.decode();

            const imageId = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            uploadedImages.push({
                id: imageId,
                file: file,
                img: img,
                width: img.naturalWidth,
                height: img.naturalHeight
            });

            loadedCount++;
        } catch (err) {
            console.error(`圖片 ${file.name} 載入失敗：`, err);
            alert(`圖片載入失敗：${file.name}`);
        }
    }

    // 清除 file input 的值，以便重複選擇同名檔案時能觸發 change
    fileUpload.value = '';

    renderImageList();
    checkExecuteState();
    
    // 如果有新圖片載入，且當前無預覽，則預覽最新的一張
    if (loadedCount > 0 && !activeImageId) {
        setActiveImage(uploadedImages[uploadedImages.length - 1].id);
    } else {
        updateStatus('圖片載入完成', 'ready');
    }
}

/**
 * 渲染上傳圖片清單列表
 */
function renderImageList() {
    if (uploadedImages.length === 0) {
        imageListContainer.innerHTML = `
            <div class="empty-list-placeholder">
                尚未上傳任何圖片。支援 JPG, PNG, WEBP 格式。
            </div>
        `;
        return;
    }

    imageListContainer.innerHTML = '';
    
    uploadedImages.forEach((item, index) => {
        const isFirst = index === 0;
        const isLast = index === uploadedImages.length - 1;
        const isActive = item.id === activeImageId;

        const itemEl = document.createElement('div');
        itemEl.className = `image-item ${isActive ? 'active' : ''}`;
        
        // 圖片資訊區 (縮圖與檔名)
        const infoEl = document.createElement('div');
        infoEl.className = 'image-info';
        infoEl.addEventListener('click', () => setActiveImage(item.id));

        const thumbnail = document.createElement('img');
        thumbnail.src = item.img.src;
        thumbnail.className = 'image-thumbnail-mini';
        
        const textWrapper = document.createElement('div');
        textWrapper.className = 'image-filename-wrapper';
        textWrapper.style.overflow = 'hidden';
        
        const filename = document.createElement('div');
        filename.className = 'image-filename';
        filename.textContent = item.file.name;
        filename.title = item.file.name;

        const sizeBadge = document.createElement('span');
        sizeBadge.className = 'image-size-badge';
        sizeBadge.textContent = `${item.width} × ${item.height}`;

        textWrapper.appendChild(filename);
        textWrapper.appendChild(sizeBadge);
        
        infoEl.appendChild(thumbnail);
        infoEl.appendChild(textWrapper);

        // 控制按鈕區 (上移、下移、刪除)
        const actionsEl = document.createElement('div');
        actionsEl.className = 'image-actions';

        // 上移
        const btnUp = document.createElement('button');
        btnUp.className = 'action-btn';
        btnUp.disabled = isFirst;
        btnUp.title = '上移';
        btnUp.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
        btnUp.addEventListener('click', (e) => {
            e.stopPropagation();
            moveImage(index, -1);
        });

        // 下移
        const btnDown = document.createElement('button');
        btnDown.className = 'action-btn';
        btnDown.disabled = isLast;
        btnDown.title = '下移';
        btnDown.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        btnDown.addEventListener('click', (e) => {
            e.stopPropagation();
            moveImage(index, 1);
        });

        // 刪除
        const btnDelete = document.createElement('button');
        btnDelete.className = 'action-btn btn-delete-item';
        btnDelete.title = '刪除';
        btnDelete.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        btnDelete.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteImage(item.id);
        });

        actionsEl.appendChild(btnUp);
        actionsEl.appendChild(btnDown);
        actionsEl.appendChild(btnDelete);

        itemEl.appendChild(infoEl);
        itemEl.appendChild(actionsEl);

        imageListContainer.appendChild(itemEl);
    });
}

/**
 * 設定當前預覽的圖片
 * @param {string} imageId 
 */
function setActiveImage(imageId) {
    activeImageId = imageId;
    const item = uploadedImages.find(x => x.id === imageId);
    
    if (item) {
        // 更新 UI 清單焦點
        renderImageList();

        // 載入預覽 Canvas
        previewPlaceholder.classList.add('hidden');
        canvasWrapper.classList.remove('hidden');
        
        if (previewer) {
            previewer.setImage(item.img);
        }

        updateStatus('預覽圖片載入成功', 'ready');
        updateActiveImageStatusText();
    }
}

/**
 * 更新預覽區狀態文字
 */
function updateActiveImageStatusText() {
    const item = uploadedImages.find(x => x.id === activeImageId);
    if (!item) {
        statusInfo.textContent = '';
        return;
    }

    const action = getSelectedAction();
    let actionDesc = '';
    
    if (action === 'crop') {
        actionDesc = '框選進行裁切';
    } else if (action === 'rotate') {
        const angle = getSelectedRotationAngle();
        actionDesc = `快速預覽旋轉 ${angle}° (非 Wasm)`;
    } else if (action === 'grayscale') {
        actionDesc = '快速預覽灰階 (非 Wasm)';
    }

    statusInfo.textContent = `預覽中: ${item.file.name} (${item.width}×${item.height}) - ${actionDesc}`;
}

/**
 * 移動清單中的圖片排序
 * @param {number} index - 目前索引
 * @param {number} direction - 方向 (-1 上移，1 下移)
 */
function moveImage(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= uploadedImages.length) return;

    // 交換元素
    const temp = uploadedImages[index];
    uploadedImages[index] = uploadedImages[targetIndex];
    uploadedImages[targetIndex] = temp;

    renderImageList();
    updateActiveImageStatusText();
}

/**
 * 刪除指定圖片
 * @param {string} imageId 
 */
function deleteImage(imageId) {
    const wasActive = activeImageId === imageId;
    uploadedImages = uploadedImages.filter(x => x.id !== imageId);
    
    if (wasActive) {
        if (uploadedImages.length > 0) {
            setActiveImage(uploadedImages[uploadedImages.length - 1].id);
        } else {
            activeImageId = null;
            canvasWrapper.classList.add('hidden');
            previewPlaceholder.classList.remove('hidden');
            statusInfo.textContent = '';
            renderImageList();
        }
    } else {
        renderImageList();
    }
    
    checkExecuteState();
}

/**
 * 清空所有已上傳的圖片
 */
function clearAllImages() {
    uploadedImages.forEach(item => {
        URL.revokeObjectURL(item.img.src);
    });
    uploadedImages = [];
    activeImageId = null;
    
    canvasWrapper.classList.add('hidden');
    previewPlaceholder.classList.remove('hidden');
    statusInfo.textContent = '';

    renderImageList();
    checkExecuteState();
    updateStatus('清單已清空', 'ready');
}

/**
 * 執行圖片批次處理
 */
async function executeBatchProcess() {
    if (!wasmModule || uploadedImages.length === 0) return;

    const action = getSelectedAction();
    const format = getSelectedFormat();
    
    let cropPercent = null;

    // --- 防呆檢查 ---
    if (action === 'crop') {
        if (!previewer) return;
        cropPercent = previewer.getCropBoxPercent();

        // 確保寬高百分比大於 0.01 (1%)
        if (cropPercent.w < 0.01 || cropPercent.h < 0.01) {
            alert('裁切範圍過小，請重新在預覽圖上進行框選！');
            return;
        }

        // 檢查所有圖片的寬高比例是否一致 (浮點數誤差容忍 0.005)
        const firstRatio = uploadedImages[0].width / uploadedImages[0].height;
        for (let i = 1; i < uploadedImages.length; i++) {
            const currentRatio = uploadedImages[i].width / uploadedImages[i].height;
            if (Math.abs(firstRatio - currentRatio) > 0.005) {
                alert('批次處理失敗！所有圖片比例必須相同才能套用同比例裁切。');
                return;
            }
        }
    }

    // --- UI 進入處理中狀態 ---
    setUiEnabled(false);
    updateStatus('批次處理執行中，請稍候...', 'processing');

    const zip = new JSZip();
    let processedCount = 0;

    try {
        for (let i = 0; i < uploadedImages.length; i++) {
            const item = uploadedImages[i];
            const w = item.width;
            const h = item.height;

            // 1. 調整離屏 Canvas 大小與原圖一致，並畫出原圖以取得像素數據
            offscreenCanvas.width = w;
            offscreenCanvas.height = h;
            offscreenCtx.clearRect(0, 0, w, h);
            offscreenCtx.drawImage(item.img, 0, 0);
            
            const imageData = offscreenCtx.getImageData(0, 0, w, h);
            const pixels = imageData.data; // Uint8ClampedArray

            // 2. Wasm 記憶體讀寫迴圈與 C 函數呼叫
            const srcSize = w * h * 4;
            let srcPtr = null;
            let dstPtr = null;
            let resultPixels = null;
            let outW = w;
            let outH = h;

            try {
                // 分配 Wasm 輸入緩衝區記憶體
                srcPtr = wasmModule._allocMemory(srcSize);
                if (!srcPtr) throw new Error('Wasm 輸入記憶體分配失敗');

                // 將 JS 像素數據寫入 Wasm HEAP
                wasmModule.HEAPU8.set(pixels, srcPtr);

                if (action === 'crop') {
                    // 裁切模式：將百分比映射為當前圖片的像素坐標
                    const cx = Math.round(cropPercent.x * w);
                    const cy = Math.round(cropPercent.y * h);
                    const cw = Math.round(cropPercent.w * w);
                    const ch = Math.round(cropPercent.h * h);
                    
                    outW = cw;
                    outH = ch;

                    const dstSize = outW * outH * 4;
                    dstPtr = wasmModule._allocMemory(dstSize);
                    if (!dstPtr) throw new Error('Wasm 輸出記憶體分配失敗');

                    // 呼叫 C 裁切函數
                    wasmModule._cropImage(srcPtr, w, h, cx, cy, outW, outH, dstPtr);

                    // 讀取結果
                    resultPixels = wasmModule.HEAPU8.subarray(dstPtr, dstPtr + dstSize);

                } else if (action === 'rotate') {
                    // 旋轉模式
                    const angle = getSelectedRotationAngle();
                    
                    if (angle === 90 || angle === 270) {
                        outW = h;
                        outH = w;
                    } else {
                        outW = w;
                        outH = h;
                    }

                    const dstSize = outW * outH * 4;
                    dstPtr = wasmModule._allocMemory(dstSize);
                    if (!dstPtr) throw new Error('Wasm 輸出記憶體分配失敗');

                    // 呼叫 C 旋轉函數
                    wasmModule._rotateImage(srcPtr, w, h, angle, dstPtr);

                    // 讀取結果
                    resultPixels = wasmModule.HEAPU8.subarray(dstPtr, dstPtr + dstSize);

                } else if (action === 'grayscale') {
                    // 灰階模式：就地 (In-place) 轉換
                    wasmModule._applyGrayscale(srcPtr, w, h);
                    
                    // 讀取結果 (與輸入指針相同)
                    resultPixels = wasmModule.HEAPU8.subarray(srcPtr, srcPtr + srcSize);
                }

                // 3. 將處理後像素數據畫回離屏 Canvas 並轉為 Blob
                offscreenCanvas.width = outW;
                offscreenCanvas.height = outH;
                offscreenCtx.clearRect(0, 0, outW, outH);

                const outputImgData = new ImageData(
                    new Uint8ClampedArray(resultPixels),
                    outW,
                    outH
                );
                offscreenCtx.putImageData(outputImgData, 0, 0);

                // 決定 MimeType 與新檔名
                let mimeType = 'image/jpeg';
                let ext = 'jpg';
                if (format === 'png') {
                    mimeType = 'image/png';
                    ext = 'png';
                } else if (format === 'webp') {
                    mimeType = 'image/webp';
                    ext = 'webp';
                }

                // 取得副檔名被替換的檔名 (不加任何 _processed 後綴)
                const baseName = item.file.name.substring(0, item.file.name.lastIndexOf('.')) || item.file.name;
                const newFilename = `${baseName}.${ext}`;

                // 異步生成 Blob 並加入 ZIP
                const blob = await new Promise(resolve => {
                    offscreenCanvas.toBlob(b => resolve(b), mimeType, 0.9);
                });

                if (blob) {
                    zip.file(newFilename, blob);
                    processedCount++;
                }

            } finally {
                // 確保在處理完每張圖片後，皆釋放已分配的 Wasm 記憶體，防止洩漏
                if (srcPtr) wasmModule._freeMemory(srcPtr);
                if (dstPtr) wasmModule._freeMemory(dstPtr);
            }
        }

        // 4. 下載 ZIP 檔案
        if (processedCount > 0) {
            updateStatus('正在打包 ZIP 壓縮檔...', 'processing');
            const zipContent = await zip.generateAsync({ type: 'blob' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipContent);
            link.download = 'image.zip';
            link.click();
            
            URL.revokeObjectURL(link.href);
            
            updateStatus('完成！', 'ready');
        } else {
            updateStatus('沒有處理任何圖片！', 'ready');
        }

    } catch (err) {
        console.error('批次處理失敗：', err);
        updateStatus(`處理失敗：${err.message}`, 'error');
        alert(`處理過程中發生錯誤：${err.message}`);
    } finally {
        setUiEnabled(true);
    }
}

/**
 * 啟用或禁用 UI 互動控制項
 * @param {boolean} enabled - 是否啟用
 */
function setUiEnabled(enabled) {
    fileUpload.disabled = !enabled;
    btnClearAll.disabled = !enabled || uploadedImages.length === 0;
    
    // 禁用 radio input
    const radios = document.querySelectorAll('input[type="radio"]');
    radios.forEach(r => r.disabled = !enabled);

    // 禁用清單中的上移、下移、刪除按鈕
    const listButtons = imageListContainer.querySelectorAll('.action-btn');
    listButtons.forEach(btn => btn.disabled = !enabled);

    btnExecuteProcess.disabled = !enabled;
    
    if (!enabled) {
        // 加上 loading spinner
        btnExecuteProcess.innerHTML = `<div class="spinner"></div> <span>處理中...</span>`;
    } else {
        // 恢復正常文字
        btnExecuteProcess.innerHTML = `<span id="btn-execute-text"></span>`;
        const btnTextEl = document.getElementById('btn-execute-text');
        const action = getSelectedAction();
        if (action === 'crop') {
            btnTextEl.textContent = '執行批次裁切';
        } else if (action === 'rotate') {
            const angle = getSelectedRotationAngle();
            btnTextEl.textContent = `執行批次旋轉 (${angle}°)`;
        } else if (action === 'grayscale') {
            btnTextEl.textContent = '執行批次灰階';
        }
    }
}

// 啟動 App
window.addEventListener('DOMContentLoaded', init);
