// =================================================================
// server.js - v9.6 (使用 RPC 函数替代 Service Key - 完整最终版)
// =================================================================
// 关键特性:
// 1. (安全) 客户端初始化使用低权限的 anon key。
// 2. (安全) 管理员授权/取消授权操作通过调用数据库 RPC 函数完成，不再需要 service_role 密钥。
// 3. 完整的用户注册、邮件验证、登录、密码重置流程。
// 4. 安全的用户权限检查与管理员用户管理功能。
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
const crypto = require('crypto');

// --- 2. Supabase & 环境变量 ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const jwtSecret = process.env.JWT_SECRET;
const resendApiKey = process.env.RESEND_API_KEY;
const baseUrl = process.env.BASE_URL;
const buildingListUrl = process.env.BUILDING_LIST_URL;

// 关键检查
if (!supabaseUrl || !supabaseAnonKey || !jwtSecret || !resendApiKey || !baseUrl || !buildingListUrl) {
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
app.post('/api/register', async (req, res) => {
    const { player_name, email, password, confirmPassword } = req.body;
    if (!player_name || !email || !password || !confirmPassword) { return res.status(400).json({ error: '所有字段均为必填项。' }); }
    if (password !== confirmPassword) { return res.status(400).json({ error: '两次输入的密码不一致。' }); }
    try {
        const { data: existingPlayer } = await supabase.from('players').select('email').eq('email', email).single();
        if (existingPlayer) { return res.status(409).json({ error: '该邮箱已被注册。' }); }
        const password_hash = await bcrypt.hash(password, 10);
        const verification_code = Math.floor(100000 + Math.random() * 900000).toString();
        await supabase.from('pending_verifications').upsert({ email, player_name, password_hash, verification_code }, { onConflict: 'email' });
        
        const emailHtml = `
            <div style="font-family: Arial, 'Microsoft YaHei', sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="color: #3F51B5; font-size: 26px;">Eulark 生电服务器</h1>
                </div>
                <h2 style="color: #333; font-size: 20px;">你好,</h2>
                <p style="color: #555; font-size: 16px; line-height: 1.6;">输入此代码，即可完成您的账户注册：</p>
                <div style="text-align: center; margin: 30px 0;">
                    <p style="font-size: 36px; font-weight: bold; letter-spacing: 5px; color: #3F51B5; background-color: #f5f5f5; padding: 15px; border-radius: 5px; display: inline-block;">
                        ${verification_code}
                    </p>
                </div>
                <p style="color: #555; font-size: 14px;">此代码的有效时间为 20 分钟，并且仅可使用一次。输入此代码时，您将同时确认与账户关联的邮箱地址。</p>
                <p style="color: #777; font-size: 12px; margin-top: 30px;">如果您并未尝试注册，则可放心忽略此邮件。</p>
                <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;" />
                <div style="text-align: right; color: #555; font-size: 14px;">
                    <p>此致</p>
                    <p><strong>Eulark 服务器团队</strong></p>
                </div>
            </div>
        `;

        const { error } = await resend.emails.send({
            from: 'Eulark 服务器 <message@betetryuan.cn>',
            to: email,
            subject: '您的 Eulark 服务器验证码',
            html: emailHtml,
        });
        if (error) { throw error; }
        res.status(200).json({ message: '验证邮件已发送，请检查您的收件箱。' });
    } catch (err) { console.error('注册错误:', err); res.status(500).json({ error: '服务器内部错误，发送邮件失败。' }); }
});

app.post('/api/verify-email', async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) { return res.status(400).json({ error: '邮箱和验证码不能为空。' }); }
    try {
        const { data: pending, error: findError } = await supabase.from('pending_verifications').select('*').eq('email', email).single();
        if (findError || !pending) { return res.status(404).json({ error: '验证请求不存在，请重新注册。' }); }
        if (new Date(pending.expires_at) < new Date()) {
            await supabase.from('pending_verifications').delete().eq('email', email);
            return res.status(400).json({ error: '验证码已过期，请重新注册。' });
        }
        if (pending.verification_code !== code) { return res.status(400).json({ error: '验证码无效。' }); }
        const { data: newPlayer, error: insertError } = await supabase.from('players').insert({ player_name: pending.player_name, email: pending.email, password_hash: pending.password_hash }).select().single();
        if (insertError) {
            if (insertError.code === '23505') { return res.status(409).json({ error: '玩家名或邮箱已被注册' }); }
            throw insertError;
        }
        await supabase.from('pending_verifications').delete().eq('email', email);
        res.status(201).json({ message: '注册成功！', player: { id: newPlayer.id, player_name: newPlayer.player_name } });
    } catch (err) { console.error('验证错误:', err); res.status(500).json({ error: '服务器内部错误，验证失败。' }); }
});

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
    } catch (err) { console.error('登录错误:', err); res.status(500).json({ error: '服务器内部错误' }); } 
});

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
    } catch (err) { console.error('管理员登录错误:', err); res.status(500).json({ error: '服务器内部错误' }); } 
});

