let session = null;
let uploadedImage = null;
let currentFumenUrl = '';

// ラベル名の定義
const LABEL_NAMES = [
    "_", "I", "O", "T", "L", "J", "S", "Z", "X"
];

// サンプル画像を読み込む（SAMPLE_IMAGEを使用）
function loadSampleImage() {
    if (typeof SAMPLE_IMAGE === 'undefined') {
        showStatus('❌ エラー: サンプル画像が見つかりません', 'error');
        return;
    }
    
    const img = new Image();
    img.onload = function() {
        uploadedImage = img;
        const preview = document.getElementById('preview');
        const previewSection = document.getElementById('previewSection');
        
        preview.src = SAMPLE_IMAGE;
        previewSection.style.display = 'block';
        
        document.getElementById('analyzeBtn').disabled = !session;
        showStatus('✅ サンプル画像が読み込まれました。分析ボタンを押してください。', 'success');
    };
    img.onerror = function() {
        showStatus('❌ エラー: サンプル画像の読み込みに失敗しました', 'error');
    };
    img.src = SAMPLE_IMAGE;
}

// 数字列をFumen用のフィールド文字列に変換
function convertToFumenField(numberString) {
    if (numberString.length !== 200) {
        throw new Error('数字列は200文字である必要があります');
    }
    
    let fumenField = '';
    
    // 10列×20行の数字列を処理
    // 上から下へ、左から右への順序でFumen形式に変換
    for (let row = 0; row < 20; row++) {
        for (let col = 0; col < 10; col++) {
            const index = col * 20 + row; // 列優先の順序
            const number = parseInt(numberString[index]);
            const label = LABEL_NAMES[number];
            fumenField += label;
        }
    }
    
    return fumenField;
}

// 数字列からFumen URLを生成
function generateFumenUrl(numberString) {
    try {
        const fieldStr = convertToFumenField(numberString);
        const field = tetrisFumen.Field.create(fieldStr);
        
        const pages = [{ field, comment: '' }];
        const fumen = tetrisFumen.encoder.encode(pages);
        
        return `https://knewjade.github.io/fumen-for-mobile/#?d=${fumen}`;
        
    } catch (error) {
        console.error('Fumen URL生成エラー:', error);
        throw error;
    }
}

// Fumen URLを開く
function openFumenUrl() {
    if (currentFumenUrl) {
        window.open(currentFumenUrl, '_blank');
    }
}

// Fumen URLをコピー
function copyFumenUrl() {
    if (currentFumenUrl) {
        navigator.clipboard.writeText(currentFumenUrl).then(() => {
            const copyBtn = document.getElementById('copyFumenBtn');
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✅ コピー完了！';
            copyBtn.style.backgroundColor = '#28a745';
            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.backgroundColor = '#007bff';
            }, 2000);
        }).catch(err => {
            console.error('コピーに失敗:', err);
            alert('URLのコピーに失敗しました');
        });
    }
}

// ONNXモデルをロード
async function loadModel() {
    try {
        showStatus('🔄 モデルを読み込み中...', 'loading');
        session = await ort.InferenceSession.create('./models/tetris_mobilenet_v3_small.onnx');

        showStatus('✅ モデルが正常に読み込まれました', 'success');
        console.log('モデル読み込み完了');
    } catch (error) {
        console.error('モデルの読み込みに失敗:', error);
        showStatus('❌ エラー: モデルファイル(tetris_mobilenet_v3_small.onnx)が見つかりません', 'error');
    }
}

// ステータス表示
function showStatus(message, type = '') {
    const statusDiv = document.getElementById('statusDiv');
    statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
}

// 画像を前処理（224x224にリサイズして正規化）
function preprocessImage(imageElement, targetWidth = 224, targetHeight = 224) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.drawImage(imageElement, 0, 0, targetWidth, targetHeight);
    
    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imageData.data;
    
    // RGB値を[0,1]に正規化
    const input = new Float32Array(1 * 3 * targetWidth * targetHeight);
    
    for (let i = 0; i < targetWidth * targetHeight; i++) {
        const r = data[i * 4] / 255.0;
        const g = data[i * 4 + 1] / 255.0;
        const b = data[i * 4 + 2] / 255.0;
        
        input[i] = r;
        input[targetWidth * targetHeight + i] = g;
        input[targetWidth * targetHeight * 2 + i] = b;
    }
    
    return input;
}

