// Canvas入出力対応のカラーフレームクロッパー関数群（灰色・白色対応版）

// ユーティリティ関数群
const canvasUtils = {
    // CanvasをImageDataに変換
    canvasToImageData(canvas) {
        const ctx = canvas.getContext('2d');
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    },

    // ImageDataをCanvasに変換
    imageDataToCanvas(imageData) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    },

    // Base64をCanvasに変換（後方互換性のため）
    async base64ToCanvas(base64) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                resolve(canvas);
            };
            img.onerror = reject;
            img.src = base64;
        });
    },

    // CanvasをBase64に変換
    canvasToBase64(canvas) {
        return canvas.toDataURL('image/png');
    }
};

// BGRからHSVに変換
function bgrToHsv(b, g, r) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    if (diff !== 0) {
        if (max === r) h = ((g - b) / diff) % 6;
        else if (max === g) h = (b - r) / diff + 2;
        else h = (r - g) / diff + 4;
    }
    h = Math.round(h * 30);
    if (h < 0) h += 180;

    const s = max === 0 ? 0 : Math.round((diff / max) * 255);
    const v = Math.round(max * 255);

    return [h, s, v];
}

// カラーマスクを抽出
function extractColorMask(imageData, color) {
    const { width, height, data } = imageData;
    const mask = new Uint8Array(width * height);

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const pixelIndex = i / 4;

        const [h, s, v] = bgrToHsv(b, g, r);
        let inRange = false;

        if (color === 'red') {
            const range1 = (h >= 0 && h <= 10) && (s >= 30) && (v >= 120);
            const range2 = (h >= 160 && h <= 180) && (s >= 30) && (v >= 120);
            inRange = range1 || range2;
        } else if (color === 'blue') {
            inRange = (h >= 85 && h <= 110) && (s >= 50) && (v >= 100);
        } else if (color === 'red_gray_white') {
            // 赤 + 灰色 + 白色（上部フレーム検出用）
            const range1 = (h >= 0 && h <= 10) && (s >= 30) && (v >= 120);
            const range2 = (h >= 160 && h <= 180) && (s >= 30) && (v >= 120);
            const isRed = range1 || range2;
            const isGray = (s <= 50) && (v >= 80 && v <= 180);
            const isWhite = (s <= 30) && (v >= 200);
            inRange = isRed || isGray || isWhite;
        } else if (color === 'blue_gray_white') {
            // 青 + 灰色 + 白色（上部フレーム検出用）
            const isBlue = (h >= 85 && h <= 110) && (s >= 50) && (v >= 100);
            const isGray = (s <= 50) && (v >= 80 && v <= 180);
            const isWhite = (s <= 30) && (v >= 200);
            inRange = isBlue || isGray || isWhite;
        }

        mask[pixelIndex] = inRange ? 255 : 0;
    }

    return { mask, width, height };
}

// 内側から外側に向かって枠の境界を検出（上部検出に別マスクを使用）
function findFrameBoundariesInsideOut(primaryMask, topMask, width, height, minRatio = 0.7, searchRatioX = 0.1, searchRatioY = 0.05) {
    const maxSearchX = Math.floor(width * searchRatioX);
    const maxSearchY = Math.floor(height * searchRatioY);

    // 左右・下部は従来通り主要色マスクを使用
    let left = 0;
    for (let x = maxSearchX; x >= 0; x--) {
        let colSum = 0;
        for (let y = 0; y < height; y++) {
            if (primaryMask[y * width + x] > 0) colSum++;
        }
        if (colSum > height * minRatio) {
            left = x + 1;
            break;
        }
    }

    let right = width;
    for (let x = width - maxSearchX - 1; x < width; x++) {
        let colSum = 0;
        for (let y = 0; y < height; y++) {
            if (primaryMask[y * width + x] > 0) colSum++;
        }
        if (colSum > height * minRatio) {
            right = x;
            break;
        }
    }

    let top = 0;
    let topFrameRemoved = false;
    
    // 上部の検出処理：複合マスク（主要色+灰色+白色）を使用
    for (let y = maxSearchY; y >= 0; y--) {
        let rowSum = 0;
        for (let x = 0; x < width; x++) {
            if (topMask[y * width + x] > 0) rowSum++;
        }
        if (rowSum > width * minRatio) {
            top = y + 1;
            topFrameRemoved = true;
            break;
        }
    }

    let bottom = height;
    for (let y = height - maxSearchY - 1; y < height; y++) {
        let rowSum = 0;
        for (let x = 0; x < width; x++) {
            if (primaryMask[y * width + x] > 0) rowSum++;
        }
        if (rowSum > width * minRatio) {
            bottom = y;
            break;
        }
    }

    return { left, right, top, bottom, topFrameRemoved };
}

