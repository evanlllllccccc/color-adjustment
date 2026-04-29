const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
// 先定义一个“永久仓库”的位置
const persisDir = process.env.NODE_ENV === 'production'
    ? '/app/data'                    // ← Railway 上：用 Volume 挂载的永久目录
    : path.join(__dirname, 'dataa');   // ← 你自己电脑上：项目里的 data 文件夹

// 数据库就放在永久仓库的 sqlite 子文件夹里
const dbPath = path.join(persisDir, 'sqlite', 'database.db');

// 上传的文件就放在永久仓库的 uploads 子文件夹里
const uploadDir = path.join(persisDir, 'uploads');
// 确保上传目录存在
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 创建上传目录:', uploadDir);
}
app.use('/uploads', express.static(uploadDir));


// ====================== 跨域配置 ======================
// ====================== 跨域配置 ======================
// 临时调试：允许所有来源
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));


app.use('/uploads', express.static(uploadDir));

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


console.log('📁 数据库路径:', dbPath);

// 确保数据库目录存在
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('📁 创建数据库目录:', dbDir);
}

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
    console.log('收到注册请求:', req.body);  // 调试日志

    const { username, password } = req.body;
    if (!username || !password) {
        console.log('缺少参数');
        return res.status(400).json({ success: false, msg: '账号和密码不能为空' });
    }

    console.log('查询用户:', username);
    db.get(`SELECT id FROM users WHERE username = ?`, [username], (err, row) => {
        if (err) {
            console.error('查询错误:', err);  // 调试日志
            return res.status(500).json({ success: false, msg: '服务器错误' });
        }
        if (row) {
            console.log('用户已存在');
            return res.json({ success: false, msg: '账号已存在' });
        }

        const today = new Date().toISOString().split('T')[0];
        console.log('准备插入:', { username, today });

        db.run(`INSERT INTO users (username, password, role, lastLoginDate) VALUES (?, ?, 'user', ?)`,
            [username, password, today], function (err) {
                if (err) {
                    console.error('插入错误:', err);  // 调试日志
                    return res.status(500).json({ success: false, msg: '注册失败' });
                }
                console.log('注册成功, ID:', this.lastID);
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

app.patch('/api/users/profile', (req, res) => {
    const { userId, intro, avatar } = req.body;
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

//我的作品（GET）
app.get('/api/my-works', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: '缺少userId' });

    db.all(
        `SELECT 
            id, title, colors AS img, views, 
            IFNULL(score, 0) AS likes, 
            createTime AS time,
            draft
        FROM dyeRecords 
        WHERE userId = ? AND draft = 0 
        ORDER BY createTime DESC`,
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/api/my-drafts', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: '缺少userId' });
    db.all(
        `SELECT id, title, colors, createTime FROM dyeRecords WHERE userId = ? AND draft = 1 ORDER BY createTime DESC`,
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/api/works/:id', (req, res) => {
    db.get(`SELECT * FROM dyeRecords WHERE id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

app.post('/api/works/:id/view', (req, res) => {
    db.run(`UPDATE dyeRecords SET views = views + 1 WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.patch('/api/works/:id', (req, res) => {
    const { title } = req.body;
    db.run(`UPDATE dyeRecords SET title = ? WHERE id = ?`, [title, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/works/:id', (req, res) => {
    db.run(`DELETE FROM dyeRecords WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/drafts/:id', (req, res) => {
    db.run(`DELETE FROM dyeRecords WHERE id = ? AND draft = 1`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/works', (req, res) => {
    console.log('收到保存请求:', req.body);  // 调试日志

    const { userId, imageId, title, imageData, isPublic } = req.body;

    // 验证必填字段
    if (!userId) return res.status(400).json({ success: false, msg: '缺少userId' });
    if (!imageData) return res.status(400).json({ success: false, msg: '缺少图片数据' });

    const draft = isPublic ? 0 : 1;
    const time = new Date().toISOString();

    console.log('准备插入:', { userId, title, draft, hasImage: !!imageData });  // 调试

    db.run(`INSERT INTO dyeRecords (userId, imageId, title, colors, draft, createTime) VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, imageId || null, title, imageData, draft, time],
        function (err) {
            if (err) {
                console.error('插入失败:', err);  // 调试日志
                return res.status(500).json({ success: false, msg: err.message });
            }
            console.log('插入成功, ID:', this.lastID);  // 调试日志
            res.json({ success: true, id: this.lastID });
        }
    );
});

// ========== 用户上传图片 ==========
app.post('/api/upload-user-image', upload.single('image'), (req, res) => {
    const { userId, name, isPublic } = req.body;
    if (!userId) return res.status(400).json({ success: false, msg: '用户未登录' });
    if (!req.file) return res.status(400).json({ success: false, msg: '请选择图片' });

    const imageUrl = '/uploads/' + req.file.filename;
    const finalName = name || '我的上传';
    const finalIsPublic = isPublic === '1' || isPublic === 1 ? 1 : 0;

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

app.get('/api/images', (req, res) => {
    db.all(
        `SELECT * FROM images WHERE isPublic = 1 ORDER BY id DESC`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const images = rows.map(row => ({
                id: row.id,
                name: row.name,
                imageUrl: row.path,
                path: row.path,
                category: row.category || '',
                uploaderId: row.uploaderId,
                isPublic: row.isPublic
            }));
            res.json(images);
        }
    );
});

// 获取所有公开作品（供作品库、排行榜使用）
app.get('/api/works/public', (req, res) => {
    console.log('📢 /api/works/public 被调用了');

    const sql = `
        SELECT 
            dyeRecords.id,
            dyeRecords.title,
            dyeRecords.colors AS imageUrl,
            dyeRecords.views,
            IFNULL(dyeRecords.score, 0) AS likes,
            dyeRecords.createTime,
            users.username AS authorName,
            users.avatar AS authorAvatar
        FROM dyeRecords 
        LEFT JOIN users ON dyeRecords.userId = users.id 
        WHERE dyeRecords.draft = 0 
        ORDER BY dyeRecords.createTime DESC
    `;

    db.all(sql, (err, rows) => {
        if (err) {
            console.error('❌ 获取公开作品失败:', err.message);
            // 即使出错也返回一个标准结构
            return res.json({ works: [], error: err.message });
        }

        console.log(`✅ 查询到 ${rows?.length || 0} 件公开作品`);

        const works = (rows || []).map(row => ({
            id: row.id,
            title: row.title || '未命名作品',
            imageUrl: row.imageUrl,
            img: row.imageUrl,
            authorName: row.authorName || '匿名',
            author: {
                account: row.authorName || '匿名',
                avatar: row.authorAvatar
            },
            views: row.views || 0,
            likes: row.likes || 0,
            time: row.createTime,
            comments: []
        }));

        res.json({ works });
    });
});

// ========== 点赞接口（新增） ==========
app.post('/api/works/:id/like', (req, res) => {
    const workId = req.params.id;
    db.run(`UPDATE dyeRecords SET score = score + 1 WHERE id = ?`, [workId], function (err) {
        if (err) return res.status(500).json({ success: false, msg: err.message });
        res.json({ success: true });
    });
});

// ========== 用户发表评论（新增） ==========
function checkBlockWord(comment, callback) {
    db.all(`SELECT word FROM blockWords`, (err, words) => {
        if (err) return callback(false);
        const hasBlock = words.some(item => comment.includes(item.word));
        callback(hasBlock);
    });
}

app.post('/api/comments', (req, res) => {
    const { userId, workId, content } = req.body;
    if (!userId || !workId || !content) {
        return res.status(400).json({ success: false, msg: '参数不完整' });
    }
    checkBlockWord(content, (hasBlock) => {
        if (hasBlock) return res.json({ success: false, msg: '包含不当语言' });
        db.run(`UPDATE dyeRecords SET comment = ? WHERE id = ?`, [content, workId], function (err) {
            if (err) return res.status(500).json({ success: false, msg: err.message });
            res.json({ success: true });
        });
    });
});


// 获取作品（排行榜调用）
// 获取作品（统一接口）
app.get('/api/works', (req, res) => {
    db.all(`
        SELECT 
            dyeRecords.id,
            dyeRecords.title,
            dyeRecords.colors AS img,
            dyeRecords.colors AS imageUrl,
            dyeRecords.views,
            IFNULL(dyeRecords.score, 0) AS likes,
            dyeRecords.createTime AS time,
            users.username AS author,
            users.username AS authorName,
            users.avatar AS authorAvatar
        FROM dyeRecords 
        LEFT JOIN users ON dyeRecords.userId = users.id 
        WHERE dyeRecords.draft = 0 
        ORDER BY dyeRecords.createTime DESC
    `, (err, rows) => {
        if (err) {
            console.error('获取作品失败:', err);
            return res.json([]);  // 出错返回空数组
        }
        res.json(rows);  // 直接返回数组
    });
});

// ========== 管理员接口 ==========
function adminAuth(req, res, next) { next(); }

app.get('/api/admin/stats', adminAuth, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    db.get(`SELECT COUNT(*) AS count FROM users`, (err, totalUsers) => {
        db.get(`SELECT COUNT(*) AS count FROM users WHERE lastLoginDate = ?`, [today], (err, newUsers) => {
            db.get(`SELECT COUNT(*) AS count FROM dyeRecords WHERE draft = 0`, (err, totalWorks) => {
                db.get(`SELECT COUNT(*) AS count FROM dyeRecords WHERE draft = 0 AND DATE(createTime) = ?`, [today], (err, newWorks) => {
                    db.get(`SELECT IFNULL(SUM(score), 0) AS total FROM dyeRecords`, (err, totalLikes) => {
                        db.get(`SELECT COUNT(*) AS count FROM dyeRecords`, (err, totalDye) => {
                            db.get(`SELECT COUNT(*) AS count FROM dyeRecords WHERE DATE(createTime) = ?`, [today], (err, todayDye) => {
                                db.get(`SELECT IFNULL(SUM(views), 0) AS totalViews FROM dyeRecords`, (err, totalViews) => {
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
    db.all(`SELECT id, name, path, category FROM images WHERE uploaderId IS NULL ORDER BY id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const materials = rows.map(row => ({
            id: row.id,
            name: row.name,
            imageUrl: row.path,
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
    db.all(`
        SELECT dyeRecords.*, users.username AS author 
        FROM dyeRecords 
        LEFT JOIN users ON dyeRecords.userId = users.id 
        WHERE draft = 0 
        ORDER BY score DESC 
        LIMIT 50
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const works = rows.map(row => ({
            id: row.id,
            title: row.title || '未命名',
            img: row.colors || '',
            author: row.author || '匿名',
            likes: row.score || 0,
            views: row.views || 0,
            time: row.createTime
        }));
        res.json(works);
    });
});

// 调试接口：查看数据库状态
app.get('/api/debug/db', (req, res) => {
    db.all(`SELECT name FROM sqlite_master WHERE type='table'`, [], (err, tables) => {
        if (err) return res.json({ error: err.message });

        const result = { tables: [] };
        let pending = tables.length;

        if (pending === 0) return res.json(result);

        tables.forEach(table => {
            db.get(`SELECT COUNT(*) as count FROM ${table.name}`, [], (err, row) => {
                result.tables.push({
                    name: table.name,
                    count: err ? 0 : row.count
                });
                pending--;
                if (pending === 0) res.json(result);
            });
        });
    });
});

// 调试接口：查看 dyeRecords 数据
app.get('/api/debug/works', (req, res) => {
    db.all(`SELECT id, title, draft, userId, colors IS NOT NULL as has_colors, createTime FROM dyeRecords LIMIT 10`, [], (err, rows) => {
        if (err) return res.json({ error: err.message });
        res.json({ count: rows.length, rows });
    });
});

// ========== 用户头像上传（新增） ==========
app.post('/api/user/avatar', upload.single('avatar'), (req, res) => {
    const { userId } = req.body;
    if (!req.file) return res.status(400).json({ success: false, msg: '请选择图片' });

    const avatarUrl = '/uploads/' + req.file.filename;

    db.run(`UPDATE users SET avatar = ? WHERE id = ?`, [avatarUrl, userId], function (err) {
        if (err) return res.status(500).json({ success: false, msg: err.message });
        res.json({ success: true, url: avatarUrl });
    });
});

// ========== 收到的评论（新增） ==========
app.get('/api/comments/received', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: '缺少userId' });

    db.all(`
        SELECT 
            dyeRecords.id,
            dyeRecords.comment AS content,
            dyeRecords.createTime AS createdAt,
            users.username AS fromUser,
            dyeRecords.title AS workTitle
        FROM dyeRecords 
        LEFT JOIN users ON dyeRecords.userId = users.id
        WHERE dyeRecords.userId = ? AND dyeRecords.comment IS NOT NULL AND dyeRecords.comment != ''
        ORDER BY dyeRecords.createTime DESC
    `, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// ========== 收到的点赞（新增） ==========
app.get('/api/likes/received', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: '缺少userId' });

    // 由于你没有单独的点赞记录表，这里返回空数组
    // 如需实现，需要创建 likes 表记录谁点赞了谁
    res.json([]);
});

// ========== 私信会话列表（新增） ==========
app.get('/api/messages/conversations', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: '缺少userId' });

    db.all(`
        SELECT 
            CASE 
                WHEN fromUser = ? THEN toUser 
                ELSE fromUser 
            END as withUser,
            MAX(time) as lastTime,
            content as lastMessage,
            SUM(CASE WHEN read = 0 AND toUser = ? THEN 1 ELSE 0 END) as unread
        FROM messages 
        WHERE fromUser = ? OR toUser = ?
        GROUP BY withUser
        ORDER BY lastTime DESC
    `, [userId, userId, userId, userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// ========== 获取与某用户的私信（新增） ==========
app.get('/api/messages/with/:user', (req, res) => {
    const currentUser = req.query.userId;
    const chatUser = req.params.user;
    if (!currentUser) return res.status(400).json({ error: '缺少userId' });

    db.all(`
        SELECT 
            fromUser as from,
            content,
            time as createdAt
        FROM messages 
        WHERE (fromUser = ? AND toUser = ?) OR (fromUser = ? AND toUser = ?)
        ORDER BY time ASC
    `, [currentUser, chatUser, chatUser, currentUser], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// ========== 发送私信（新增） ==========
app.post('/api/messages', (req, res) => {
    const { from, to, content } = req.body;
    if (!from || !to || !content) {
        return res.status(400).json({ success: false, msg: '参数不完整' });
    }

    const time = new Date().toISOString();
    db.run(`INSERT INTO messages (fromUser, toUser, content, time) VALUES (?, ?, ?, ?)`,
        [from, to, content, time], function (err) {
            if (err) return res.status(500).json({ success: false, msg: err.message });
            res.json({ success: true, id: this.lastID });
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