app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) { return res.status(400).json({ error: '邮箱不能为空。' }); }
    try {
        const { data: player, error: playerError } = await supabase.from('players').select('id, player_name').eq('email', email).single();
        if (playerError || !player) { return res.status(200).json({ message: '如果该邮箱已注册，您将会收到一封密码重置邮件。' }); }
        const token = crypto.randomBytes(32).toString('hex');
        await supabase.from('password_resets').upsert({ email: email, token: token }, { onConflict: 'email' });
        const resetLink = `${baseUrl}/reset-password.html?token=${token}`;
        
        const emailHtml = `
            <div style="font-family: Arial, 'Microsoft YaHei', sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h1 style="color: #3F51B5;">Eulark 服务器 - 密码重置</h1>
                <p>你好, ${player.player_name}，</p>
                <p>我们收到了一个重置您账户密码的请求。请点击下方的链接来设置您的新密码。该链接将在1小时后失效。</p>
                <div style="margin: 20px 0; text-align: center;">
                    <a href="${resetLink}" style="background-color: #3F51B5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-size: 16px;">重置密码</a>
                </div>
                <p>如果您无法点击按钮，请复制以下链接到浏览器地址栏打开：</p>
                <p style="word-break: break-all; font-size: 12px;">${resetLink}</p>
                <p>如果您没有请求重置密码，请忽略此邮件。</p>
            </div>
        `;

        await resend.emails.send({
            from: 'Eulark 服务器 <message@betetryuan.cn>',
            to: email,
            subject: 'Eulark 服务器 - 密码重置请求',
            html: emailHtml,
        });
        res.status(200).json({ message: '如果该邮箱已注册，您将会收到一封密码重置邮件。' });
    } catch (err) { console.error('忘记密码错误:', err); res.status(500).json({ error: '服务器内部错误。' }); }
});

app.post('/api/reset-password', async (req, res) => {
    const { token, password, confirmPassword } = req.body;
    if (!token || !password || !confirmPassword) { return res.status(400).json({ error: '所有字段均为必填项。' }); }
    if (password !== confirmPassword) { return res.status(400).json({ error: '两次输入的密码不一致。' }); }
    try {
        const { data: resetRequest, error: findError } = await supabase.from('password_resets').select('*').eq('token', token).single();
        if (findError || !resetRequest) { return res.status(400).json({ error: '无效的或已过期的重置链接。' }); }
        if (new Date(resetRequest.expires_at) < new Date()) {
            await supabase.from('password_resets').delete().eq('token', token);
            return res.status(400).json({ error: '重置链接已过期，请重新请求。' });
        }
        const password_hash = await bcrypt.hash(password, 10);
        const { error: updateError } = await supabase.from('players').update({ password_hash: password_hash }).eq('email', resetRequest.email);
        if (updateError) throw updateError;
        await supabase.from('password_resets').delete().eq('token', token);
        res.status(200).json({ message: '密码重置成功！现在您可以使用新密码登录了。' });
    } catch (err) { console.error('重置密码错误:', err); res.status(500).json({ error: '服务器内部错误。' }); }
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
    } catch (error) { console.error('提交工单错误:', error); res.status(500).json({ error: '服务器内部错误，提交失败' }); } 
});
app.get('/api/player/check-permission', verifyToken, async (req, res) => {
        console.log("正在为用户检查权限, 用户信息:", req.user); // <--- 添加这行日志
    const { id: playerId } = req.user;
    try {
        const { data, error } = await supabase.from('special_permissions').select('player_id').eq('player_id', playerId).single();
        if (error && error.code !== 'PGRST116') { throw error; }
        const hasPermission = !!data;
        if (hasPermission) {
            res.json({ hasPermission: true, url: buildingListUrl });
        } else {
            res.json({ hasPermission: false });
        }
    } catch (error) { console.error('检查权限时发生错误:', error); res.status(500).json({ error: '无法检查用户权限' }); }
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

// 管理员用户管理 API
app.get('/api/admin/players', verifyToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: '仅管理员可访问' });
    try {
        const { data: players, error: playersError } = await supabase.from('players').select('id, player_name, email, created_at').order('created_at', { ascending: false });
        if (playersError) throw playersError;
        const { data: permissions, error: permissionsError } = await supabase.from('special_permissions').select('player_id');
        if (permissionsError) throw permissionsError;
        const permissionSet = new Set(permissions.map(p => p.player_id));
        const playersWithPermissions = players.map(player => ({ ...player, has_permission: permissionSet.has(player.id) }));
        res.json(playersWithPermissions);
    } catch (error) {
        console.error('获取玩家列表错误:', error);
        res.status(500).json({ error: '获取玩家列表失败' });
    }
});
app.post('/api/admin/permissions', verifyToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: '仅管理员可访问' });
    const { player_id } = req.body;
    if (!player_id) return res.status(400).json({ error: '未提供玩家ID' });
    try {
        const { error } = await supabase.rpc('grant_permission', { player_id_to_grant: player_id });
        if (error) throw error;
        res.status(201).json({ message: '授权成功' });
    } catch (error) { console.error('授权错误:', error); res.status(500).json({ error: '授权失败' }); }
});
app.delete('/api/admin/permissions/:id', verifyToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: '仅管理员可访问' });
    const { id: player_id } = req.params;
    try {
        const { error } = await supabase.rpc('revoke_permission', { player_id_to_revoke: player_id });
        if (error) throw error;
        res.status(200).json({ message: '取消授权成功' });
    } catch (error) { console.error('取消授权错误:', error); res.status(500).json({ error: '取消授权失败' }); }
});
app.delete('/api/admin/players/:id', verifyToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: '仅管理员可访问' });
    const { id: player_id } = req.params;
    try {
        // 为了安全，删除用户也应该使用 RPC 函数
        // 您需要在 Supabase 中创建一个名为 `delete_player` 的 SECURITY DEFINER 函数
        // CREATE FUNCTION delete_player(player_id_to_delete bigint) RETURNS void ...
        // BEGIN DELETE FROM public.players WHERE id = player_id_to_delete; END;
        const { error } = await supabase.from('players').delete().eq('id', player_id); // 临时保留，建议换成RPC
        if (error) throw error;
        res.status(200).json({ message: '删除用户成功' });
    } catch (error) { console.error('删除用户错误:', error); res.status(500).json({ error: '删除用户失败' }); }
});

// --- 12. 启动与导出 ---
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`开发服务器已启动，访问 http://localhost:${PORT}`);
    });
}
module.exports = app;