// 画像をクロップしてCanvasを返す
function cropImageToCanvas(canvas, left, right, top, bottom) {
    const cropWidth = right - left;
    const cropHeight = bottom - top;
    
    if (cropWidth <= 0 || cropHeight <= 0) return null;

    const croppedCanvas = document.createElement('canvas');
    const ctx = croppedCanvas.getContext('2d');
    croppedCanvas.width = cropWidth;
    croppedCanvas.height = cropHeight;
    
    ctx.drawImage(canvas, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    
    return croppedCanvas;
}

// デバッグ画像を作成
function createDebugCanvas(originalCanvas, boundaries, searchRatioX = 0.1, searchRatioY = 0.05, additionalTopCrop = 0) {
    const { width, height } = originalCanvas;
    const { left, right, top, bottom, topFrameRemoved } = boundaries;
    
    const debugCanvas = document.createElement('canvas');
    const ctx = debugCanvas.getContext('2d');
    debugCanvas.width = width;
    debugCanvas.height = height;
    
    // 元の画像を描画
    ctx.drawImage(originalCanvas, 0, 0);

    const drawRect = (x1, y1, x2, y2, color, thickness = 3) => {
        ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        ctx.lineWidth = thickness;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    };

    // 切り取り領域を青で描画
    drawRect(left, top, right - 1, bottom - 1, [255, 0, 0]);

    // 上枠が削除された場合、追加削除部分を赤線で描画
    if (topFrameRemoved && additionalTopCrop > 0) {
        const originalTop = top - additionalTopCrop;
        ctx.strokeStyle = 'rgb(0, 0, 255)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(left, originalTop);
        ctx.lineTo(right, originalTop);
        ctx.stroke();
    }

    // 検索範囲を薄い線で描画
    const searchX = Math.floor(width * searchRatioX);
    const searchY = Math.floor(height * searchRatioY);
    drawRect(searchX, searchY, width - searchX - 1, height - searchY - 1, [128, 128, 128], 1);

    return debugCanvas;
}

// マスク画像のCanvasを作成
function createMaskCanvas(maskData, width, height) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;
    
    const imageData = ctx.createImageData(width, height);
    for (let i = 0; i < maskData.length; i++) {
        const pixelIndex = i * 4;
        const value = maskData[i];
        imageData.data[pixelIndex] = value;
        imageData.data[pixelIndex + 1] = value;
        imageData.data[pixelIndex + 2] = value;
        imageData.data[pixelIndex + 3] = 255;
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

// ============================================
// PUBLIC API FUNCTIONS
// ============================================

/**
 * 単一プレイヤーの枠を検出・削除
 * @param {HTMLCanvasElement|string} input - Canvasまたはbase64画像データ
 * @param {string} player - '1P' (blue) or '2P' (red) or '1P2P' (red on 1P result)
 * @param {Object} options - オプション設定
 * @returns {Promise<Object>} 処理結果
 */
async function processSinglePlayerFrame(input, player, options = {}) {
    const {
        debug = false,
        additionalTopCropRatio = 1/50,
        logCallback = null
    } = options;

    const log = logCallback || (() => {});
    const color = (player === '1P') ? 'blue' : 'red';
    
    log(`🎯 Processing ${player} (${color}) frame...`);
    
    // 入力をCanvasに統一
    let canvas;
    if (typeof input === 'string') {
        // Base64の場合は変換
        canvas = await canvasUtils.base64ToCanvas(input);
    } else if (input instanceof HTMLCanvasElement) {
        canvas = input;
    } else {
        throw new Error('Input must be HTMLCanvasElement or base64 string');
    }
    
    const imageData = canvasUtils.canvasToImageData(canvas);
    
    // 主要色マスクと上部用複合マスクを作成
    const { mask: primaryMask, width, height } = extractColorMask(imageData, color);
    const topColorKey = color === 'blue' ? 'blue_gray_white' : 'red_gray_white';
    const { mask: topMask } = extractColorMask(imageData, topColorKey);
    const boundaries = findFrameBoundariesInsideOut(primaryMask, topMask, width, height);
    const { left, right, top, bottom, topFrameRemoved } = boundaries;

    // 結果の妥当性チェック
    if (right - left < width * 0.7 || bottom - top < height * 0.7) {
        log(`⚠️ Crop too small for ${player}, skipping.`);
        return { success: false, error: 'Crop too small', player };
    }

    if (left >= right || top >= bottom) {
        log(`⚠️ Invalid boundaries for ${player}, skipping.`);
        return { success: false, error: 'Invalid boundaries', player };
    }

    // 上枠削除処理
    let additionalTopCrop = 0;
    let finalTop = top;
    if (topFrameRemoved) {
        const cropHeight = bottom - top;
        additionalTopCrop = Math.floor(cropHeight * additionalTopCropRatio);
        finalTop = top + additionalTopCrop;
        log(`🔝 Top frame removed, cropping additional ${additionalTopCrop}px from top`);
    }

    // 追加削除後の妥当性チェック
    if (bottom - finalTop < height * 0.3) {
        log(`⚠️ Crop too small after additional top cropping for ${player}`);
        return { success: false, error: 'Crop too small after top cropping', player };
    }

    // 画像をクロップ
    const croppedCanvas = cropImageToCanvas(canvas, left, right, finalTop, bottom);
    
    const result = {
        success: true,
        player,
        cropped: {
            canvas: croppedCanvas,
            base64: canvasUtils.canvasToBase64(croppedCanvas)  // 後方互換性のため残す
        },
        boundaries: { left, right, top: finalTop, bottom, topFrameRemoved },
        info: {
            originalSize: { width, height },
            croppedSize: { width: right - left, height: bottom - finalTop },
            additionalTopCrop
        }
    };

    // デバッグ情報を追加
    if (debug) {
        const maskCanvas = createMaskCanvas(primaryMask, width, height);
        const topMaskCanvas = createMaskCanvas(topMask, width, height);
        const debugCanvas = createDebugCanvas(
            canvas, 
            { ...boundaries, top: finalTop }, 
            0.1, 
            0.05, 
            additionalTopCrop
        );

        result.debug = {
            mask: {
                canvas: maskCanvas,
                base64: canvasUtils.canvasToBase64(maskCanvas)
            },
            topMask: {
                canvas: topMaskCanvas,
                base64: canvasUtils.canvasToBase64(topMaskCanvas)
            },
            debugImage: {
                canvas: debugCanvas,
                base64: canvasUtils.canvasToBase64(debugCanvas)
            }
        };
    }

    log(`✅ Successfully processed ${player}`);
    return result;
}

/**
 * 両プレイヤーの枠を検出・削除
 * @param {HTMLCanvasElement|string} input - Canvasまたはbase64画像データ
 * @param {Object} options - オプション設定
 * @returns {Promise<Object>} 処理結果
 */
async function processBothPlayersFrames(input, options = {}) {
    const { logCallback = null } = options;
    const log = logCallback || (() => {});
    
    log(`🎯 Processing both players (1P + 2P)...`);

    const results = {
        success: true,
        players: {},
        errors: []
    };

    // 1P (Blue) を処理
    try {
        const player1Result = await processSinglePlayerFrame(input, '1P', options);
        results.players['1P'] = player1Result;
        if (!player1Result.success) {
            results.errors.push(`1P: ${player1Result.error}`);
        }
    } catch (error) {
        results.errors.push(`1P: ${error.message}`);
        results.players['1P'] = { success: false, error: error.message, player: '1P' };
    }

    // 2P (Red) を処理
    try {
        const player2Result = await processSinglePlayerFrame(input, '2P', options);
        results.players['2P'] = player2Result;
        if (!player2Result.success) {
            results.errors.push(`2P: ${player2Result.error}`);
        }
    } catch (error) {
        results.errors.push(`2P: ${error.message}`);
        results.players['2P'] = { success: false, error: error.message, player: '2P' };
    }

    // 1P2P を処理 (1Pの結果からさらに赤枠を除去)
    try {
        if (results.players["1P"].success) {
            const croppedCanvas1P = results.players["1P"].cropped.canvas;
            const player1P2PResult = await processSinglePlayerFrame(croppedCanvas1P, '2P', options);
            results.players['1P2P'] = player1P2PResult;
            if (!player1P2PResult.success) {
                results.errors.push(`1P2P: ${player1P2PResult.error}`);
            }
        } else {
            results.errors.push(`1P2P: Cannot process due to 1P failure`);
            results.players['1P2P'] = { success: false, error: 'Cannot process due to 1P failure', player: '1P2P' };
        }
    } catch (error) {
        results.errors.push(`1P2P: ${error.message}`);
        results.players['1P2P'] = { success: false, error: error.message, player: '1P2P' };
    }

    results.success = results.errors.length === 0;
    
    if (results.success) {
        log(`✅ Successfully processed both players`);
    } else {
        log(`⚠️ Completed with ${results.errors.length} errors`);
    }

    return results;
}

// 使用例を示すラッパー関数（簡単なアクセス用）
async function cropColorFrames(canvas, options = {}) {
    return await processBothPlayersFrames(canvas, options);
}

// エクスポート（モジュール使用時）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        // processSinglePlayerFrame,
        // processBothPlayersFrames,
        cropColorFrames,
        // canvasUtils
    };
}