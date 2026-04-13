const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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
            avatar TEXT,
            intro TEXT,
            loginToday INTEGER DEFAULT 0,
            lastLoginDate TEXT
        )`);
        console.log('✅ users 表已就绪');

        // 兼容旧表：添加缺失字段
        db.all(`PRAGMA table_info(users)`, (err, rows) => {
            if (!err && rows) {
                if (!rows.find(col => col.name === 'avatar')) {
                    db.run(`ALTER TABLE users ADD COLUMN avatar TEXT`);
                    console.log('✅ users 表增加 avatar 列');
                }
                if (!rows.find(col => col.name === 'intro')) {
                    db.run(`ALTER TABLE users ADD COLUMN intro TEXT`);
                    console.log('✅ users 表增加 intro 列');
                }
            }
        });

        await runAsync(`CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            path TEXT,
            category TEXT,
            uploaderId INTEGER,
            isPublic INTEGER DEFAULT 1,
            dyeCount INTEGER DEFAULT 0,
            aiScore REAL DEFAULT 0
        )`);
        console.log('✅ images 表已就绪');

        db.all(`PRAGMA table_info(images)`, (err, rows) => {
            if (!err && rows) {
                if (!rows.find(col => col.name === 'category')) {
                    db.run(`ALTER TABLE images ADD COLUMN category TEXT`);
                }
                if (!rows.find(col => col.name === 'uploaderId')) {
                    db.run(`ALTER TABLE images ADD COLUMN uploaderId INTEGER`);
                }
                if (!rows.find(col => col.name === 'isPublic')) {
                    db.run(`ALTER TABLE images ADD COLUMN isPublic INTEGER DEFAULT 1`);
                }
            }
        });

        await runAsync(`CREATE TABLE IF NOT EXISTS dyeRecords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            imageId INTEGER,
            title TEXT,
            score INTEGER,
            comment TEXT,
            colors TEXT,
            draft INTEGER DEFAULT 0,
            collect INTEGER DEFAULT 0,
            views INTEGER DEFAULT 0,
            createTime TEXT
        )`);
        console.log('✅ dyeRecords 表已就绪');

        db.all(`PRAGMA table_info(dyeRecords)`, (err, rows) => {
            if (!err && rows) {
                if (!rows.find(col => col.name === 'title')) {
                    db.run(`ALTER TABLE dyeRecords ADD COLUMN title TEXT`);
                }
                if (!rows.find(col => col.name === 'views')) {
                    db.run(`ALTER TABLE dyeRecords ADD COLUMN views INTEGER DEFAULT 0`);
                }
            }
        });

        await runAsync(`CREATE TABLE IF NOT EXISTS blockWords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT UNIQUE
        )`);

        await runAsync(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fromUser TEXT,
            toUser TEXT,
            content TEXT,
            time TEXT,
            read INTEGER DEFAULT 0
        )`);

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
        const today = new Date().toISOString().split('T')[0];
        db.run(`INSERT INTO users (username, password, role, lastLoginDate) VALUES (?, ?, 'user', ?)`,
            [username, password, today], function (err) {
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

// ========== 用户资料更新 ==========
app.patch('/api/users/profile', (req, res) => {
    const { userId, intro, avatar } = req.body; // 前端可传递 userId
    if (!userId) return res.status(400).json({ success: false, msg: '缺少用户ID' });
    let updates = [];
    let params = [];
    if (intro !== undefined) { updates.push('intro = ?'); params.push(intro); }
    if (avatar !== undefined) { updates.push('avatar = ?'); params.push(avatar); }
    if (updates.length === 0) return res.json({ success: false, msg: '无更新内容' });
    params.push(userId);
    db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
        if (err) return res.status(500).json({ success: false, msg: err.message });
        res.json({ success: true });
    });
});

// 个人统计
app.get('/api/my-stats', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: '缺少userId' });
    db.get(`SELECT COUNT(*) AS workCount FROM dyeRecords WHERE userId = ? AND draft = 0`, [userId], (err, workRow) => {
        db.get(`SELECT IFNULL(SUM(score), 0) AS totalLikes FROM dyeRecords WHERE userId = ?`, [userId], (err, likesRow) => {
            db.get(`SELECT IFNULL(SUM(views), 0) AS totalViews FROM dyeRecords WHERE userId = ?`, [userId], (err, viewsRow) => {
                res.json({
                    workCount: workRow?.workCount || 0,
                    totalLikes: likesRow?.totalLikes || 0,
                    totalViews: viewsRow?.totalViews || 0
                });
            });
        });
    });
});

