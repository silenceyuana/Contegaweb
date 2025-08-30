// =================================================================
// script.js - 最终高级功能版本 (Final Advanced Version)
// =================================================================
// 新增功能:
// - 页面内容从API动态加载
// - 管理员登录后，在前端页面直接显示“增删改”按钮
// - 通过模态框(弹窗)实现内容的实时编辑
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
 * 检查管理员Token，并设置全局状态
 */
function checkAdminStatus() {
    if (ADMIN_AUTH_TOKEN) {
        // 这里可以做一个更安全的验证，比如向后端发送一个请求验证token有效性
        // 为简化，我们暂时只检查token是否存在
        IS_ADMIN_LOGGED_IN = true;
        document.body.classList.add('admin-view'); // 给body添加一个class，方便CSS控制
    }
}

/**
 * 加载所有需要动态渲染的内容
 */
async function loadAllContent() {
    await renderRules();
    await renderCommands();
    // 你可以在这里添加加载其他内容，如赞助者等
}


// =================================================================
// 内容渲染模块
// =================================================================

/**
 * 获取并渲染服务器规则
 */
async function renderRules() {
    const container = document.getElementById('rules-container');
    if (!container) return;

    try {
        const response = await fetch('/api/rules');
        const rules = await response.json();
        
        container.innerHTML = ''; // 清空现有内容
        rules.forEach(rule => {
            const ruleCard = document.createElement('div');
            ruleCard.className = 'rule-card';
            ruleCard.innerHTML = `
                <div class="rule-icon"><i class="fas fa-users"></i></div>
                <h3>${escapeHTML(rule.category)}</h3>
                <p>${escapeHTML(rule.description)}</p>
            `;

            // 如果是管理员，添加编辑和删除按钮
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
        
        // 显示“添加规则”按钮给管理员
        const addRuleBtn = document.getElementById('add-rule-btn');
        if (IS_ADMIN_LOGGED_IN && addRuleBtn) {
            addRuleBtn.style.display = 'inline-block';
            addRuleBtn.onclick = () => openRuleModal(); // 不带参数表示新建
        }

    } catch (error) {
        console.error('加载规则失败:', error);
        container.innerHTML = '<p style="color: red;">加载服务器规则失败，请刷新页面重试。</p>';
    }
}

/**
 * 获取并渲染服务器指令
 */
async function renderCommands() {
    const container = document.getElementById('commands-container');
    if (!container) return;

    try {
        const response = await fetch('/api/commands');
        const commands = await response.json();
        
        // 按类别分组
        const commandsByCategory = commands.reduce((acc, cmd) => {
            if (!acc[cmd.category]) {
                acc[cmd.category] = [];
            }
            acc[cmd.category].push(cmd);
            return acc;
        }, {});

        container.innerHTML = ''; // 清空
        for (const category in commandsByCategory) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'command-category';
            
            let commandItemsHTML = '';
            commandsByCategory[category].forEach(cmd => {
                commandItemsHTML += `
                    <div class="command-item">
                        <code>${escapeHTML(cmd.command)}</code>
                        <span>${escapeHTML(cmd.description)}</span>
                    </div>
                `;
            });

            categoryDiv.innerHTML = `
                <h3><i class="fas fa-terminal"></i> ${escapeHTML(category)}</h3>
                <div class="command-list">${commandItemsHTML}</div>
            `;
            container.appendChild(categoryDiv);
        }

    } catch (error) {
        console.error('加载指令失败:', error);
        container.innerHTML = '<p style="color: red;">加载服务器指令失败，请刷新页面重试。</p>';
    }
}


// =================================================================
// 管理员实时编辑 (CRUD) 交互模块
// =================================================================

/**
 * 打开用于编辑或创建规则的模态框
 * @param {number|null} id - 规则ID，如果为null则表示创建新规则
 * @param {string} category - 当前的规则类别
 * @param {string} description - 当前的规则描述
 */
function openRuleModal(id = null, category = '', description = '') {
    const modal = document.getElementById('edit-modal');
    const title = document.getElementById('modal-title');
    const formFields = document.getElementById('modal-form-fields');
    const form = document.getElementById('modal-form');

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

/**
 * 保存规则（创建或更新）
 */
async function saveRule(id, category, description) {
    const url = id ? `/api/admin/rules/${id}` : '/api/admin/rules';
    const method = id ? 'PATCH' : 'POST';

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ADMIN_AUTH_TOKEN}`
            },
            body: JSON.stringify({ category, description })
        });

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || '保存失败');
        }
        
        document.getElementById('edit-modal').style.display = 'none'; // 关闭模态框
        await renderRules(); // 重新渲染规则列表
        alert('保存成功！');

    } catch (error) {
        console.error('保存规则失败:', error);
        alert(`保存失败: ${error.message}`);
    }
}

/**
 * 删除规则
 */
async function deleteRule(id) {
    if (!confirm('确定要永久删除这条规则吗？')) return;

    try {
        const response = await fetch(`/api/admin/rules/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${ADMIN_AUTH_TOKEN}` }
        });

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || '删除失败');
        }

        await renderRules(); // 重新渲染
        alert('删除成功！');

    } catch (error) {
        console.error('删除规则失败:', error);
        alert(`删除失败: ${error.message}`);
    }
}

// =================================================================
// 既有功能函数 (保留并适配)
// =================================================================

// ... (此处省略 checkServerStatus, updateContactFormUI, handleContactSubmit, updateNavbar, logout 函数，因为它们与我上次提供的最终版本一致，直接复用即可)
// 【注意】: 请确保将上次提供的这些函数也包含在此文件中。为避免重复，此处省略。

// --- 辅助函数 ---
function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, match => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[match]));
}


// =================================================================
// 既有功能函数 - 从上一版完整复制
// =================================================================

async function checkServerStatus() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const playerCount = document.querySelector('.player-count');
    const serverAddress = 'mc.contega.top'; 
    if (!statusDot || !statusText || !playerCount) return;
    try {
        const response = await fetch(`https://api.mcsrvstat.us/3/${serverAddress}`);
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
        messageDiv.textContent = '消息发送成功！感谢您的反馈。'; messageDiv.style.color = '#2ecc71'; form.reset();
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