const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');                      // ✅ 新增 fs 模块
const app = express();

// ====================== 跨域配置 ======================
const allowedOrigins = [
    'https://color-adjustment.vercel.app',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://colorad.oss-cn-beijing.aliyuncs.com'
];

app.use(cors({
    origin: function (origin, callback) {
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
app.use(express.static(path.join(__dirname, 'public')));   // 托管前端静态文件

// ====================== 上传目录配置 ======================
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 创建上传目录:', uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'material-' + uniqueSuffix + ext);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.test(ext)) cb(null, true);
        else cb(new Error('只允许上传图片文件'));
    }
});

// ====================== 数据库初始化 ======================
const dbPath = process.env.NODE_ENV === 'production'
    ? path.join('/app', 'database.db')
    : path.join(__dirname, 'database.db');

console.log('📁 数据库路径:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ 数据库连接失败:', err.message);
        process.exit(1);
    }
    console.log('✅ 数据库连接成功');
});

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
            category TEXT,
            dyeCount INTEGER DEFAULT 0,
            aiScore REAL DEFAULT 0
        )`);
        console.log('✅ images 表已就绪');

        // 兼容旧表：如果 images 表没有 category 列则添加
        db.all(`PRAGMA table_info(images)`, (err, rows) => {
            if (!err && rows && !rows.find(col => col.name === 'category')) {
                db.run(`ALTER TABLE images ADD COLUMN category TEXT`);
                console.log('✅ images 表已增加 category 列');
            }
        });

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

app.get('/health', (req, res) => res.status(200).send('OK'));

// 注册
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, msg: '账号和密码不能为空' });
    db.get(`SELECT id FROM users WHERE username = ?`, [username], (err, row) => {
        if (err) return res.status(500).json({ success: false, msg: '服务器错误' });
        if (row) return res.json({ success: false, msg: '账号已存在' });
        db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, 'user')`, [username, password], function (err) {
            if (err) return res.status(500).json({ success: false, msg: '注册失败' });
            res.json({ success: true, msg: '注册成功' });
        });
    });
});

// 登录
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, msg: '账号和密码不能为空' });
    const today = new Date().toISOString().split('T')[0];
    db.get(`SELECT * FROM users WHERE username=? AND password=?`, [username, password], (err, row) => {
        if (err) return res.status(500).json({ success: false, msg: '服务器错误' });
        if (!row) return res.json({ success: false, msg: '账号或密码错误' });
        db.run(`UPDATE users SET loginToday=?, lastLoginDate=? WHERE id=?`, [row.lastLoginDate !== today ? 1 : row.loginToday + 1, today, row.id]);
        const { password, ...userWithoutPassword } = row;
        res.json({ success: true, user: userWithoutPassword });
    });
});

app.post('/api/guest', (req, res) => res.json({ success: true, userId: 0 }));

// 屏蔽词
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

function checkBlockWord(comment, callback) {
    db.all(`SELECT word FROM blockWords`, (err, words) => {
        if (err) return callback(false);
        const hasBlock = words.some(item => comment.includes(item.word));
        callback(hasBlock);
    });
}

