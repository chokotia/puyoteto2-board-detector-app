// Mino クラス定義
const MINO_CLASSES = [
    "mino-empty", "mino-I", "mino-O", "mino-T", 
    "mino-L", "mino-J", "mino-S", "mino-Z", "mino-X"
];

// テトリス盤面作成
function createTetrisBoard() {
    const board = document.getElementById('tetrisBoard');
    board.innerHTML = '';
    
    // 20行×10列のセルを作成
    for (let row = 0; row < 20; row++) {
        for (let col = 0; col < 10; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell mino-empty';
            cell.id = `cell-${row}-${col}`;
            board.appendChild(cell);
        }
    }
}

// テトリス盤面描画
function drawTetrisBoard(input) {
    // 入力チェック
    if (input.length !== 200) {
        console.error(`入力データは200文字である必要があります。現在: ${input.length}文字`);
        return;
    }

    // 数字以外が含まれていないかチェック
    if (!/^[0-8]+$/.test(input)) {
        console.error('入力データは0-8の数字のみである必要があります。');
        return;
    }

    // 盤面を作成
    createTetrisBoard();

    // データを解析して盤面に反映
    for (let i = 0; i < 200; i++) {
        const minoIndex = parseInt(input[i]);
        
        // 列優先でのインデックス計算
        const col = Math.floor(i / 20);  // 列 (0-9)
        const row = i % 20;              // 行 (0-19)
        
        const cell = document.getElementById(`cell-${row}-${col}`);
        if (cell) {
            // 既存のミノクラスを除去
            MINO_CLASSES.forEach(cls => cell.classList.remove(cls));
            
            // 新しいミノクラスを追加
            cell.classList.add(MINO_CLASSES[minoIndex]);
        }
    }
}

// エクスポート（モジュール使用時）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        drawTetrisBoard
    };
}