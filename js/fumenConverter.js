// ラベル名の定義
const LABEL_NAMES = [
    "_", "I", "O", "T", "L", "J", "S", "Z", "X"
];

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
