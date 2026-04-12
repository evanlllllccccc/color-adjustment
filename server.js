const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();

// 强制刷新输出流，确保日志实时显示
process.stdout.write = process.stdout.write.bind(process.stdout);
process.stderr.write = process.stderr.write.bind(process.stderr);

console.log('=== 应用启动中 ===');

// 跨域配置
app.use(cors({
    origin: [
        "https://color-adjustment.vercel.app",
        "http://localhost:3000"
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '.')));

// 数据库路径：在 Railway 中确保目录可写
const dbDir = process.env.NODE_ENV === 'production' ? '/app' : __dirname;
const dbPath = path.join(dbDir, 'database.db');

console.log('数据库路径:', dbPath);

// 确保目录存在（Railway 中 /app 应该已存在，但以防万一）
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ 数据库打开失败:', err.message);
        process.exit(1);
    } else {
        console.log('✅ 数据库连接成功');
        initDatabase();
    }
});

function initDatabase() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'user',
            loginToday INTEGER DEFAULT 0,
            lastLoginDate TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            path TEXT,
            dyeCount INTEGER DEFAULT 0,
            aiScore REAL DEFAULT 0
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS dyeRecords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            imageId INTEGER,
            score INTEGER,
            comment TEXT,
            colors TEXT,
            draft INTEGER DEFAULT 0,
            collect INTEGER DEFAULT 0,
            createTime TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS blockWords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT UNIQUE
        )`);
        db.run(`INSERT OR IGNORE INTO users (username,password,role) VALUES ('admin','123456','admin')`);
        console.log('✅ 数据库表初始化完成');
    });
}

// ====================== 路由 ======================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const today = new Date().toISOString().split('T')[0];
    db.get(`SELECT * FROM users WHERE username=? AND password=?`, [username, password], (err, row) => {
        if (err) {
            console.error('登录查询错误:', err);
            return res.status(500).json({ success: false, msg: '服务器错误' });
        }
        if (!row) return res.json({ success: false, msg: '账号或密码错误' });
        db.run(`UPDATE users SET loginToday=?, lastLoginDate=? WHERE id=?`,
            row.lastLoginDate !== today ? 1 : row.loginToday + 1, today, row.id);
        res.json({ success: true, user: row });
    });
});

app.post('/api/guest', (req, res) => {
    res.json({ success: true, userId: 0 });
});

app.get('/api/block-words', (req, res) => {
    db.all(`SELECT word FROM blockWords`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/add-block-word', (req, res) => {
    const { word } = req.body;
    db.run(`INSERT OR IGNORE INTO blockWords (word) VALUES (?)`, [word], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

function checkBlockWord(comment, callback) {
    db.all(`SELECT word FROM blockWords`, (err, words) => {
        if (err) return callback(false);
        const hasBlock = words.some(item => comment.includes(item.word));
        callback(hasBlock);
    });
}

app.get('/api/today-login', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    db.get(`SELECT COUNT(*) AS num FROM users WHERE lastLoginDate=?`, [today], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ num: row?.num || 0 });
    });
});

app.get('/api/images', (req, res) => {
    db.all(`SELECT * FROM images`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, __dirname),
    filename: (req, file, cb) => cb(null, 'img-' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });
app.post('/api/upload-image', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '没有上传文件' });
    const { filename } = req.file;
    db.run(`INSERT INTO images (name, path) VALUES (?, ?)`, [filename, filename], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

app.post('/api/add-dye-count', (req, res) => {
    const { imageId } = req.body;
    db.run(`UPDATE images SET dyeCount = dyeCount + 1 WHERE id=?`, [imageId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/submit-dye', (req, res) => {
    const { userId, imageId, score, comment, colors, draft } = req.body;
    checkBlockWord(comment, (hasBlock) => {
        if (hasBlock) return res.json({ success: false, msg: '包含不当语言' });
        const time = new Date().toISOString();
        db.run(`INSERT INTO dyeRecords (userId,imageId,score,comment,colors,draft,createTime) VALUES (?,?,?,?,?,?,?)`,
            [userId, imageId, score, comment, colors, draft, time], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                if (!draft) {
                    db.run(`UPDATE images SET dyeCount = dyeCount + 1 WHERE id=?`, [imageId]);
                }
                res.json({ success: true, id: this.lastID });
            });
    });
});

app.post('/api/my-works', (req, res) => {
    const { userId, draft } = req.body;
    db.all(`SELECT * FROM dyeRecords WHERE userId=? AND draft=?`, [userId, draft], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/collect-work', (req, res) => {
    const { id } = req.body;
    db.run(`UPDATE dyeRecords SET collect=1 WHERE id=?`, [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/my-collect', (req, res) => {
    const { userId } = req.body;
    db.all(`SELECT * FROM dyeRecords WHERE userId=? AND collect=1`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/my-comments', (req, res) => {
    const { userId } = req.body;
    db.all(`SELECT * FROM dyeRecords WHERE userId=?`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/rank', (req, res) => {
    db.all(`SELECT userId, AVG(score) AS avgScore FROM dyeRecords WHERE draft=0 GROUP BY userId ORDER BY avgScore DESC LIMIT 50`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
});

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ======================================
// Railway 部署修复：使用环境变量PORT + 绑定0.0.0.0
// ======================================
const PORT = process.env.PORT || 3000;  // Railway 会注入 PORT，不要硬编码8080

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 服务器运行在端口 ${PORT}`);
    console.log(`📍 健康检查: http://0.0.0.0:${PORT}/health`);
}).on('error', (err) => {
    console.error('❌ 服务器启动失败:', err.message);
    process.exit(1);
});
// 优雅关闭
process.on('SIGTERM', () => {
    console.log('收到 SIGTERM，关闭服务器...');
    server.close(() => {
        db.close();
        console.log('服务器已关闭');
        process.exit(0);
    });
});