// 我的作品（GET）
app.get('/api/my-works', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: '缺少userId' });
    db.all(`SELECT * FROM dyeRecords WHERE userId = ? AND draft = 0 ORDER BY createTime DESC`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 我的草稿（GET）
app.get('/api/my-drafts', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: '缺少userId' });
    db.all(`SELECT * FROM dyeRecords WHERE userId = ? AND draft = 1 ORDER BY createTime DESC`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 获取单个作品
app.get('/api/works/:id', (req, res) => {
    db.get(`SELECT * FROM dyeRecords WHERE id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

// 增加浏览量
app.post('/api/works/:id/view', (req, res) => {
    db.run(`UPDATE dyeRecords SET views = views + 1 WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 重命名作品
app.patch('/api/works/:id', (req, res) => {
    const { title } = req.body;
    db.run(`UPDATE dyeRecords SET title = ? WHERE id = ?`, [title, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 删除作品
app.delete('/api/works/:id', (req, res) => {
    db.run(`DELETE FROM dyeRecords WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 删除草稿
app.delete('/api/drafts/:id', (req, res) => {
    db.run(`DELETE FROM dyeRecords WHERE id = ? AND draft = 1`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 保存作品/草稿
app.post('/api/works', (req, res) => {
    const { userId, imageId, title, imageData, isPublic } = req.body;
    const draft = isPublic ? 0 : 1;
    const time = new Date().toISOString();
    db.run(`INSERT INTO dyeRecords (userId, imageId, title, colors, draft, createTime) VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, imageId, title, imageData, draft, time], function (err) {
            if (err) return res.status(500).json({ success: false, msg: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

// ========== 用户上传图片 ==========
app.post('/api/upload-user-image', upload.single('image'), (req, res) => {
    const { userId, name, isPublic } = req.body;
    if (!userId) return res.status(400).json({ success: false, msg: '用户未登录' });
    if (!req.file) return res.status(400).json({ success: false, msg: '请选择图片' });

    const imageUrl = '/uploads/' + req.file.filename;
    const finalName = name || '我的上传';
    const finalIsPublic = isPublic === '1' || isPublic === 1 ? 1 : 0;  // 默认为私有

    db.run(
        `INSERT INTO images (name, path, uploaderId, isPublic) VALUES (?, ?, ?, ?)`,
        [finalName, imageUrl, userId, finalIsPublic],
        function (err) {
            if (err) {
                console.error('用户上传素材失败:', err);
                return res.status(500).json({ success: false, msg: '保存失败' });
            }
            res.json({ success: true, imageUrl, id: this.lastID });
        }
    );
});

app.get('/api/user-images', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: '缺少userId' });
    db.all(
        `SELECT id, name, path as imageUrl, isPublic FROM images WHERE uploaderId = ? ORDER BY id DESC`,
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// 公共图片（包括管理员上传和用户公开的）
app.get('/api/images', (req, res) => {
    db.all(
        `SELECT * FROM images WHERE isPublic = 1 ORDER BY id DESC`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const images = rows.map(row => ({
                id: row.id,
                name: row.name,
                imageUrl: row.path,        // 前端统一使用 imageUrl
                path: row.path,
                category: row.category || '',
                uploaderId: row.uploaderId,
                isPublic: row.isPublic
            }));
            res.json(images);
        }
    );
});
// ========== 评论和私信 ==========
app.get('/api/comments/received', (req, res) => {
    const userId = req.query.userId;
    db.all(`SELECT d.id, d.comment as content, d.createTime, u.username as fromUser, d.title as workTitle
            FROM dyeRecords d JOIN users u ON d.userId = u.id
            WHERE d.comment IS NOT NULL AND d.comment != '' AND d.imageId IN (SELECT id FROM images WHERE uploaderId = ?)
            ORDER BY d.createTime DESC`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ comments: rows });
    });
});

app.get('/api/likes/received', (req, res) => {
    const userId = req.query.userId;
    db.all(`SELECT d.id, d.score, d.createTime, u.username as fromUser, d.title as workTitle
            FROM dyeRecords d JOIN users u ON d.userId = u.id
            WHERE d.score > 0 AND d.imageId IN (SELECT id FROM images WHERE uploaderId = ?)
            ORDER BY d.createTime DESC`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ likes: rows });
    });
});

app.get('/api/messages/conversations', (req, res) => {
    const userId = req.query.userId;
    // 简化：返回最近联系人和最后一条消息
    db.all(`SELECT DISTINCT m.fromUser as withUser, 
                (SELECT content FROM messages WHERE (fromUser = m.fromUser AND toUser = ?) OR (toUser = m.fromUser AND fromUser = ?) ORDER BY time DESC LIMIT 1) as lastMessage,
                (SELECT time FROM messages WHERE (fromUser = m.fromUser AND toUser = ?) OR (toUser = m.fromUser AND fromUser = ?) ORDER BY time DESC LIMIT 1) as lastTime,
                (SELECT COUNT(*) FROM messages WHERE fromUser = m.fromUser AND toUser = ? AND read = 0) as unread
            FROM messages m WHERE m.toUser = ? OR m.fromUser = ?`,
        [userId, userId, userId, userId, userId, userId, userId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ conversations: rows });
        });
});

app.get('/api/messages/with/:otherUser', (req, res) => {
    const userId = req.query.userId;
    const other = req.params.otherUser;
    db.all(`SELECT * FROM messages WHERE (fromUser = ? AND toUser = ?) OR (fromUser = ? AND toUser = ?) ORDER BY time ASC`,
        [userId, other, other, userId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ messages: rows });
        });
});

app.post('/api/messages', (req, res) => {
    const { from, to, content } = req.body;
    const time = new Date().toISOString();
    db.run(`INSERT INTO messages (fromUser, toUser, content, time) VALUES (?, ?, ?, ?)`,
        [from, to, content, time], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

// ========== 管理员接口（已存在，保持不变） ==========
function adminAuth(req, res, next) { next(); }

app.get('/api/admin/stats', adminAuth, (req, res) => {
    const today = new Date().toISOString().split('T')[0];

    // 总用户数
    db.get(`SELECT COUNT(*) AS count FROM users`, (err, totalUsers) => {
        // 今日新增用户（通过 lastLoginDate 判断，因为注册时写入了当天日期）
        db.get(`SELECT COUNT(*) AS count FROM users WHERE lastLoginDate = ?`, [today], (err, newUsers) => {
            // 总作品数（draft = 0）
            db.get(`SELECT COUNT(*) AS count FROM dyeRecords WHERE draft = 0`, (err, totalWorks) => {
                // 今日新增作品
                db.get(`SELECT COUNT(*) AS count FROM dyeRecords WHERE draft = 0 AND DATE(createTime) = ?`, [today], (err, newWorks) => {
                    // 总点赞数
                    db.get(`SELECT IFNULL(SUM(score), 0) AS total FROM dyeRecords`, (err, totalLikes) => {
                        // 总染色次数（提交记录数）
                        db.get(`SELECT COUNT(*) AS count FROM dyeRecords`, (err, totalDye) => {
                            // 今日染色次数
                            db.get(`SELECT COUNT(*) AS count FROM dyeRecords WHERE DATE(createTime) = ?`, [today], (err, todayDye) => {
                                // 总浏览量（从 dyeRecords 累计）
                                db.get(`SELECT IFNULL(SUM(views), 0) AS totalViews FROM dyeRecords`, (err, totalViews) => {
                                    // 今日浏览量（简化：设为 0，可后续扩展）
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
});

app.get('/api/admin/works', adminAuth, (req, res) => {
    db.all(`SELECT dyeRecords.*, users.username AS authorName FROM dyeRecords LEFT JOIN users ON dyeRecords.userId = users.id WHERE draft = 0 ORDER BY createTime DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const works = rows.map(row => ({
            id: row.id,
            title: row.title || '未命名',
            img: row.colors || '',
            imageUrl: row.colors || '',
            author: { account: row.authorName || '未知' },
            authorName: row.authorName || '未知',
            likes: row.score || 0,
            views: row.views || 0,
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

app.get('/api/admin/materials', adminAuth, (req, res) => {
    db.all(
        `SELECT id, name, path, category FROM images WHERE uploaderId IS NULL ORDER BY id DESC`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const materials = rows.map(row => ({
                id: row.id,
                name: row.name,
                imageUrl: row.path,
                img: row.path,
                category: row.category || ''
            }));
            res.json({ materials });
        }
    );
});

app.post('/api/admin/materials', adminAuth, upload.single('image'), (req, res) => {
    const { name, category } = req.body;
    if (!req.file) return res.status(400).json({ success: false, msg: '缺少图片文件' });
    const imageUrl = '/uploads/' + req.file.filename;
    db.run(`INSERT INTO images (name, path, category, isPublic) VALUES (?, ?, ?, 1)`,
        [name || '未命名', imageUrl, category || ''], function (err) {
            if (err) return res.status(500).json({ success: false, msg: err.message });
            res.json({ success: true, id: this.lastID, imageUrl });
        });
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

app.get('/api/comments', adminAuth, (req, res) => {
    db.all(`SELECT dyeRecords.id, dyeRecords.comment AS content, dyeRecords.createTime, users.username, dyeRecords.imageId FROM dyeRecords LEFT JOIN users ON dyeRecords.userId = users.id WHERE dyeRecords.comment IS NOT NULL AND dyeRecords.comment != '' ORDER BY dyeRecords.createTime DESC`, (err, rows) => {
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

app.get('/api/rank', (req, res) => {
    db.all(`SELECT dyeRecords.*, users.username FROM dyeRecords LEFT JOIN users ON dyeRecords.userId = users.id WHERE draft = 0 ORDER BY score DESC LIMIT 50`, (err, rows) => {
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