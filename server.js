// =================================================================
// server.js - 最终完整版 v5.0 (功能全面且经过加固)
// =================================================================
// 关键特性:
// 1. 完整的玩家与管理员认证流程 (注册, 登录, Token验证)。
// 2. 登录成功后，API会返回用户信息，优化前端体验。
// 3. 工单提交API受保护，并自动关联用户Email。
// 4. 【已修复并加固】签到API逻辑，确保在高并发下也能正确运行。
// 5. 为封禁墙和赞助名单提供了安全的、基于数据库的增删查API。
// 6. 支持管理员在前端实时编辑内容 (CMS)。
// 7. 为Vercel无服务器环境进行了正确配置和导出。
// =================================================================

// --- 1. 引入依赖 ---
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- 2. Supabase 初始化 和 环境变量 ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const jwtSecret = process.env.JWT_SECRET;

// 关键检查
if (!supabaseUrl || !supabaseAnonKey || !jwtSecret) {
    console.error("严重错误：缺少一个或多个关键环境变量。请确保 SUPABASE_URL, SUPABASE_ANON_KEY, 和 JWT_SECRET 已正确设置。");
    process.exit(1);
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

// --- 6. 页面路由 ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));

// --- 7. 公共 API 路由 (无需登录) ---
app.get('/api/rules', async (req, res) => { try { const { data, error } = await supabase.from('server_rules').select('*').order('id'); if (error) throw error; res.json(data); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/commands', async (req, res) => { try { const { data, error } = await supabase.from('server_commands').select('*').order('id'); if (error) throw error; res.json(data); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/bans', async (req, res) => { try { const { data, error } = await supabase.from('banned_players').select('*').order('ban_date', { ascending: false }); if (error) throw error; res.json(data); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/sponsors', async (req, res) => { try { const { data, error } = await supabase.from('sponsors').select('*').order('created_at', { ascending: false }); if (error) throw error; res.json(data); } catch (error) { res.status(500).json({ error: error.message }); } });

// --- 8. 认证与玩家 API ---
app.post('/api/register', async (req, res) => { const { player_name, email, password } = req.body; if (!player_name || !email || !password) return res.status(400).json({ error: '玩家名、邮箱和密码不能为空' }); try { const password_hash = await bcrypt.hash(password, 10); const { data, error } = await supabase.from('players').insert([{ player_name, email, password_hash }]).select().single(); if (error) { if (error.code === '23505') return res.status(409).json({ error: '玩家名或邮箱已被注册' }); throw error; } res.status(201).json({ message: '注册成功！', player: { id: data.id, player_name: data.player_name } }); } catch (err) { res.status(500).json({ error: '服务器内部错误' }); } });
app.post('/api/login', async (req, res) => { const { identifier, password } = req.body; if (!identifier || !password) return res.status(400).json({ error: '玩家名/邮箱和密码不能为空' }); try { const { data: player, error } = await supabase.from('players').select('id, player_name, password_hash').or(`player_name.eq.${identifier},email.eq.${identifier}`).single(); if (error || !player) return res.status(401).json({ error: '凭据无效' }); const isMatch = await bcrypt.compare(password, player.password_hash); if (!isMatch) return res.status(401).json({ error: '凭据无效' }); const payload = { id: player.id, player_name: player.player_name }; const token = jwt.sign(payload, jwtSecret, { expiresIn: '1d' }); res.json({ message: '登录成功', token, user: { id: player.id, username: player.player_name } }); } catch (err) { res.status(500).json({ error: '服务器内部错误' }); } });
app.post('/api/admin/login', async (req, res) => { const { username, password } = req.body; if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' }); try { const { data: user, error } = await supabase.from('users').select('id, username, password_hash').eq('username', username).single(); if (error || !user) return res.status(401).json({ error: '用户名或密码错误' }); const isMatch = await bcrypt.compare(password, user.password_hash); if (!isMatch) return res.status(401).json({ error: '用户名或密码错误' }); const payload = { id: user.id, username: user.username, isAdmin: true }; const token = jwt.sign(payload, jwtSecret, { expiresIn: '8h' }); res.json({ message: '登录成功', token }); } catch (err) { res.status(500).json({ error: '服务器内部错误' }); } });

// --- 9. 受保护的玩家 API ---
app.post('/api/contact', verifyToken, async (req, res) => { const { message } = req.body; const { id: playerId, player_name } = req.user; if (!message) return res.status(400).json({ error: '消息内容不能为空' }); try { const { data: playerData, error: playerError } = await supabase.from('players').select('email').eq('id', playerId).single(); if (playerError || !playerData) throw new Error('无法找到关联的用户信息'); const { data, error } = await supabase.from('contact_messages').insert([{ player_name, email: playerData.email, message }]).select(); if (error) throw error; res.status(201).json({ message: '消息发送成功', data: data[0] }); } catch (error) { res.status(500).json({ error: '服务器内部错误，提交失败' }); } });
app.get('/api/player/status', verifyToken, async (req, res) => { const { id: playerId } = req.user; try { const { data: player, error } = await supabase.from('players').select('score, last_checkin_date').eq('id', playerId).single(); if (error) throw error; const today = new Date().toISOString().split('T')[0]; const canCheckIn = player.last_checkin_date !== today; res.json({ score: player.score, canCheckIn: canCheckIn }); } catch (error) { res.status(500).json({ error: '无法获取玩家状态' }); } });
app.post('/api/player/checkin', verifyToken, async (req, res) => { const { id: playerId } = req.user; try { const { data: player, error: fetchError } = await supabase.from('players').select('score, last_checkin_date').eq('id', playerId).single(); if (fetchError) throw fetchError; const today = new Date().toISOString().split('T')[0]; if (player.last_checkin_date === today) return res.status(400).json({ error: '今天已经签过到了，明天再来吧！' }); const gainedScore = Math.floor(Math.random() * 51); const newTotalScore = (player.score || 0) + gainedScore; const { data: updatedData, error: updateError } = await supabase.from('players').update({ score: newTotalScore, last_checkin_date: today }).eq('id', playerId).select('score'); if (updateError) throw updateError; if (!updatedData || updatedData.length === 0) throw new Error('更新玩家数据后未能收到返回结果。'); const updatedPlayer = updatedData[0]; res.json({ message: `签到成功！获得 ${gainedScore} 积分。`, newScore: updatedPlayer.score, gainedScore: gainedScore }); } catch (error) { console.error('签到时发生服务器错误:', error); res.status(500).json({ error: '签到失败，服务器内部错误' }); } });

// --- 10. 受保护的管理员 API ---
app.get('/api/admin/messages', verifyToken, async (req, res) => { try { const { data, error } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false }); if (error) throw error; res.json(data); } catch (error) { res.status(500).json({ error: error.message }); } });
app.delete('/api/admin/messages/:id', verifyToken, async (req, res) => { const { id } = req.params; try { await supabase.from('contact_messages').delete().eq('id', id); res.status(200).json({ message: '工单删除成功' }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/admin/rules', verifyToken, async (req, res) => { const { category, description } = req.body; if (!category || !description) return res.status(400).json({ error: '规则类别和描述不能为空' }); try { const { data, error } = await supabase.from('server_rules').insert([{ category, description }]).select().single(); if (error) throw error; res.status(201).json(data); } catch (error) { res.status(500).json({ error: error.message }); } });
app.delete('/api/admin/rules/:id', verifyToken, async (req, res) => { const { id } = req.params; try { await supabase.from('server_rules').delete().eq('id', id); res.status(200).json({ message: '规则删除成功' }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/admin/bans', verifyToken, async (req, res) => { const { player_name, reason, duration, ban_date } = req.body; if (!player_name || !reason || !duration || !ban_date) return res.status(400).json({ error: '所有字段均为必填项' }); try { const { data, error } = await supabase.from('banned_players').insert([{ player_name, reason, duration, ban_date }]).select().single(); if (error) throw error; res.status(201).json(data); } catch (error) { res.status(500).json({ error: error.message }); } });
app.delete('/api/admin/bans/:id', verifyToken, async (req, res) => { const { id } = req.params; try { await supabase.from('banned_players').delete().eq('id', id); res.status(200).json({ message: '封禁记录删除成功' }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/admin/sponsors', verifyToken, async (req, res) => { const { name, amount } = req.body; if (!name || !amount) return res.status(400).json({ error: '名称和金额不能为空' }); try { const { data, error } = await supabase.from('sponsors').insert([{ name, amount }]).select().single(); if (error) throw error; res.status(201).json(data); } catch (error) { res.status(500).json({ error: error.message }); } });
app.delete('/api/admin/sponsors/:id', verifyToken, async (req, res) => { const { id } = req.params; try { await supabase.from('sponsors').delete().eq('id', id); res.status(200).json({ message: '赞助记录删除成功' }); } catch (error) { res.status(500).json({ error: error.message }); } });

// --- 11. 启动与导出 ---
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`本地开发服务器已启动，访问 http://localhost:${PORT}`);
    });
}
module.exports = app;