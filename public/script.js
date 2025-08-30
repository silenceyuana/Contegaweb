// =================================================================
// script.js - 最终完整功能版本 (Final Complete Version)
// =================================================================

document.addEventListener('DOMContentLoaded', function() {
    
    // --- 移动端导航菜单切换 ---
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            menuToggle.classList.toggle('active');
        });
    }

    // --- 平滑滚动到锚点 ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId.length > 1) {
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    });
    
    // --- 滚动时添加导航栏阴影 ---
    window.addEventListener('scroll', function() {
        const header = document.querySelector('header');
        if (header) {
            header.style.boxShadow = window.scrollY > 50 ? '0 2px 20px rgba(0, 0, 0, 0.3)' : 'none';
        }
    });

    // --- 服务器状态检查 (使用第三方API) ---
    const serverStatusContainer = document.querySelector('.server-status-container');
    if (serverStatusContainer) {
        checkServerStatus();
        setInterval(checkServerStatus, 60000); // 每分钟检查一次
    }

    // --- 工单表单逻辑 ---
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        // 根据登录状态更新工单区域UI
        updateContactFormUI();
        // 绑定提交事件
        contactForm.addEventListener('submit', handleContactSubmit);
    }
    
    // --- 更新导航栏的登录状态 ---
    updateNavbar();

    // --- 页面元素滚动进入视图时的动画触发逻辑 ---
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
            }
        });
    }, {
        threshold: 0.1 // 元素进入可视区域10%时触发
    });

    // 选择所有需要应用动画的元素
    const animatedElements = document.querySelectorAll(
        '.hero-content h1, .hero-subtitle, .cta-button, .server-status-container, ' +
        '.about h2, .about-text, .about-image, ' +
        '.rules-preview h2, .rule-card, ' +
        '.commands h2, .command-category, .command-item, ' +
        '.contact h2, .contact-form'
    );
    // 监听这些元素
    animatedElements.forEach(el => observer.observe(el));
});

/**
 * 检查并更新服务器状态显示
 */
async function checkServerStatus() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const playerCount = document.querySelector('.player-count');
    
    // 你的服务器地址
    const serverAddress = 'mc.contega.top'; 

    try {
        const response = await fetch(`https://api.mcsrvstat.us/3/${serverAddress}`);
        const data = await response.json();
        
        if (data.online) {
            statusDot.parentElement.className = 'server-status online';
            statusText.textContent = '在线';
            playerCount.textContent = `${data.players.online}/${data.players.max} 玩家在线`;
        } else {
            statusDot.parentElement.className = 'server-status offline';
            statusText.textContent = '离线';
            playerCount.textContent = '服务器当前离线';
        }
    } catch (error) {
        console.error('检查服务器状态失败:', error);
        statusText.textContent = '状态未知';
        playerCount.textContent = '无法获取服务器信息';
    }
}

/**
 * 【已更新】根据登录状态更新工单表单的可用性
 */
function updateContactFormUI() {
    const playerToken = localStorage.getItem('playerAuthToken');
    const contactForm = document.getElementById('contactForm');
    const playerMessageTextarea = document.getElementById('playerMessage');
    const contactSubmitButton = contactForm.querySelector('button[type="submit"]');

    if (!playerToken) {
        // 如果未登录，禁用表单
        if(playerMessageTextarea) playerMessageTextarea.disabled = true;
        if(contactSubmitButton) contactSubmitButton.disabled = true;
        if(playerMessageTextarea) playerMessageTextarea.placeholder = '请先登录，才能提交工单。';
    }
}

/**
 * 【已更新】处理联系表单（工单）的提交
 * @param {Event} e 表单提交事件
 */
async function handleContactSubmit(e) {
    e.preventDefault();

    const token = localStorage.getItem('playerAuthToken');
    if (!token) {
        alert('请先登录后再提交工单！');
        return;
    }

    const form = e.target;
    const messageDiv = document.getElementById('formMessage');
    const submitButton = form.querySelector('button[type="submit"]');

    const playerMessage = document.getElementById('playerMessage').value.trim();

    if (!playerMessage) {
        messageDiv.textContent = '消息内容不能为空！';
        messageDiv.style.color = '#e74c3c';
        return;
    }

    // 构造要发送到后端的数据，现在只需要 message
    const formData = {
        message: playerMessage
    };

    submitButton.disabled = true;
    submitButton.textContent = '正在发送...';
    messageDiv.textContent = '';

    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // **核心改动**: 添加认证头
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                throw new Error('登录已过期或无效，请重新登录。');
            }
            throw new Error(result.error || '发生未知错误，请稍后再试。');
        }

        messageDiv.textContent = '消息发送成功！感谢您的反馈。';
        messageDiv.style.color = '#2ecc71';
        form.reset();

    } catch (error) {
        console.error('表单提交错误:', error);
        messageDiv.textContent = `发送失败: ${error.message}`;
        messageDiv.style.color = '#e74c3c';
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '发送消息';
    }
}

/**
 * 【新增】检查登录状态并更新导航栏UI
 */
function updateNavbar() {
    const authContainer = document.getElementById('auth-container');
    const token = localStorage.getItem('playerAuthToken');
    const playerInfo = localStorage.getItem('playerInfo');

    const showLoginButton = () => {
        if (authContainer) {
            authContainer.innerHTML = '<a href="login.html" class="nav-link"><b>登录</b></a>';
        }
    };

    if (token && playerInfo && authContainer) {
        try {
            const user = JSON.parse(playerInfo);
            authContainer.innerHTML = `
                <div class="user-info-pill">
                    <i class="fas fa-user-circle"></i>
                    <span>${user.username}</span>
                    <button onclick="logout()" class="logout-btn-small" title="退出登录">
                        <i class="fas fa-sign-out-alt"></i>
                    </button>
                </div>
            `;
        } catch (e) {
            console.error('解析用户信息失败:', e);
            // 如果解析出错，清除损坏的数据并显示登录按钮
            localStorage.removeItem('playerAuthToken');
            localStorage.removeItem('playerInfo');
            showLoginButton();
        }
    } else {
        showLoginButton();
    }
}

/**
 * 【新增】用户退出登录
 */
function logout() {
    // 移除本地存储中的认证信息
    localStorage.removeItem('playerAuthToken');
    localStorage.removeItem('playerInfo');
    
    alert('已成功退出！');
    
    // 刷新页面以应用UI更改
    window.location.reload();
}