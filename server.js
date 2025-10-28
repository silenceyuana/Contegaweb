// =================================================================
// server.js - v8.5 (新增特殊权限检查接口)
// =================================================================
// 关键特性:
// 1. 完整的玩家与管理员认证流程。
// 2. 使用 Resend API 实现两步注册邮件验证。
// 3. 新增 /api/player/check-permission 接口，用于检查特定权限。
// 4. 安全的工单、封禁墙和赞助名单 API。
// 5. 为 Vercel 无服务器环境正确配置。
// =================================================================

// --- 1. 引入依赖 ---
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');

// --- 2. Supabase & 环境变量 ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const jwtSecret = process.env.JWT_SECRET;
const resendApiKey = process.env.RESEND_API_KEY;

// 关键检查
if (!supabaseUrl || !supabaseAnonKey || !jwtSecret || !resendApiKey) {
    console.error("严重错误：缺少一个或多个关键环境变量。");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- 3. Resend 初始化 ---
const resend = new Resend(resendApiKey);

// --- 4. Express 应用初始化 ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- 5. 中间件 ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- 6. JWT 验证中间件 ---
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(403).json({ error: '没有提供Token，禁止访问' });

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) return res.status(401).json({ error: 'Token无效或已过期' });
        req.user = user;
        next();
    });
};

// --- 7. 页面路由 ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));

