// =================================================================
// server.js - 最终安全部署版本
// 特性: Express, Supabase, Public文件夹, 安全Token认证
// =================================================================

// --- 1. 引入依赖 ---
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const mime = require('mime-types');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- 2. Supabase 初始化 和 环境变量 ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const jwtSecret = process.env.JWT_SECRET; // 用于签发和验证Token的密钥

// 关键检查：确保所有必需的环境变量都已设置
if (!supabaseUrl || !supabaseAnonKey || !jwtSecret) {
    console.error("严重错误：缺少一个或多个关键环境变量。");
    console.error("请确保 SUPABASE_URL, SUPABASE_ANON_KEY, 和 JWT_SECRET 已正确设置。");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- 3. Express 应用初始化 ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- 4. 中间件配置 ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));


// --- 5. 安全中间件 (Token 验证) ---
// 这个中间件将用于保护所有需要管理员权限的API路由
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // 格式: "Bearer TOKEN"

    if (!token) {
        return res.status(403).json({ error: '没有提供Token，禁止访问' });
    }

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            // 如果Token无效（比如被篡改或已过期）
            return res.status(401).json({ error: 'Token无效或已过期' });
        }
        req.user = user; // 将解码后的用户信息附加到请求对象上
        next(); // Token 验证通过，继续执行请求
    });
};


// --- 6. 页面路由 ---

// 当用户访问根目录时，发送 public 文件夹内的 index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 当用户访问 /admin 时，发送 public 文件夹内的 admin-login.html
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});
// --- 7. 公共 API 路由 ---
// 这些API不需要登录即可访问

// 获取所有服务器规则
app.get('/api/rules', async (req, res) => {
    try {
        const { data, error } = await supabase.from('server_rules').select('*').order('id');
        if (error) throw error;
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 获取所有服务器指令
app.get('/api/commands', async (req, res) => {
    try {
        const { data, error } = await supabase.from('server_commands').select('*').order('id');
        if (error) throw error;
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 提交联系消息 (工单)
app.post('/api/contact', async (req, res) => {
    const { player_name, email, message } = req.body;
    try {
        const { data, error } = await supabase.from('contact_messages').insert([{ player_name, email, message }]).select();
        if (error) throw error;
        res.status(201).json({ message: '消息发送成功', data: data[0] });
    } catch (error) { res.status(500).json({ error: error.message }); }
});


// --- 8. 认证 API ---
// 用于处理管理员登录请求
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    try {
        const { data: user, error } = await supabase.from('users').select('id, username, password_hash').eq('username', username).single();
        if (error || !user) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        const payload = { id: user.id, username: user.username };
        const token = jwt.sign(payload, jwtSecret, { expiresIn: '8h' }); // Token 有效期8小时

        res.json({ message: '登录成功', token: token });
    } catch (err) {
        console.error('登录时发生服务器错误:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
// =================================================================
// server.js - 在 --- 8. 认证 API --- 部分的末尾添加以下代码
// =================================================================

// --- 玩家注册 API ---
app.post('/api/register', async (req, res) => {
    console.log('收到 /api/register 请求。请求体 (req.body) 是:', req.body);
    const { player_name, email, password } = req.body;

    // 1. 验证输入
    if (!player_name || !email || !password) {
        return res.status(400).json({ error: '玩家名、邮箱和密码不能为空' });
    }

    try {
        // 2. 加密密码
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // 3. 将新玩家插入数据库
        const { data, error } = await supabase
            .from('players')
            .insert([{ player_name, email, password_hash }])
            .select()
            .single();

        // 4. 处理错误 (例如，用户名或邮箱已存在)
        if (error) {
            if (error.code === '23505') { // PostgreSQL unique violation code
                return res.status(409).json({ error: '玩家名或邮箱已被注册' });
            }
            throw error;
        }

        // 5. 注册成功
        res.status(201).json({ message: '注册成功！', player: { id: data.id, player_name: data.player_name } });

    } catch (err) {
        console.error('注册时发生服务器错误:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});


// --- 玩家登录 API ---
app.post('/api/login', async (req, res) => {
    // 'identifier' 可以是玩家名或邮箱
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ error: '玩家名/邮箱和密码不能为空' });
    }

    try {
        // 1. 在数据库中查找玩家 (通过玩家名或邮箱)
        const { data: player, error } = await supabase
            .from('players')
            .select('id, player_name, password_hash')
            .or(`player_name.eq.${identifier},email.eq.${identifier}`)
            .single();

        if (error || !player) {
            // 为安全起见，不明确指出是用户名还是密码错误
            return res.status(401).json({ error: '凭据无效' });
        }

        // 2. 比较密码
        const isMatch = await bcrypt.compare(password, player.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: '凭据无效' });
        }

        // 3. 登录成功，生成 JWT Token
        const payload = { id: player.id, player_name: player.player_name };
        const token = jwt.sign(payload, jwtSecret, { expiresIn: '1d' }); // Token 有效期1天

        res.json({ message: '登录成功', token: token });

    } catch (err) {
        console.error('登录时发生服务器错误:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});


// --- 9. 受保护的管理员 API 路由 ---
// 在每个需要管理员权限的 API 前面，加上 verifyToken 中间件进行保护

// 获取所有联系消息 (工单)
app.get('/api/admin/messages', verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 更新工单状态 (例如标记为已读)
app.patch('/api/admin/messages/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { is_read, status } = req.body;
    const updateData = {};
    if (typeof is_read !== 'undefined') updateData.is_read = is_read;
    if (status) updateData.status = status;

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: '没有提供要更新的字段' });
    }

    try {
        const { data, error } = await supabase.from('contact_messages').update(updateData).eq('id', id).select();
        if (error) throw error;
        res.json({ message: '工单更新成功', data: data[0] });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 删除工单
app.delete('/api/admin/messages/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const { error } = await supabase.from('contact_messages').delete().eq('id', id);
        if (error) throw error;
        res.status(200).json({ message: '工单删除成功' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});


// --- 10. 启动与导出 ---
// 仅在本地开发环境 (非 Vercel 环境) 启动服务器
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`本地开发服务器已启动，访问 http://localhost:${PORT}`);
    });
}

// 导出 Express app 实例，供 Vercel 的无服务器环境调用
module.exports = app;