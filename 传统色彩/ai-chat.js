// ai-chat.js —— 前端直连AI，无需后端配置
(function () {
    // 使用免费、免密钥的 Pollinations.AI 服务
    const AI_API_URL = 'https://text.pollinations.ai/';

    // 色彩搭配专家提示词（作为消息前缀）
    const SYSTEM_PREFIX = '你是一位中国传统色彩搭配专家。请为用户提供专业的色彩搭配建议，回答需包含具体色名和十六进制色值。回答简洁实用，每次最多推荐3种搭配方案。用户的问题是：';

    // 创建并注入聊天组件（界面代码保持原样，只修改核心调用函数）
    async function callAI(prompt) {
        try {
            // 拼接完整的提示词
            const fullPrompt = SYSTEM_PREFIX + prompt;
            // 调用免费 AI 接口
            const response = await fetch(AI_API_URL + encodeURIComponent(fullPrompt));
            const text = await response.text();
            return text || '抱歉，AI 没有返回有效回复，请稍后再试。';
        } catch (error) {
            console.error('AI 调用失败:', error);
            return '抱歉，AI 服务暂时不可用，请稍后重试。';
        }
    }

    // ========== 以下为界面交互逻辑（与原版完全一致，无需修改） ==========
    function createAIChatWidget() {
        var widget = document.createElement('div');
        widget.id = 'ai-chat-widget';
        widget.innerHTML = `
            <div class="ai-chat-button" onclick="toggleAIChat()">
                <span>🤖 AI助手</span>
            </div>
            <div class="ai-chat-window" id="aiChatWindow">
                <div class="ai-chat-header">
                    <div class="ai-chat-title">AI智能助手</div>
                    <button class="ai-chat-close" onclick="toggleAIChat()">×</button>
                </div>
                <div class="ai-chat-messages" id="aiChatMessages"></div>
                <div class="ai-chat-input-area">
                    <textarea id="aiChatInput" placeholder="请输入您的问题..." onkeydown="handleAIChatKeydown(event)"></textarea>
                    <button class="ai-chat-send" onclick="sendAIMessage()">发送</button>
                </div>
            </div>
        `;
        return widget;
    }

    function initAIChat() {
        if (document.getElementById('ai-chat-widget')) return;
        var widget = createAIChatWidget();
        document.body.appendChild(widget);

        var style = document.createElement('style');
        style.textContent = `
            #ai-chat-widget { position: fixed; bottom: 20px; right: 20px; z-index: 9999; font-family: "Microsoft YaHei", sans-serif; }
            .ai-chat-button { background: linear-gradient(135deg, #b17a54 0%, #8c5c3b 100%); color: white; padding: 15px 25px; border-radius: 50px; cursor: pointer; box-shadow: 0 4px 15px rgba(177,122,84,0.4); font-size: 16px; font-weight: bold; transition: all 0.3s; display: flex; align-items: center; gap: 8px; }
            .ai-chat-button:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(177,122,84,0.6); }
            .ai-chat-window { position: absolute; bottom: 70px; right: 0; width: 380px; height: 500px; background: rgba(255,250,245,0.98); border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); border: 1px solid #d4b2a2; display: none; flex-direction: column; backdrop-filter: blur(10px); }
            .ai-chat-window.active { display: flex; }
            .ai-chat-header { background: linear-gradient(135deg, #b17a54 0%, #8c5c3b 100%); color: white; padding: 15px 20px; border-radius: 16px 16px 0 0; display: flex; justify-content: space-between; align-items: center; }
            .ai-chat-title { font-size: 18px; font-weight: bold; }
            .ai-chat-close { background: none; border: none; color: white; font-size: 28px; cursor: pointer; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background 0.3s; }
            .ai-chat-close:hover { background: rgba(255,255,255,0.2); }
            .ai-chat-messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; }
            .ai-message { max-width: 85%; padding: 12px 16px; border-radius: 12px; font-size: 14px; line-height: 1.5; animation: slideIn 0.3s; }
            @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            .ai-message.user { background: #b17a54; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
            .ai-message.ai { background: #fffaf5; color: #7a513c; align-self: flex-start; border: 1px solid #e2c9b8; border-bottom-left-radius: 4px; }
            .ai-message.loading { background: #f0e6d6; color: #8c5c3b; align-self: flex-start; border: 1px dashed #d4b2a2; }
            .ai-chat-input-area { padding: 15px 20px; border-top: 1px solid #e2c9b8; display: flex; gap: 10px; }
            #aiChatInput { flex: 1; padding: 12px 15px; border: 1px solid #d4b2a2; border-radius: 8px; background: #fffaf5; color: #5a3c2c; font-size: 14px; resize: none; height: 45px; outline: none; }
            #aiChatInput:focus { border-color: #b17a54; box-shadow: 0 0 0 3px rgba(177,122,84,0.1); }
            .ai-chat-send { background: #b17a54; color: white; border: none; padding: 0 25px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold; transition: all 0.3s; }
            .ai-chat-send:hover { background: #8c5c3b; transform: translateY(-2px); }
        `;
        document.head.appendChild(style);
    }

    function toggleAIChat() {
        var chatWindow = document.getElementById('aiChatWindow');
        chatWindow.classList.toggle('active');
        if (chatWindow.classList.contains('active')) {
            document.getElementById('aiChatInput').focus();
        }
    }

    function handleAIChatKeydown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendAIMessage();
        }
    }

    function addAIMessage(content, type) {
        var messagesContainer = document.getElementById('aiChatMessages');
        var messageDiv = document.createElement('div');
        messageDiv.className = 'ai-message ' + type;
        messageDiv.textContent = content;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async function sendAIMessage() {
        var input = document.getElementById('aiChatInput');
        var message = input.value.trim();
        if (!message) return;

        addAIMessage(message, 'user');
        input.value = '';

        var loadingDiv = document.createElement('div');
        loadingDiv.className = 'ai-message loading';
        loadingDiv.textContent = 'AI正在思考...';
        document.getElementById('aiChatMessages').appendChild(loadingDiv);

        try {
            var response = await callAI(message);
            loadingDiv.remove();
            addAIMessage(response, 'ai');
        } catch (error) {
            loadingDiv.remove();
            addAIMessage('抱歉，AI服务暂时不可用。', 'ai');
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        initAIChat();
    });

    // 挂载全局函数
    window.toggleAIChat = toggleAIChat;
    window.handleAIChatKeydown = handleAIChatKeydown;
    window.sendAIMessage = sendAIMessage;
})();