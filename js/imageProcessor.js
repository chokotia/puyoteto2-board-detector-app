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
