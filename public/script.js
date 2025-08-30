// =================================================================
// script.js - 最终完整版 (包含所有功能，已修复动画)
// =================================================================

// --- 全局变量 ---
let IS_ADMIN_LOGGED_IN = false;
const ADMIN_AUTH_TOKEN = localStorage.getItem('adminAuthToken');

// --- 主程序入口 ---
document.addEventListener('DOMContentLoaded', function() {
    
    // 基础UI功能初始化
    initializeUI();
    
    // 检查管理员登录状态
    checkAdminStatus();

    // 动态加载所有页面内容
    loadAllContent();

    // 更新导航栏的用户状态
    updateNavbar();

    // 【已修复】: 重新添加动画触发逻辑
    initializeAnimations();
});


/**
 * 初始化所有基础UI事件监听器
 */
function initializeUI() {
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
            const targetId = this.getAttribute('href');
            if (targetId.length > 1) {
                document.querySelector(targetId)?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
    
    // 滚动时添加导航栏阴影
    window.addEventListener('scroll', () => {
        const header = document.querySelector('header');
        if (header) {
            header.style.boxShadow = window.scrollY > 50 ? '0 2px 20px rgba(0, 0, 0, 0.3)' : 'none';
        }
    });

    // 服务器状态检查
    checkServerStatus();
    setInterval(checkServerStatus, 60000);

    // 工单表单逻辑
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        updateContactFormUI();
        contactForm.addEventListener('submit', handleContactSubmit);
    }
}

/**
 * 【新增】初始化页面滚动动画
 */
function initializeAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
            }
        });
    }, {
        threshold: 0.1 // 元素进入可视区域10%时触发
    });

    const animatedElements = document.querySelectorAll(
        '.hero-content h1, .hero-subtitle, .cta-button, .server-status-container, ' +
        '.about h2, .about-text, .about-image, ' +
        '.rules-preview h2, .rule-card, ' +
        '.commands h2, .command-category, ' +
        '.contact h2, .contact-form'
    );
    
    animatedElements.forEach(el => observer.observe(el));
}


/**
 * 检查管理员Token，并设置全局状态
 */
function checkAdminStatus() {
    if (ADMIN_AUTH_TOKEN) {
        IS_ADMIN_LOGGED_IN = true;
        document.body.classList.add('admin-view');
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
// 内容渲染模块
// =================================================================

async function renderRules() {
    const container = document.getElementById('rules-container');
    if (!container) return;
    try {
        const response = await fetch('/api/rules');
        const rules = await response.json();
        container.innerHTML = '';
        rules.forEach(rule => {
            const ruleCard = document.createElement('div');
            ruleCard.className = 'rule-card';
            ruleCard.innerHTML = `
                <div class="rule-icon"><i class="fas fa-users"></i></div>
                <h3>${escapeHTML(rule.category)}</h3>
                <p>${escapeHTML(rule.description)}</p>
            `;
            if (IS_ADMIN_LOGGED_IN) {
                const adminControls = document.createElement('div');
                adminControls.className = 'admin-controls';
                adminControls.innerHTML = `
                    <button class="edit-btn" onclick="openRuleModal(${rule.id}, '${escapeHTML(rule.category)}', '${escapeHTML(rule.description)}')"><i class="fas fa-pencil-alt"></i></button>
                    <button class="delete-btn" onclick="deleteRule(${rule.id})"><i class="fas fa-trash"></i></button>
                `;
                ruleCard.appendChild(adminControls);
            }
            container.appendChild(ruleCard);
        });
        const addRuleBtn = document.getElementById('add-rule-btn');
        if (IS_ADMIN_LOGGED_IN && addRuleBtn) {
            addRuleBtn.style.display = 'inline-block';
            addRuleBtn.onclick = () => openRuleModal();
        }
    } catch (error) {
        console.error('加载规则失败:', error);
        container.innerHTML = '<p style="color: red;">加载服务器规则失败。</p>';
    }
}

async function renderCommands() {
    const container = document.getElementById('commands-container');
    if (!container) return;
    try {
        const response = await fetch('/api/commands');
        const commands = await response.json();
        const commandsByCategory = commands.reduce((acc, cmd) => {
            acc[cmd.category] = acc[cmd.category] || [];
            acc[cmd.category].push(cmd);
            return acc;
        }, {});
        container.innerHTML = '';
        for (const category in commandsByCategory) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'command-category';
            let commandItemsHTML = commandsByCategory[category].map(cmd => `
                <div class="command-item">
                    <code>${escapeHTML(cmd.command)}</code>
                    <span>${escapeHTML(cmd.description)}</span>
                </div>
            `).join('');
            categoryDiv.innerHTML = `
                <h3><i class="fas fa-terminal"></i> ${escapeHTML(category)}</h3>
                <div class="command-list">${commandItemsHTML}</div>
            `;
            container.appendChild(categoryDiv);
        }
    } catch (error) {
        console.error('加载指令失败:', error);
        container.innerHTML = '<p style="color: red;">加载服务器指令失败。</p>';
    }
}


// =================================================================
// 管理员实时编辑 (CRUD) 交互模块
// =================================================================

function openRuleModal(id = null, category = '', description = '') {
    const modal = document.getElementById('edit-modal');
    const title = document.getElementById('modal-title');
    const formFields = document.getElementById('modal-form-fields');
    const form = document.getElementById('modal-form');
    if(!modal || !title || !formFields || !form) return;

    title.textContent = id ? '编辑规则' : '添加新规则';
    formFields.innerHTML = `
        <div class="form-group">
            <label for="modal-category">规则类别</label>
            <input type="text" id="modal-category" value="${category}" required>
        </div>
        <div class="form-group">
            <label for="modal-description">规则描述</label>
            <textarea id="modal-description" rows="4" required>${description}</textarea>
        </div>
    `;
    form.onsubmit = async (e) => {
        e.preventDefault();
        const newCategory = document.getElementById('modal-category').value;
        const newDescription = document.getElementById('modal-description').value;
        await saveRule(id, newCategory, newDescription);
    };
    modal.style.display = 'flex';
    document.getElementById('modal-cancel-btn').onclick = () => modal.style.display = 'none';
}

async function saveRule(id, category, description) {
    const url = id ? `/api/admin/rules/${id}` : '/api/admin/rules';
    const method = id ? 'PATCH' : 'POST';
    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_AUTH_TOKEN}` },
            body: JSON.stringify({ category, description })
        });
        if (!response.ok) throw new Error((await response.json()).error || '保存失败');
        document.getElementById('edit-modal').style.display = 'none';
        await renderRules();
        alert('保存成功！');
    } catch (error) {
        console.error('保存规则失败:', error);
        alert(`保存失败: ${error.message}`);
    }
}

async function deleteRule(id) {
    if (!confirm('确定要永久删除这条规则吗？')) return;
    try {
        const response = await fetch(`/api/admin/rules/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${ADMIN_AUTH_TOKEN}` }
        });
        if (!response.ok) throw new Error((await response.json()).error || '删除失败');
        await renderRules();
        alert('删除成功！');
    } catch (error) {
        console.error('删除规则失败:', error);
        alert(`删除失败: ${error.message}`);
    }
}

// =================================================================
// 既有功能函数 (保留并适配)
// =================================================================

async function checkServerStatus() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const playerCount = document.querySelector('.player-count');
    if (!statusDot || !statusText || !playerCount) return;
    try {
        const response = await fetch(`https://api.mcsrvstat.us/3/mc.contega.top`);
        const data = await response.json();
        const statusContainer = statusDot.parentElement;
        if (data.online) {
            statusContainer.className = 'server-status online';
            statusText.textContent = '在线';
            playerCount.textContent = `${data.players.online}/${data.players.max} 玩家在线`;
        } else {
            statusContainer.className = 'server-status offline';
            statusText.textContent = '离线';
            playerCount.textContent = '服务器当前离线';
        }
    } catch (error) { console.error('检查服务器状态失败:', error); }
}