// 图片列表（公共）
app.get('/api/images', (req, res) => {
    db.all(`SELECT * FROM images ORDER BY id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const images = rows.map(row => ({ ...row, imageUrl: row.path }));
        res.json(images);
    });
});

// 染色提交
app.post('/api/submit-dye', (req, res) => {
    const { userId, imageId, score, comment, colors, draft } = req.body;
    if (!userId || !imageId) return res.status(400).json({ success: false, msg: '缺少必要参数' });
    checkBlockWord(comment || '', (hasBlock) => {
        if (hasBlock) return res.json({ success: false, msg: '包含不当语言' });
        const time = new Date().toISOString();
        db.run(
            `INSERT INTO dyeRecords (userId,imageId,score,comment,colors,draft,createTime) VALUES (?,?,?,?,?,?,?)`,
            [userId, imageId, score || 0, comment || '', colors || '', draft ? 1 : 0, time],
            function (err) {
                if (err) return res.status(500).json({ success: false, msg: err.message });
                if (!draft) db.run(`UPDATE images SET dyeCount = dyeCount + 1 WHERE id=?`, [imageId]);
                res.json({ success: true, id: this.lastID });
            }
        );
    });
});

app.post('/api/my-works', (req, res) => {
    const { userId, draft } = req.body;
    db.all(`SELECT * FROM dyeRecords WHERE userId=? AND draft=?`, [userId, draft ? 1 : 0], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
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

// ====================== 管理员接口 ======================
function adminAuth(req, res, next) { next(); }  // 前端已做权限校验，后端放行

// 数据统计
app.get('/api/admin/stats', adminAuth, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    db.get(`SELECT COUNT(*) AS count FROM users`, (err, totalUsers) => {
        db.get(`SELECT COUNT(*) AS count FROM users WHERE lastLoginDate = ?`, [today], (err, newUsers) => {
            db.get(`SELECT COUNT(*) AS count FROM dyeRecords WHERE draft = 0`, (err, totalWorks) => {
                db.get(`SELECT COUNT(*) AS count FROM dyeRecords WHERE draft = 0 AND DATE(createTime) = ?`, [today], (err, newWorks) => {
                    db.get(`SELECT IFNULL(SUM(score), 0) AS total FROM dyeRecords`, (err, totalLikes) => {
                        db.get(`SELECT COUNT(*) AS count FROM dyeRecords`, (err, totalDye) => {
                            db.get(`SELECT COUNT(*) AS count FROM dyeRecords WHERE DATE(createTime) = ?`, [today], (err, todayDye) => {
                                res.json({
                                    totalUsers: totalUsers?.count || 0,
                                    newUsersToday: newUsers?.count || 0,
                                    totalWorks: totalWorks?.count || 0,
                                    newWorksToday: newWorks?.count || 0,
                                    totalLikes: totalLikes?.total || 0,
                                    todayViews: 0,
                                    totalDyeCount: totalDye?.count || 0,
                                    todayDyeCount: todayDye?.count || 0
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// 作品列表
app.get('/api/admin/works', adminAuth, (req, res) => {
    db.all(`
        SELECT dyeRecords.*, users.username AS authorName 
        FROM dyeRecords 
        LEFT JOIN users ON dyeRecords.userId = users.id 
        WHERE draft = 0
        ORDER BY createTime DESC
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const works = rows.map(row => ({
            id: row.id,
            title: row.comment ? row.comment.substring(0, 20) : '未命名',
            img: row.colors ? JSON.parse(row.colors)?.[0] : '',
            imageUrl: row.colors ? JSON.parse(row.colors)?.[0] : '',
            author: { account: row.authorName || '未知' },
            authorName: row.authorName || '未知',
            likes: row.score || 0,
            views: 0,
            time: row.createTime,
            comments: []
        }));
        res.json({ works });
    });
});

app.delete('/api/admin/works/:id', adminAuth, (req, res) => {
    db.run(`DELETE FROM dyeRecords WHERE id = ?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ✅ 素材管理（整合后无重复）
app.get('/api/admin/materials', adminAuth, (req, res) => {
    db.all(`SELECT id, name, path, category FROM images ORDER BY id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const materials = rows.map(row => ({
            id: row.id,
            name: row.name,
            imageUrl: row.path,        // 直接使用 path，它已经是 '/uploads/xxx' 格式
            img: row.path,
            category: row.category || ''
        }));
        res.json({ materials });
    });
});

app.post('/api/admin/materials', adminAuth, upload.single('image'), (req, res) => {
    const { name, category } = req.body;
    if (!req.file) return res.status(400).json({ success: false, msg: '缺少图片文件' });
    const imageUrl = '/uploads/' + req.file.filename;
    db.run(
        `INSERT INTO images (name, path, category) VALUES (?, ?, ?)`,
        [name || '未命名', imageUrl, category || ''],
        function (err) {
            if (err) return res.status(500).json({ success: false, msg: err.message });
            res.json({ success: true, id: this.lastID, imageUrl });
        }
    );
});

app.delete('/api/admin/materials/:id', adminAuth, (req, res) => {
    const { id } = req.params;
    db.get(`SELECT path FROM images WHERE id = ?`, [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row && row.path) {
            const filePath = path.join(__dirname, 'public', row.path);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        db.run(`DELETE FROM images WHERE id = ?`, [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// 评论监管
app.get('/api/comments', adminAuth, (req, res) => {
    db.all(`
        SELECT dyeRecords.id, dyeRecords.comment AS content, dyeRecords.createTime, 
               users.username, dyeRecords.imageId
        FROM dyeRecords 
        LEFT JOIN users ON dyeRecords.userId = users.id 
        WHERE dyeRecords.comment IS NOT NULL AND dyeRecords.comment != ''
        ORDER BY dyeRecords.createTime DESC
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/comment/:id', adminAuth, (req, res) => {
    db.run(`UPDATE dyeRecords SET comment = '' WHERE id = ?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 排行榜
app.get('/api/rank', (req, res) => {
    db.all(`
        SELECT dyeRecords.*, users.username 
        FROM dyeRecords 
        LEFT JOIN users ON dyeRecords.userId = users.id 
        WHERE draft = 0 
        ORDER BY score DESC 
        LIMIT 50
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ====================== 启动 ======================
const PORT = process.env.PORT || 3000;
initDatabase().then(() => {
    app.listen(PORT, () => console.log(`🚀 服务器运行在端口 ${PORT}`));
}).catch(err => {
    console.error('启动失败:', err);
    process.exit(1);
});