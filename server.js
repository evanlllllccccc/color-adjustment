const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const app = express();

// ====================== 跨域配置 ======================
// 允许前端域名（包括本地开发、Vercel 和您的阿里云 OSS）
const allowedOrigins = [
    'https://color-adjustment.vercel.app',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://colorad.oss-cn-beijing.aliyuncs.com'   // 您的阿里云 OSS 域名
];

app.use(cors({
    origin: function (origin, callback) {
        // 允许没有 origin 的请求（如 Postman）
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn('⚠️ CORS 阻止了来自:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json({ limit: '10mb' }));
// 托管 public 文件夹下的静态文件（前端页面）
app.use(express.static(path.join(__dirname, 'public')));

// ====================== 数据库初始化（关键修复） ======================
// 使用 Railway 可写路径
const dbPath = process.env.NODE_ENV === 'production'
    ? path.join('/app', 'database.db')    // Railway 容器内固定路径
    : path.join(__dirname, 'database.db');

console.log('📁 数据库路径:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ 数据库连接失败:', err.message);
        process.exit(1);
    }
    console.log('✅ 数据库连接成功');
});

// 封装 Promise 以顺序初始化表
function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

async function initDatabase() {
    try {
        // 创建表（如果不存在）
        await runAsync(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'user',
            loginToday INTEGER DEFAULT 0,
            lastLoginDate TEXT
        )`);
        console.log('✅ users 表已就绪');

        await runAsync(`CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            path TEXT,
            dyeCount INTEGER DEFAULT 0,
            aiScore REAL DEFAULT 0
        )`);
        console.log('✅ images 表已就绪');

        await runAsync(`CREATE TABLE IF NOT EXISTS dyeRecords (
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
        console.log('✅ dyeRecords 表已就绪');

        await runAsync(`CREATE TABLE IF NOT EXISTS blockWords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT UNIQUE
        )`);
        console.log('✅ blockWords 表已就绪');

        // 插入默认管理员账号（如果不存在）
        await runAsync(
            `INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
            ['admin', '123456', 'admin']
        );
        console.log('✅ 默认管理员账号已确保存在');

        console.log('🎉 数据库初始化完成');
    } catch (err) {
        console.error('❌ 数据库初始化失败:', err.message);
        process.exit(1);
    }
}

// ====================== 业务接口 ======================

// 健康检查（Railway 探针）
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// 登录
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, msg: '账号和密码不能为空' });
    }
    const today = new Date().toISOString().split('T')[0];
    db.get(
        `SELECT * FROM users WHERE username=? AND password=?`,
        [username, password],
        (err, row) => {
            if (err) {
                console.error('登录查询错误:', err);
                return res.status(500).json({ success: false, msg: '服务器错误' });
            }
            if (!row) return res.json({ success: false, msg: '账号或密码错误' });

            // 更新登录统计
            db.run(
                `UPDATE users SET loginToday=?, lastLoginDate=? WHERE id=?`,
                [row.lastLoginDate !== today ? 1 : row.loginToday + 1, today, row.id]
            );
            // 不返回密码字段
            const { password, ...userWithoutPassword } = row;
            res.json({ success: true, user: userWithoutPassword });
        }
    );
});

// 游客模式
app.post('/api/guest', (req, res) => {
    res.json({ success: true, userId: 0 });
});

// ====================== 屏蔽词管理 ======================
app.get('/api/block-words', (req, res) => {
    db.all(`SELECT word FROM blockWords`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/add-block-word', (req, res) => {
    const { word } = req.body;
    if (!word) return res.status(400).json({ success: false, msg: '缺少 word' });
    db.run(`INSERT OR IGNORE INTO blockWords (word) VALUES (?)`, [word], function (err) {
        if (err) return res.status(500).json({ success: false, msg: err.message });
        res.json({ success: true });
    });
});

// 检查屏蔽词（内部函数）
function checkBlockWord(comment, callback) {
    db.all(`SELECT word FROM blockWords`, (err, words) => {
        if (err) return callback(false);
        const hasBlock = words.some(item => comment.includes(item.word));
        callback(hasBlock);
    });
}

// ====================== 图片管理 ======================
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
    if (!req.file) return res.status(400).json({ success: false, msg: '没有上传文件' });
    const { filename } = req.file;
    db.run(`INSERT INTO images (name, path) VALUES (?, ?)`, [filename, filename], function (err) {
        if (err) return res.status(500).json({ success: false, msg: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

app.post('/api/add-dye-count', (req, res) => {
    const { imageId } = req.body;
    if (!imageId) return res.status(400).json({ success: false, msg: '缺少 imageId' });
    db.run(`UPDATE images SET dyeCount = dyeCount + 1 WHERE id=?`, [imageId], (err) => {
        if (err) return res.status(500).json({ success: false, msg: err.message });
        res.json({ success: true });
    });
});

// ====================== 染色记录 ======================
app.post('/api/submit-dye', (req, res) => {
    const { userId, imageId, score, comment, colors, draft } = req.body;
    if (!userId || !imageId) {
        return res.status(400).json({ success: false, msg: '缺少必要参数' });
    }
    checkBlockWord(comment || '', (hasBlock) => {
        if (hasBlock) return res.json({ success: false, msg: '包含不当语言' });
        const time = new Date().toISOString();
        db.run(
            `INSERT INTO dyeRecords (userId,imageId,score,comment,colors,draft,createTime) VALUES (?,?,?,?,?,?,?)`,
            [userId, imageId, score || 0, comment || '', colors || '', draft ? 1 : 0, time],
            function (err) {
                if (err) return res.status(500).json({ success: false, msg: err.message });
                if (!draft) {
                    db.run(`UPDATE images SET dyeCount = dyeCount + 1 WHERE id=?`, [imageId]);
                }
                res.json({ success: true, id: this.lastID });
            }
        );
    });
});

app.post('/api/my-works', (req, res) => {
    const { userId, draft } = req.body;
    if (!userId) return res.status(400).json({ success: false, msg: '缺少 userId' });
    db.all(
        `SELECT * FROM dyeRecords WHERE userId=? AND draft=?`,
        [userId, draft ? 1 : 0],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.post('/api/collect-work', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, msg: '缺少 id' });
    db.run(`UPDATE dyeRecords SET collect=1 WHERE id=?`, [id], (err) => {
        if (err) return res.status(500).json({ success: false, msg: err.message });
        res.json({ success: true });
    });
});

app.post('/api/my-collect', (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, msg: '缺少 userId' });
    db.all(`SELECT * FROM dyeRecords WHERE userId=? AND collect=1`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/my-comments', (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, msg: '缺少 userId' });
    db.all(`SELECT * FROM dyeRecords WHERE userId=?`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ====================== 排行榜 ======================
app.get('/api/rank', (req, res) => {
    db.all(
        `SELECT userId, AVG(score) AS avgScore FROM dyeRecords WHERE draft=0 GROUP BY userId ORDER BY avgScore DESC LIMIT 50`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// ====================== 启动服务器 ======================
const PORT = process.env.PORT || 3000;

// 先初始化数据库，再启动监听
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 服务器运行在端口 ${PORT}`);
    });
}).catch(err => {
    console.error('启动失败:', err);
    process.exit(1);
});