// --- 8. 公共 API 路由 (无需登录) ---
app.get('/api/rules', async (req, res) => { try { const { data, error } = await supabase.from('server_rules').select('*').order('id'); if (error) throw error; res.json(data); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/commands', async (req, res) => { try { const { data, error } = await supabase.from('server_commands').select('*').order('id'); if (error) throw error; res.json(data); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/bans', async (req, res) => { try { const { data, error } = await supabase.from('banned_players').select('*').order('ban_date', { ascending: false }); if (error) throw error; res.json(data); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/sponsors', async (req, res) => { try { const { data, error } = await supabase.from('sponsors').select('*').order('created_at', { ascending: false }); if (error) throw error; res.json(data); } catch (error) { res.status(500).json({ error: error.message }); } });

// --- 9. 认证 API ---

// 步骤 1: 注册
app.post('/api/register', async (req, res) => {
    const { player_name, email, password } = req.body;
    if (!player_name || !email || !password) {
        return res.status(400).json({ error: '玩家名、邮箱和密码不能为空。' });
    }
    try {
        const { data: existingPlayer } = await supabase.from('players').select('email').eq('email', email).single();
        if (existingPlayer) {
            return res.status(409).json({ error: '该邮箱已被注册。' });
        }
        const password_hash = await bcrypt.hash(password, 10);
        const verification_code = Math.floor(100000 + Math.random() * 900000).toString();
        await supabase.from('pending_verifications').upsert({ email, player_name, password_hash, verification_code }, { onConflict: 'email' });
        const emailHtml = `...`; // 邮件模板内容
        const { data, error } = await resend.emails.send({
            from: 'Eulark 服务器 <message@betteryuan.cn>',
            to: email,
            subject: '您的 Eulark 服务器验证码',
            html: emailHtml,
        });
        if (error) { throw error; }
        res.status(200).json({ message: '验证邮件已发送，请检查您的收件箱。' });
    } catch (err) {
        console.error('注册错误:', err); 
        res.status(500).json({ error: '服务器内部错误，发送邮件失败。' });
    }
});

// 步骤 2: 验证
app.post('/api/verify-email', async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
        return res.status(400).json({ error: '邮箱和验证码不能为空。' });
    }
    try {
        const { data: pending, error: findError } = await supabase.from('pending_verifications').select('*').eq('email', email).single();
        if (findError || !pending) {
            return res.status(404).json({ error: '验证请求不存在，请重新注册。' });
        }
        if (new Date(pending.expires_at) < new Date()) {
            await supabase.from('pending_verifications').delete().eq('email', email);
            return res.status(400).json({ error: '验证码已过期，请重新注册。' });
        }
        if (pending.verification_code !== code) {
            return res.status(400).json({ error: '验证码无效。' });
        }
        const { data: newPlayer, error: insertError } = await supabase.from('players').insert({
            player_name: pending.player_name,
            email: pending.email,
            password_hash: pending.password_hash,
        }).select().single();
        if (insertError) {
            if (insertError.code === '23505') {
                 return res.status(409).json({ error: '玩家名或邮箱已被注册' });
            }
            throw insertError;
        }
        await supabase.from('pending_verifications').delete().eq('email', email);
        res.status(201).json({ message: '注册成功！', player: { id: newPlayer.id, player_name: newPlayer.player_name } });
    } catch (err) {
        console.error('验证错误:', err);
        res.status(500).json({ error: '服务器内部错误，验证失败。' });
    }
});

// 登录
app.post('/api/login', async (req, res) => { 
    const { identifier, password } = req.body; 
    if (!identifier || !password) return res.status(400).json({ error: '玩家名/邮箱和密码不能为空' }); 
    try { 
        const { data: player, error } = await supabase.from('players').select('id, player_name, password_hash').or(`player_name.eq.${identifier},email.eq.${identifier}`).single(); 
        if (error || !player) return res.status(401).json({ error: '凭据无效' }); 
        const isMatch = await bcrypt.compare(password, player.password_hash); 
        if (!isMatch) return res.status(401).json({ error: '凭据无效' }); 
        const payload = { id: player.id, player_name: player.player_name }; 
        const token = jwt.sign(payload, jwtSecret, { expiresIn: '1d' }); 
        res.json({ message: '登录成功', token, user: { id: player.id, username: player.player_name } }); 
    } catch (err) { 
        console.error('登录错误:', err); 
        res.status(500).json({ error: '服务器内部错误' }); 
    } 
});

// 管理员登录
app.post('/api/admin/login', async (req, res) => { 
    const { username, password } = req.body; 
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' }); 
    try { 
        const { data: user, error } = await supabase.from('users').select('id, username, password_hash').eq('username', username).single(); 
        if (error || !user) return res.status(401).json({ error: '用户名或密码错误' }); 
        const isMatch = await bcrypt.compare(password, user.password_hash); 
        if (!isMatch) return res.status(401).json({ error: '用户名或密码错误' }); 
        const payload = { id: user.id, username: user.username, isAdmin: true }; 
        const token = jwt.sign(payload, jwtSecret, { expiresIn: '8h' }); 
        res.json({ message: '登录成功', token }); 
    } catch (err) { 
        console.error('管理员登录错误:', err); 
        res.status(500).json({ error: '服务器内部错误' }); 
    } 
});

// --- 10. 受保护的玩家 API ---
app.post('/api/contact', verifyToken, async (req, res) => { 
    const { message } = req.body; 
    const { id: playerId, player_name } = req.user; 
    if (!message) return res.status(400).json({ error: '消息内容不能为空' }); 
    try { 
        const { data: playerData, error: playerError } = await supabase.from('players').select('email').eq('id', playerId).single(); 
        if (playerError || !playerData) throw new Error('无法找到关联的用户信息'); 
        const { data, error } = await supabase.from('contact_messages').insert([{ player_name, email: playerData.email, message }]).select(); 
        if (error) throw error; 
        res.status(201).json({ message: '消息发送成功', data: data[0] }); 
    } catch (error) { 
        console.error('提交工单错误:', error); 
        res.status(500).json({ error: '服务器内部错误，提交失败' }); 
    } 
});

app.get('/api/player/check-permission', verifyToken, async (req, res) => {
    const { id: playerId } = req.user;
    try {
        const { data, error } = await supabase
            .from('special_permissions')
            .select('player_id')
            .eq('player_id', playerId)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        const hasPermission = !!data;
        res.json({ hasPermission });

    } catch (error) {
        console.error('检查权限时发生错误:', error);
        res.status(500).json({ error: '无法检查用户权限' });
    }
});

// --- 11. 受保护的管理员 API ---
app.get('/api/admin/messages', verifyToken, async (req, res) => { try { const { data, error } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false }); if (error) throw error; res.json(data); } catch (error) { res.status(500).json({ error: error.message }); } });
app.delete('/api/admin/messages/:id', verifyToken, async (req, res) => { const { id } = req.params; try { await supabase.from('contact_messages').delete().eq('id', id); res.status(200).json({ message: '工单删除成功' }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/admin/rules', verifyToken, async (req, res) => { const { category, description } = req.body; if (!category || !description) return res.status(400).json({ error: '规则类别和描述不能为空' }); try { const { data, error } = await supabase.from('server_rules').insert([{ category, description }]).select().single(); if (error) throw error; res.status(201).json(data); } catch (error) { res.status(500).json({ error: error.message }); } });
app.delete('/api/admin/rules/:id', verifyToken, async (req, res) => { const { id } = req.params; try { await supabase.from('server_rules').delete().eq('id', id); res.status(200).json({ message: '规则删除成功' }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/admin/bans', verifyToken, async (req, res) => { const { player_name, reason, duration, ban_date } = req.body; if (!player_name || !reason || !duration || !ban_date) return res.status(400).json({ error: '所有字段均为必填项' }); try { const { data, error } = await supabase.from('banned_players').insert([{ player_name, reason, duration, ban_date }]).select().single(); if (error) throw error; res.status(201).json(data); } catch (error) { res.status(500).json({ error: error.message }); } });
app.delete('/api/admin/bans/:id', verifyToken, async (req, res) => { const { id } = req.params; try { await supabase.from('banned_players').delete().eq('id', id); res.status(200).json({ message: '封禁记录删除成功' }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/admin/sponsors', verifyToken, async (req, res) => { const { name, amount } = req.body; if (!name || !amount) return res.status(400).json({ error: '名称和金额不能为空' }); try { const { data, error } = await supabase.from('sponsors').insert([{ name, amount }]).select().single(); if (error) throw error; res.status(201).json(data); } catch (error) { res.status(500).json({ error: error.message }); } });
app.delete('/api/admin/sponsors/:id', verifyToken, async (req, res) => { const { id } = req.params; try { await supabase.from('sponsors').delete().eq('id', id); res.status(200).json({ message: '赞助记录删除成功' }); } catch (error) { res.status(500).json({ error: error.message }); } });

// --- 12. 启动与导出 ---
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`开发服务器已启动，访问 http://localhost:${PORT}`);
    });
}
module.exports = app;