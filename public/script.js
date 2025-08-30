// =================================================================
// script.js - 最终功能版本
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
                document.querySelector(targetId).scrollIntoView({
                    behavior: 'smooth'
                });
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

    // --- 联系表单提交逻辑 ---
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactSubmit);
    }
});

/**
 * 检查并更新服务器状态显示
 */
async function checkServerStatus() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const playerCount = document.querySelector('.player-count');
    
    // 你的服务器地址，如果更换了请在这里修改
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
 * 处理联系表单（工单）的提交
 * @param {Event} e 表单提交事件
 */
async function handleContactSubmit(e) {
    e.preventDefault(); // 阻止表单默认的刷新页面的行为

    const form = e.target;
    const messageDiv = document.getElementById('formMessage');
    const submitButton = form.querySelector('button[type="submit"]');

    // 获取表单数据
    const playerName = document.getElementById('playerName').value.trim();
    const playerEmail = document.getElementById('playerEmail').value.trim();
    const playerMessage = document.getElementById('playerMessage').value.trim();

    // 简单验证
    if (!playerName || !playerEmail || !playerMessage) {
        messageDiv.textContent = '所有字段都必须填写！';
        messageDiv.style.color = '#e74c3c';
        return;
    }

    // 构造要发送到后端的数据，键名必须与后端 server.js 中期待的一致
    const formData = {
        player_name: playerName,
        email: playerEmail,
        message: playerMessage
    };

    // 禁用按钮防止重复提交
    submitButton.disabled = true;
    submitButton.textContent = '正在发送...';
    messageDiv.textContent = '';

    try {
        // 发送异步请求到后端 API
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (!response.ok) {
            // 如果服务器返回错误 (状态码 4xx 或 5xx)
            throw new Error(result.error || '发生未知错误，请稍后再试。');
        }

        // 成功处理
        messageDiv.textContent = '消息发送成功！感谢您的反馈。';
        messageDiv.style.color = '#2ecc71';
        form.reset(); // 清空表单

    } catch (error) {
        // 捕获网络错误或服务器返回的错误
        console.error('表单提交错误:', error);
        messageDiv.textContent = `发送失败: ${error.message}`;
        messageDiv.style.color = '#e74c3c';
    } finally {
        // 无论成功或失败，最后都恢复按钮状态
        submitButton.disabled = false;
        submitButton.textContent = '发送消息';
    }
}
// =================================================================
// 新增：页面元素滚动进入视图时的动画触发逻辑
// =================================================================
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