// 盤面分析メイン処理
async function analyzeBoardImage_() {
    if (!session || !uploadedImage) return;
    
    const analyzeBtn = document.getElementById('analyzeBtn');
    const results = document.getElementById('results');
    const fumenUrl = document.getElementById('fumenUrl');
    
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = '🔍 分析中...';
    showStatus('🔄 盤面を10×20のセルに分割して分析中...', 'loading');
    results.style.display = 'none';
    
    try {
        // 画像をCanvasに描画
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = uploadedImage.width;
        canvas.height = uploadedImage.height;
        ctx.drawImage(uploadedImage, 0, 0);
        
        // セルサイズ計算
        const cellWidth = canvas.width / 10;
        const cellHeight = canvas.height / 20;
        
        const predictedLabels = [];
        
        // 10列×20行の各セルを処理
        for (let col = 0; col < 10; col++) {
            for (let row = 0; row < 20; row++) {
                // セル座標計算
                const x1 = Math.floor(col * cellWidth);
                const y1 = Math.floor(row * cellHeight);
                const x2 = Math.floor((col + 1) * cellWidth);
                const y2 = Math.floor((row + 1) * cellHeight);
                
                // セル画像を切り出し
                const cellCanvas = document.createElement('canvas');
                const cellCtx = cellCanvas.getContext('2d');
                const cellW = x2 - x1;
                const cellH = y2 - y1;
                
                cellCanvas.width = cellW;
                cellCanvas.height = cellH;
                cellCtx.drawImage(canvas, x1, y1, cellW, cellH, 0, 0, cellW, cellH);
                
                // セル画像をImageオブジェクトに変換
                const cellImg = new Image();
                await new Promise((resolve) => {
                    cellImg.onload = resolve;
                    cellImg.src = cellCanvas.toDataURL();
                });
                
                // 前処理
                const cellData = preprocessImage(cellImg);
                
                // 推論実行
                const inputTensor = new ort.Tensor('float32', cellData, [1, 3, 224, 224]);
                const outputMap = await session.run({ input: inputTensor });
                const output = outputMap.output.data;
                
                // 最大値のインデックスを取得
                let maxIndex = 0;
                let maxValue = output[0];
                for (let i = 1; i < output.length; i++) {
                    if (output[i] > maxValue) {
                        maxValue = output[i];
                        maxIndex = i;
                    }
                }
                
                predictedLabels.push(maxIndex.toString());
                
                // 進捗表示
                const progress = Math.floor(((col * 20 + row + 1) / 200) * 100);
                showStatus(`🔄 分析中... ${progress}% (${col * 20 + row + 1}/200セル)`, 'loading');
            }
        }
        
        // 結果を表示
        const labelString = predictedLabels.join('');
        
        // Fumen URL生成
        try {
            currentFumenUrl = generateFumenUrl(labelString);
            fumenUrl.textContent = currentFumenUrl;
            showStatus(`🎉 分析完了！Fumen譜面が生成されました`, 'success');
        } catch (fumenError) {
            console.error('Fumen URL生成エラー:', fumenError);
            fumenUrl.textContent = 'Fumen URL生成に失敗しました: ' + fumenError.message;
            currentFumenUrl = '';
            showStatus(`⚠️ 分析完了（Fumen URL生成でエラーが発生）`, 'error');
        }
        
        results.style.display = 'block';
        console.log(`予測結果: ${labelString}`);
        console.log(`Fumen URL: ${currentFumenUrl}`);
        
    } catch (error) {
        console.error('分析エラー:', error);
        showStatus('❌ エラー: 分析中に問題が発生しました', 'error');
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = '🔍 分析開始';
    }
}

