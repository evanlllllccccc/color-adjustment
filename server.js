const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const app = express();
// 中间件
// ================= 核心配置：允许前端跨域 =================
app.use(cors({
  origin: [
    "https://color-adjustment.vercel.app", // 你的 Vercel 前端域名
    "http://localhost:3000"              // 本地测试备用
  ],
  credentials: true, // 允许携带 cookie
  methods: ["GET", "POST", "PUT", "DELETE"]
}));
// ===========================================================

app.use(express.json());
app.use(express.static(path.join(__dirname, '.'))); // 静态资源
// 数据库初始化（线上也能用）
const db = new sqlite3.Database(path.join(__dirname, './database.db'));
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
});

// ====================== 1. 登录相关 ======================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const today = new Date().toISOString().split('T')[0];
    db.get(`SELECT * FROM users WHERE username=? AND password=?`, [username, password], (err, row) => {
        if (!row) return res.json({ success: false, msg: '账号或密码错误' });
        db.run(`UPDATE users SET loginToday=?, lastLoginDate=? WHERE id=?`,
            row.lastLoginDate !== today ? 1 : row.loginToday + 1, today, row.id);
        res.json({ success: true, user: row });
    });
});

app.post('/api/guest', (req, res) => {
    res.json({ success: true, userId: 0 });
});

// ====================== 2. 屏蔽词 ======================
app.get('/api/block-words', (req, res) => {
    db.all(`SELECT word FROM blockWords`, (err, rows) => res.json(rows));
});

app.post('/api/add-block-word', (req, res) => {
    const { word } = req.body;
    db.run(`INSERT OR IGNORE INTO blockWords (word) VALUES (?)`, [word], () => {
        res.json({ success: true });
    });
});

function checkBlockWord(comment, callback) {
    db.all(`SELECT word FROM blockWords`, (err, words) => {
        const hasBlock = words.some(item => comment.includes(item.word));
        callback(hasBlock);
    });
}

// ====================== 3. 数据统计 ======================
app.get('/api/today-login', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    db.get(`SELECT COUNT(*) AS num FROM users WHERE lastLoginDate=?`, [today], (err, row) => {
        res.json({ num: row.num || 0 });
    });
});

// ====================== 4. 图片管理 ======================
app.get('/api/images', (req, res) => {
    db.all(`SELECT * FROM images`, (err, rows) => res.json(rows));
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, __dirname),
    filename: (req, file, cb) => cb(null, 'img-' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });
app.post('/api/upload-image', upload.single('file'), (req, res) => {
    const { filename } = req.file;
    db.run(`INSERT INTO images (name, path) VALUES (?, ?)`, [filename, filename], () => {
        res.json({ success: true });
    });
});

app.post('/api/add-dye-count', (req, res) => {
    const { imageId } = req.body;
    db.run(`UPDATE images SET dyeCount = dyeCount + 1 WHERE id=?`, [imageId], () => {
        res.json({ success: true });
    });
});

// ====================== 5. 染色/打分/评价/收藏 ======================
app.post('/api/submit-dye', (req, res) => {
    const { userId, imageId, score, comment, colors, draft } = req.body;
    checkBlockWord(comment, (hasBlock) => {
        if (hasBlock) return res.json({ success: false, msg: '包含不当语言' });
        const time = new Date().toISOString();
        db.run(`INSERT INTO dyeRecords (userId,imageId,score,comment,colors,draft,createTime) VALUES (?,?,?,?,?,?,?)`,
            [userId, imageId, score, comment, colors, draft, time], () => {
                if (!draft) db.run(`UPDATE images SET dyeCount = dyeCount + 1 WHERE id=?`, [imageId]);
                res.json({ success: true });
            });
    });
});

app.post('/api/my-works', (req, res) => {
    const { userId, draft } = req.body;
    db.all(`SELECT * FROM dyeRecords WHERE userId=? AND draft=?`, [userId, draft], (err, rows) => {
        res.json(rows);
    });
});

app.post('/api/collect-work', (req, res) => {
    const { id } = req.body;
    db.run(`UPDATE dyeRecords SET collect=1 WHERE id=?`, [id], () => {
        res.json({ success: true });
    });
});

app.post('/api/my-collect', (req, res) => {
    const { userId } = req.body;
    db.all(`SELECT * FROM dyeRecords WHERE userId=? AND collect=1`, [userId], (err, rows) => {
        res.json(rows);
    });
});

app.post('/api/my-comments', (req, res) => {
    const { userId } = req.body;
    db.all(`SELECT * FROM dyeRecords WHERE imageId IN (SELECT id FROM images WHERE id IN (SELECT imageId FROM dyeRecords WHERE userId=?))`,
        [userId], (err, rows) => res.json(rows));
});

// ====================== 6. 排行榜 ======================
app.get('/api/rank', (req, res) => {
    db.all(`SELECT userId, AVG(score) AS avgScore FROM dyeRecords WHERE draft=0 GROUP BY userId ORDER BY avgScore DESC LIMIT 50`,
        (err, rows) => res.json(rows));
});

// ====================== 启动服务（线上必须用 process.env.PORT） ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`服务已启动：端口 ${PORT}`);
});
