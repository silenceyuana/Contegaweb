/* =================================================================
// script.js - Eulark 生电服务器官网
// 版本: v7.0 (简化版 - 移除签到与商城)
// 描述: 这是网站核心的客户端脚本，负责处理通用UI交互、
//      服务器状态检查、用户认证状态显示以及工单提交。
// ================================================================= */

// --- 1. 全局常量与状态 ---
const PLAYER_AUTH_TOKEN = localStorage.getItem('playerAuthToken');
const ADMIN_AUTH_TOKEN = localStorage.getItem('adminAuthToken');
const IS_PLAYER_LOGGED_IN = !!PLAYER_AUTH_TOKEN;
const IS_ADMIN_LOGGED_IN = !!ADMIN_AUTH_TOKEN;

// --- 2. 主程序入口 ---
document.addEventListener('DOMContentLoaded', function() {
    // 初始化基础UI交互
    initializeBaseUI();
    // 初始化页面滚动动画
    initializeAnimations();
    // 根据登录状态更新导航栏
    updateNavbar();
    // 根据登录状态更新工单表单的可用性
    updateContactFormUI();

    // 为工单表单绑定提交事件
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactSubmit);
    }
    
    // 如果是管理员登录，为 body 添加一个 class，用于特定样式的显示
    if (IS_ADMIN_LOGGED_IN) {
        document.body.classList.add('admin-view');
    }
});

// --- 3. 初始化函数 ---

/**
 * 初始化基础UI元素，如移动端菜单、平滑滚动等。
 */
function initializeBaseUI() {
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            menuToggle.classList.toggle('active');
        });
    }

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetElement = document.querySelector(this.getAttribute('href'));
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    window.addEventListener('scroll', () => {
        const header = document.querySelector('header');
        if (header) {
            header.style.boxShadow = window.scrollY > 50 ? '0 2px 20px rgba(0, 0, 0, 0.1)' : 'none';
        }
    });

    // 页面加载时立即检查一次服务器状态，之后每分钟刷新一次
    checkServerStatus();
    setInterval(checkServerStatus, 60000);
}

/**
 * 初始化页面元素的滚动淡入动画。
 */
function initializeAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
            }
        });
    }, { threshold: 0.1 });

    const animatedElements = document.querySelectorAll(
        '.hero-content h1, .hero-subtitle, .cta-button, .server-status-container, ' +
        '.about h2, .about-text, .about-image, ' +
        '.rules-preview h2, .rule-card, ' +
        '.commands h2, .command-category, ' +
        '.contact h2, .contact-form'
    );
    animatedElements.forEach(el => observer.observe(el));
}

// --- 4. 核心功能函数 ---

/**
 * 异步获取并更新Minecraft服务器的状态。
 */
async function checkServerStatus() {
    const statusContainer = document.querySelector('.server-status');
    const statusText = document.querySelector('.status-text');
    const playerCount = document.querySelector('.player-count');
    if (!statusContainer || !statusText || !playerCount) return;

    try {

        const response = await fetch(`https://api.mcsrvstat.us/3/eulark.air114.top`);
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
    } catch (error) {
        console.error('检查服务器状态失败:', error);
        statusContainer.className = 'server-status offline';
        statusText.textContent = '错误';
        playerCount.textContent = '无法获取服务器状态';
    }
}

/**
 * 更新导航栏，显示登录按钮或用户信息。
 */
function updateNavbar() {
    const authContainer = document.getElementById('auth-container');
    const playerInfo = localStorage.getItem('playerInfo');
    const showLoginButton = () => { 
        if (authContainer) {
            authContainer.innerHTML = '<a href="login.html" class="nav-link"><b>登录</b></a>';
        }
    };

    if (IS_PLAYER_LOGGED_IN && playerInfo && authContainer) {
        try {
            const user = JSON.parse(playerInfo);
            authContainer.innerHTML = `
                <div class="user-info-pill">
                    <i class="fas fa-user-circle"></i>
                    <span>${escapeHTML(user.username)}</span>
                    <button onclick="logout()" class="logout-btn-small" title="退出登录">
                        <i class="fas fa-sign-out-alt"></i>
                    </button>
                </div>`;
        } catch (e) {
            // 如果解析用户信息失败，清空本地存储并显示登录按钮
            localStorage.clear();
            showLoginButton();
        }
    } else {
        showLoginButton();
    }
}

/**
 * 处理用户登出操作。
 */
function logout() {
    localStorage.removeItem('playerAuthToken');
    localStorage.removeItem('playerInfo');
    alert('已成功退出！');
    window.location.reload();
}

/**
 * 根据登录状态更新工单提交表单的UI。
 */
function updateContactFormUI() {
    const contactForm = document.getElementById('contactForm');
    if (!contactForm) return;

    const playerMessageTextarea = document.getElementById('playerMessage');
    const contactSubmitButton = contactForm.querySelector('button[type="submit"]');

    if (!IS_PLAYER_LOGGED_IN) {
        if (playerMessageTextarea) {
            playerMessageTextarea.disabled = true;
            playerMessageTextarea.placeholder = '请先登录，才能提交工-单。';
        }
        if (contactSubmitButton) {
            contactSubmitButton.disabled = true;
        }
    }
}

/**
 * 处理工单表单的提交事件。
 * @param {Event} e - 表单提交事件
 */
async function handleContactSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const messageDiv = document.getElementById('formMessage');
    const submitButton = form.querySelector('button[type="submit"]');
    const playerMessage = document.getElementById('playerMessage').value.trim();

    if (!playerMessage) {
        messageDiv.textContent = '消息内容不能为空！';
        messageDiv.style.color = '#e74c3c';
        return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在发送...';
    messageDiv.textContent = '';

    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PLAYER_AUTH_TOKEN}`
            },
            body: JSON.stringify({ message: playerMessage })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || '发生未知错误');
        }
        messageDiv.textContent = '消息发送成功！管理员将会尽快处理。';
        messageDiv.style.color = '#2ecc71';
        form.reset();
    } catch (error) {
        messageDiv.textContent = `发送失败: ${error.message}`;
        messageDiv.style.color = '#e74c3c';
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '发送消息';
    }
}

// --- 5. 辅助工具函数 ---

/**
 * 对HTML特殊字符进行转义，防止XSS攻击。
 * @param {string} str - 需要转义的字符串
 * @returns {string} - 转义后的安全字符串
 */
function escapeHTML(str) {
    if (typeof str !== 'string' && str !== null && str !== undefined) {
        str = str.toString();
    }
    if (!str) return '';
    return str.replace(/[&<>"']/g, match => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[match]));
}