function updateContactFormUI() {
    const playerToken = localStorage.getItem('playerAuthToken');
    const contactForm = document.getElementById('contactForm');
    if(!contactForm) return;
    const playerMessageTextarea = document.getElementById('playerMessage');
    const contactSubmitButton = contactForm.querySelector('button[type="submit"]');
    if (!playerToken) {
        if(playerMessageTextarea) playerMessageTextarea.disabled = true;
        if(contactSubmitButton) contactSubmitButton.disabled = true;
        if(playerMessageTextarea) playerMessageTextarea.placeholder = '请先登录，才能提交工单。';
    }
}

async function handleContactSubmit(e) {
    e.preventDefault();
    const token = localStorage.getItem('playerAuthToken');
    if (!token) { alert('请先登录后再提交工单！'); return; }
    const form = e.target;
    const messageDiv = document.getElementById('formMessage');
    const submitButton = form.querySelector('button[type="submit"]');
    const playerMessage = document.getElementById('playerMessage').value.trim();
    if (!playerMessage) { messageDiv.textContent = '消息内容不能为空！'; messageDiv.style.color = '#e74c3c'; return; }
    submitButton.disabled = true; submitButton.textContent = '正在发送...'; messageDiv.textContent = '';
    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ message: playerMessage })
        });
        const result = await response.json();
        if (!response.ok) { throw new Error(result.error || '发生未知错误'); }
        messageDiv.textContent = '消息发送成功！'; messageDiv.style.color = '#2ecc71'; form.reset();
    } catch (error) { messageDiv.textContent = `发送失败: ${error.message}`; messageDiv.style.color = '#e74c3c'; } 
    finally { submitButton.disabled = false; submitButton.textContent = '发送消息'; }
}

function updateNavbar() {
    const authContainer = document.getElementById('auth-container');
    const token = localStorage.getItem('playerAuthToken');
    const playerInfo = localStorage.getItem('playerInfo');
    const showLoginButton = () => { if (authContainer) authContainer.innerHTML = '<a href="login.html" class="nav-link"><b>登录</b></a>'; };
    if (token && playerInfo && authContainer) {
        try {
            const user = JSON.parse(playerInfo);
            authContainer.innerHTML = `<div class="user-info-pill"><i class="fas fa-user-circle"></i><span>${escapeHTML(user.username)}</span><button onclick="logout()" class="logout-btn-small" title="退出登录"><i class="fas fa-sign-out-alt"></i></button></div>`;
        } catch (e) { localStorage.removeItem('playerAuthToken'); localStorage.removeItem('playerInfo'); showLoginButton(); }
    } else { showLoginButton(); }
}

function logout() {
    localStorage.removeItem('playerAuthToken');
    localStorage.removeItem('playerInfo');
    alert('已成功退出！');
    window.location.reload();
}

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, match => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[match]));
}