// 盤面分析メイン処理（expansion_factor対応版）
async function analyzeBoardImage() {
    if (!session || !uploadedImage) return;
    
    const analyzeBtn = document.getElementById('analyzeBtn');
    const results = document.getElementById('results');
    const fumenUrl = document.getElementById('fumenUrl');
    
    // 設定値（datasetクラスと同じ）
    const expansionFactor = 2;
    const paddingColor = [0, 0, 0]; // RGB
    
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = '🔍 分析中...';
    showStatus('🔄 盤面を10×20のセルに分割して分析中...', 'loading');
    results.style.display = 'none';
    
    try {
        // 画像をCanvasに描画
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = uploadedImage.width;
        canvas.height = uploadedImage.height;
        ctx.drawImage(uploadedImage, 0, 0);
        
        // セルサイズ計算
        const cellWidth = canvas.width / 10;
        const cellHeight = canvas.height / 20;
        
        // ボード全体の座標（通常は画像全体と同じ）
        const boardPos = [0, 0, canvas.width, canvas.height];
        
        const predictedLabels = [];
        
        // セル領域拡張関数
        function expandCellRegion(cellPos, boardPos) {
            const [x1, y1, x2, y2] = cellPos;
            const [boardX1, boardY1, boardX2, boardY2] = boardPos;
            
            // セルの幅と高さ
            const cellW = x2 - x1;
            const cellH = y2 - y1;
            
            // 拡張量計算（中心から各方向への拡張）
            const expandWidth = Math.floor(cellW * (expansionFactor - 1) / 2);
            const expandHeight = Math.floor(cellH * (expansionFactor - 1) / 2);
            
            // 拡張後の座標
            const expandedX1 = x1 - expandWidth;
            const expandedY1 = y1 - expandHeight;
            const expandedX2 = x2 + expandWidth;
            const expandedY2 = y2 + expandHeight;
            
            return [expandedX1, expandedY1, expandedX2, expandedY2];
        }
        
        // パディング付きクロップ関数
        function createPaddedCrop(sourceCanvas, cropRegion, boardPos) {
            const [cropX1, cropY1, cropX2, cropY2] = cropRegion;
            const [boardX1, boardY1, boardX2, boardY2] = boardPos;
            const imgWidth = sourceCanvas.width;
            const imgHeight = sourceCanvas.height;
            
            // クロップ領域のサイズ
            const cropWidth = cropX2 - cropX1;
            const cropHeight = cropY2 - cropY1;
            
            // パディング画像を作成
            const paddedCanvas = document.createElement('canvas');
            const paddedCtx = paddedCanvas.getContext('2d');
            paddedCanvas.width = cropWidth;
            paddedCanvas.height = cropHeight;
            
            // パディング色で塗りつぶし
            paddedCtx.fillStyle = `rgb(${paddingColor[0]}, ${paddingColor[1]}, ${paddingColor[2]})`;
            paddedCtx.fillRect(0, 0, cropWidth, cropHeight);
            
            // 元画像からコピーする領域を計算
            // 画像境界内に収める
            let srcX1 = Math.max(0, cropX1);
            let srcY1 = Math.max(0, cropY1);
            let srcX2 = Math.min(imgWidth, cropX2);
            let srcY2 = Math.min(imgHeight, cropY2);
            
            // ボード境界外は除外
            srcX1 = Math.max(srcX1, boardX1);
            srcY1 = Math.max(srcY1, boardY1);
            srcX2 = Math.min(srcX2, boardX2);
            srcY2 = Math.min(srcY2, boardY2);
            
            // コピー先の座標
            const dstX1 = srcX1 - cropX1;
            const dstY1 = srcY1 - cropY1;
            
            // 有効な領域がある場合のみコピー
            if (srcX2 > srcX1 && srcY2 > srcY1) {
                const srcWidth = srcX2 - srcX1;
                const srcHeight = srcY2 - srcY1;
                
                paddedCtx.drawImage(
                    sourceCanvas,
                    srcX1, srcY1, srcWidth, srcHeight,  // source
                    dstX1, dstY1, srcWidth, srcHeight   // destination
                );
            }
            
            // 意図通りの入力となっているか確認するためlog
            const base64 = paddedCanvas.toDataURL();
            console.log(`DEBUG IMAGE:`, base64);
            
            return paddedCanvas;
        }
        
        // 10列×20行の各セルを処理
        for (let col = 0; col < 10; col++) {
            for (let row = 0; row < 20; row++) {
                // セル座標計算
                const x1 = Math.floor(col * cellWidth);
                const y1 = Math.floor(row * cellHeight);
                const x2 = Math.floor((col + 1) * cellWidth);
                const y2 = Math.floor((row + 1) * cellHeight);
                
                const cellPos = [x1, y1, x2, y2];
                
                // セル領域を拡張
                const expandedRegion = expandCellRegion(cellPos, boardPos);
                
                // パディング付きクロップでセル画像を作成
                const cellCanvas = createPaddedCrop(canvas, expandedRegion, boardPos);
                
                // セル画像をImageオブジェクトに変換
                const cellImg = new Image();
                await new Promise((resolve) => {
                    cellImg.onload = resolve;
                    cellImg.src = cellCanvas.toDataURL();
                });
                
                // 前処理
                const cellData = preprocessImage(cellImg);
                
                // 推論実行
                const inputTensor = new ort.Tensor('float32', cellData, [1, 3, 224, 224]);
                const outputMap = await session.run({ input: inputTensor });
                const output = outputMap.output.data;
                
                // 最大値のインデックスを取得
                let maxIndex = 0;
                let maxValue = output[0];
                for (let i = 1; i < output.length; i++) {
                    if (output[i] > maxValue) {
                        maxValue = output[i];
                        maxIndex = i;
                    }
                }
                
                predictedLabels.push(maxIndex.toString());
                
                // 進捗表示
                const progress = Math.floor(((col * 20 + row + 1) / 200) * 100);
                showStatus(`🔄 分析中... ${progress}% (${col * 20 + row + 1}/200セル)`, 'loading');
            }
        }
        
        // 結果を表示
        const labelString = predictedLabels.join('');
        
        // Fumen URL生成
        try {
            currentFumenUrl = generateFumenUrl(labelString);
            fumenUrl.textContent = currentFumenUrl;
            showStatus(`🎉 分析完了！Fumen譜面が生成されました`, 'success');
        } catch (fumenError) {
            console.error('Fumen URL生成エラー:', fumenError);
            fumenUrl.textContent = 'Fumen URL生成に失敗しました: ' + fumenError.message;
            currentFumenUrl = '';
            showStatus(`⚠️ 分析完了（Fumen URL生成でエラーが発生）`, 'error');
        }
        
        results.style.display = 'block';
        console.log(`予測結果: ${labelString}`);
        console.log(`Fumen URL: ${currentFumenUrl}`);
        
    } catch (error) {
        console.error('分析エラー:', error);
        showStatus('❌ エラー: 分析中に問題が発生しました', 'error');
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = '🔍 分析開始';
    }
}

