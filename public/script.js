// =================================================================
// script.js - 最终完整版 v3.0 (已添加签到功能)
// =================================================================

// --- 全局变量 ---
const PLAYER_AUTH_TOKEN = localStorage.getItem('playerAuthToken');
const ADMIN_AUTH_TOKEN = localStorage.getItem('adminAuthToken');
const IS_PLAYER_LOGGED_IN = !!PLAYER_AUTH_TOKEN;
let IS_ADMIN_LOGGED_IN = !!ADMIN_AUTH_TOKEN;

// --- 主程序入口 ---
document.addEventListener('DOMContentLoaded', function() {
    // 1. 初始化所有与登录状态无关的基础UI
    initializeBaseUI();
    initializeAnimations();

    // 2. 加载所有公共内容
    loadAllContent();

    // 3. 根据登录状态更新UI和初始化特定模块
    updateNavbar();
    updateContactFormUI();
    if (IS_PLAYER_LOGGED_IN) {
        initializePlayerModules();
    }
    if (IS_ADMIN_LOGGED_IN) {
        document.body.classList.add('admin-view');
    }
});

/**
 * 初始化所有基础UI事件监听器
 */
function initializeBaseUI() {
    // 移动端导航菜单切换
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            menuToggle.classList.toggle('active');
        });
    }
    // 平滑滚动到锚点
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
        });
    });
    // 滚动时添加导航栏阴影
    window.addEventListener('scroll', () => {
        const header = document.querySelector('header');
        if (header) header.style.boxShadow = window.scrollY > 50 ? '0 2px 20px rgba(0, 0, 0, 0.3)' : 'none';
    });
    // 服务器状态检查
    checkServerStatus();
    setInterval(checkServerStatus, 60000);
}

/**
 * 初始化页面滚动动画
 */
function initializeAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('animate');
        });
    }, { threshold: 0.1 });
    const animatedElements = document.querySelectorAll(
        '.hero-content h1, .hero-subtitle, .cta-button, .server-status-container, .hero-actions-container, ' +
        '.about h2, .about-text, .about-image, ' +
        '.rules-preview h2, .rule-card, ' +
        '.commands h2, .command-category, ' +
        '.contact h2, .contact-form'
    );
    animatedElements.forEach(el => observer.observe(el));
}

/**
 * 【新增】初始化所有需要玩家登录后才能看到或使用的模块
 */
function initializePlayerModules() {
    const checkinModule = document.getElementById('checkin-module');
    if (checkinModule) {
        checkinModule.style.display = 'block'; // 显示模块
        fetchPlayerStatus(); // 获取初始状态
        document.getElementById('checkin-btn')?.addEventListener('click', handleCheckin);
    }
}

/**
 * 加载所有需要动态渲染的内容
 */
async function loadAllContent() {
    await renderRules();
    await renderCommands();
}

// =================================================================
// 模块功能函数 (按功能分组)
// =================================================================

// --- 服务器状态 ---
async function checkServerStatus() {
    const statusContainer = document.querySelector('.server-status');
    const statusText = document.querySelector('.status-text');
    const playerCount = document.querySelector('.player-count');
    if (!statusContainer || !statusText || !playerCount) return;
    try {
        const response = await fetch(`https://api.mcsrvstat.us/3/mc.contega.top`);
        const data = await response.json();
        if (data.online) {
            statusContainer.className = 'server-status online';
            statusText.textContent = '在线';
            playerCount.textContent = data.players ? `${data.players.online} / ${data.players.max} 玩家` : '玩家信息未知';
        } else {
            statusContainer.className = 'server-status offline';
            statusText.textContent = '离线';
            playerCount.textContent = '服务器当前离线';
        }
    } catch (error) { console.error('检查服务器状态失败:', error); }
}

// --- 认证与导航栏 ---
function updateNavbar() {
    const authContainer = document.getElementById('auth-container');
    const playerInfo = localStorage.getItem('playerInfo');
    const showLoginButton = () => { if (authContainer) authContainer.innerHTML = '<a href="login.html" class="nav-link"><b>登录</b></a>'; };
    if (IS_PLAYER_LOGGED_IN && playerInfo && authContainer) {
        try {
            const user = JSON.parse(playerInfo);
            authContainer.innerHTML = `<div class="user-info-pill"><i class="fas fa-user-circle"></i><span>${escapeHTML(user.username)}</span><button onclick="logout()" class="logout-btn-small" title="退出登录"><i class="fas fa-sign-out-alt"></i></button></div>`;
        } catch (e) { localStorage.clear(); showLoginButton(); }
    } else { showLoginButton(); }
}
function logout() {
    localStorage.removeItem('playerAuthToken');
    localStorage.removeItem('playerInfo');
    alert('已成功退出！');
    window.location.reload();
}

