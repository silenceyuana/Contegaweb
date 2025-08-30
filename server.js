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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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