// クリップボードから画像を貼り付ける
function handlePaste(e) {
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            const reader = new FileReader();
            
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    uploadedImage = img;
                    const preview = document.getElementById('preview');
                    const previewSection = document.getElementById('previewSection');
                    
                    preview.src = event.target.result;
                    previewSection.style.display = 'block';
                    
                    document.getElementById('analyzeBtn').disabled = !session;
                    showStatus('✅ クリップボードから画像が読み込まれました。分析ボタンを押してください。', 'success');
                };
                img.src = event.target.result;
            };
            
            reader.readAsDataURL(blob);
            e.preventDefault();
            break;
        }
    }
}

// キーボードイベントリスナーを追加
document.addEventListener('paste', handlePaste);

// フォーカス可能にするためのtabindex追加
document.addEventListener('DOMContentLoaded', function() {
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
});

const fileInput = document.getElementById('fileInput')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                uploadedImage = img;
                const preview = document.getElementById('preview');
                const previewSection = document.getElementById('previewSection');
                
                preview.src = e.target.result;
                previewSection.style.display = 'block';
                
                document.getElementById('analyzeBtn').disabled = !session;
                showStatus('✅ 画像が読み込まれました。分析ボタンを押してください。', 'success');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// 分析ボタン
document.getElementById('analyzeBtn')?.addEventListener('click', analyzeBoardImage);

// 初期化
loadModel();