// --- 【新增】签到系统 ---
async function fetchPlayerStatus() {
    const scoreDisplay = document.getElementById('player-score-display');
    const checkinBtn = document.getElementById('checkin-btn');
    if (!scoreDisplay || !checkinBtn) return;
    try {
        const response = await fetch('/api/player/status', { headers: { 'Authorization': `Bearer ${PLAYER_AUTH_TOKEN}` } });
        if (!response.ok) throw new Error('无法获取用户信息');
        const data = await response.json();
        scoreDisplay.textContent = data.score;
        if (data.canCheckIn) {
            checkinBtn.disabled = false;
            checkinBtn.innerHTML = '<i class="fas fa-hand-pointer"></i> 今日签到';
        } else {
            checkinBtn.disabled = true;
            checkinBtn.innerHTML = '<i class="fas fa-check"></i> 今日已签到';
        }
    } catch (error) {
        scoreDisplay.textContent = '获取失败';
        checkinBtn.disabled = true;
        checkinBtn.textContent = '状态异常';
    }
}
async function handleCheckin() {
    const checkinBtn = document.getElementById('checkin-btn');
    const messageDiv = document.getElementById('checkin-message');
    const scoreDisplay = document.getElementById('player-score-display');
    if (!checkinBtn || !messageDiv || !scoreDisplay) return;
    checkinBtn.disabled = true;
    checkinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 签到中...';
    messageDiv.textContent = '';
    try {
        const response = await fetch('/api/player/checkin', { method: 'POST', headers: { 'Authorization': `Bearer ${PLAYER_AUTH_TOKEN}` } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        scoreDisplay.textContent = result.newScore;
        messageDiv.textContent = result.message;
        messageDiv.style.color = '#2ecc71';
        checkinBtn.innerHTML = '<i class="fas fa-check"></i> 今日已签到';
    } catch (error) {
        messageDiv.textContent = error.message;
        messageDiv.style.color = '#e74c3c';
        if (!error.message.includes('已经签过到')) {
            checkinBtn.disabled = false;
            checkinBtn.innerHTML = '<i class="fas fa-hand-pointer"></i> 今日签到';
        }
    }
}

// --- 工单系统 ---
function updateContactFormUI() {
    const contactForm = document.getElementById('contactForm');
    if (!contactForm) return;
    const playerMessageTextarea = document.getElementById('playerMessage');
    const contactSubmitButton = contactForm.querySelector('button[type="submit"]');
    if (!IS_PLAYER_LOGGED_IN) {
        if (playerMessageTextarea) playerMessageTextarea.disabled = true;
        if (contactSubmitButton) contactSubmitButton.disabled = true;
        if (playerMessageTextarea) playerMessageTextarea.placeholder = '请先登录，才能提交工单。';
    }
}
async function handleContactSubmit(e) {
    e.preventDefault();
    const form = e.target, messageDiv = document.getElementById('formMessage'), submitButton = form.querySelector('button');
    const playerMessage = document.getElementById('playerMessage').value.trim();
    if (!playerMessage) { messageDiv.textContent = '消息内容不能为空！'; messageDiv.style.color = '#e74c3c'; return; }
    submitButton.disabled = true; submitButton.textContent = '正在发送...'; messageDiv.textContent = '';
    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PLAYER_AUTH_TOKEN}` },
            body: JSON.stringify({ message: playerMessage })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '发生未知错误');
        messageDiv.textContent = '消息发送成功！'; messageDiv.style.color = '#2ecc71'; form.reset();
    } catch (error) {
        messageDiv.textContent = `发送失败: ${error.message}`;
        messageDiv.style.color = '#e74c3c';
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '发送消息';
    }
}

// --- 内容渲染 (CMS) ---
async function renderRules() { /* ... (保持不变, 此处省略) ... */ }
async function renderCommands() { /* ... (保持不变, 此处省略) ... */ }

// --- 管理员编辑 (CMS) ---
function openRuleModal(id, category, description) { /* ... (保持不变, 此处省略) ... */ }
async function saveRule(id, category, description) { /* ... (保持不变, 此处省略) ... */ }
async function deleteRule(id) { /* ... (保持不变, 此处省略) ... */ }


// --- 辅助工具 ---
function escapeHTML(str) {
    return str.toString().replace(/[&<>"']/g, match => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[match]));
}

// --- 将省略的函数代码粘贴回来 ---
async function renderRules() {
    const container = document.getElementById('rules-container'); if (!container) return;
    try {
        const response = await fetch('/api/rules'); const rules = await response.json();
        container.innerHTML = '';
        rules.forEach(rule => {
            const ruleCard = document.createElement('div'); ruleCard.className = 'rule-card';
            ruleCard.innerHTML = `<div class="rule-icon"><i class="fas fa-users"></i></div><h3>${escapeHTML(rule.category)}</h3><p>${escapeHTML(rule.description)}</p>`;
            if (IS_ADMIN_LOGGED_IN) {
                const adminControls = document.createElement('div'); adminControls.className = 'admin-controls';
                adminControls.innerHTML = `<button class="edit-btn" onclick="openRuleModal(${rule.id}, '${escapeHTML(rule.category)}', '${escapeHTML(rule.description)}')"><i class="fas fa-pencil-alt"></i></button><button class="delete-btn" onclick="deleteRule(${rule.id})"><i class="fas fa-trash"></i></button>`;
                ruleCard.appendChild(adminControls);
            }
            container.appendChild(ruleCard);
        });
        const addRuleBtn = document.getElementById('add-rule-btn');
        if (IS_ADMIN_LOGGED_IN && addRuleBtn) { addRuleBtn.style.display = 'inline-block'; addRuleBtn.onclick = () => openRuleModal(); }
    } catch (error) { container.innerHTML = '<p style="color: red;">加载服务器规则失败。</p>'; }
}
async function renderCommands() {
    const container = document.getElementById('commands-container'); if (!container) return;
    try {
        const response = await fetch('/api/commands'); const commands = await response.json();
        const commandsByCategory = commands.reduce((acc, cmd) => { (acc[cmd.category] = acc[cmd.category] || []).push(cmd); return acc; }, {});
        container.innerHTML = '';
        for (const category in commandsByCategory) {
            const categoryDiv = document.createElement('div'); categoryDiv.className = 'command-category';
            let commandItemsHTML = commandsByCategory[category].map(cmd => `<div class="command-item"><code>${escapeHTML(cmd.command)}</code><span>${escapeHTML(cmd.description)}</span></div>`).join('');
            categoryDiv.innerHTML = `<h3><i class="fas fa-terminal"></i> ${escapeHTML(category)}</h3><div class="command-list">${commandItemsHTML}</div>`;
            container.appendChild(categoryDiv);
        }
    } catch (error) { container.innerHTML = '<p style="color: red;">加载服务器指令失败。</p>'; }
}
function openRuleModal(id = null, category = '', description = '') {
    const modal = document.getElementById('edit-modal'); const title = document.getElementById('modal-title'); const formFields = document.getElementById('modal-form-fields'); const form = document.getElementById('modal-form');
    if(!modal || !title || !formFields || !form) return;
    title.textContent = id ? '编辑规则' : '添加新规则';
    formFields.innerHTML = `<div class="form-group"><label for="modal-category">规则类别</label><input type="text" id="modal-category" value="${category}" required></div><div class="form-group"><label for="modal-description">规则描述</label><textarea id="modal-description" rows="4" required>${description}</textarea></div>`;
    form.onsubmit = async (e) => { e.preventDefault(); await saveRule(id, document.getElementById('modal-category').value, document.getElementById('modal-description').value); };
    modal.style.display = 'flex';
    document.getElementById('modal-cancel-btn').onclick = () => modal.style.display = 'none';
}
async function saveRule(id, category, description) {
    const url = id ? `/api/admin/rules/${id}` : '/api/admin/rules'; const method = id ? 'PATCH' : 'POST';
    try {
        const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_AUTH_TOKEN}` }, body: JSON.stringify({ category, description }) });
        if (!response.ok) throw new Error((await response.json()).error || '保存失败');
        document.getElementById('edit-modal').style.display = 'none'; await renderRules(); alert('保存成功！');
    } catch (error) { alert(`保存失败: ${error.message}`); }
}
async function deleteRule(id) {
    if (!confirm('确定要永久删除这条规则吗？')) return;
    try {
        const response = await fetch(`/api/admin/rules/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${ADMIN_AUTH_TOKEN}` } });
        if (!response.ok) throw new Error((await response.json()).error || '删除失败');
        await renderRules(); alert('删除成功！');
    } catch (error) { alert(`删除失败: ${error.message}`); }
}