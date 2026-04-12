var AI_CONFIG = {
  API_KEY: 'YOUR_API_KEY',
  SECRET_KEY: 'YOUR_SECRET_KEY',
  API_URL: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions',
  MODEL: 'ERNIE-Bot-4.0',
  USE_MOCK: true // 使用模拟数据，无需API密钥
};

var accessToken = null;

// 模拟回复数据
var MOCK_RESPONSES = [
  {
    keywords: ['你好', '您好', 'hi', 'hello'],
    responses: [
      '你好！我是传统色彩数字工坊的AI助手，有什么可以帮助您的吗？',
      '您好！欢迎使用传统色彩数字工坊，请问有什么可以为您解答的问题？',
      'Hello！我是AI助手，很高兴为您服务。'
    ]
  },
  {
    keywords: ['色彩', '颜色', '搭配'],
    responses: [
      '传统色彩是中国文化的重要组成部分，常见的传统色彩包括朱砂红、黛蓝、月白等。色彩搭配建议：暖色调搭配和谐，冷色调营造宁静，对比色增加活力。',
      '中国传统色彩有着丰富的文化内涵，如红色象征喜庆，青色代表生机，黄色寓意尊贵。搭配时可以参考传统配色方案，如红配金、青配白等。',
      '传统色彩搭配注重和谐统一，可以参考《诗经》中的色彩描述，或者传统绘画中的配色技巧。'
    ]
  },
  {
    keywords: ['染色', '工坊', '怎么用'],
    responses: [
      '染色工坊使用方法：1. 选择基础图案模板 2. 从色彩库中选择传统颜色 3. 调整染色强度和效果 4. 保存或分享您的作品。',
      '在染色工坊中，您可以尝试不同的传统色彩组合，还可以调整染色的深浅程度，创造出独特的传统风格作品。',
      '染色工坊支持多种传统纹样和颜色，您可以根据自己的喜好进行创作，体验传统色彩的魅力。'
    ]
  },
  {
    keywords: ['文化', '传统', '历史'],
    responses: [
      '中国传统色彩文化历史悠久，起源于新石器时代，发展于商周时期，成熟于唐宋，传承至今。每种颜色都有其特定的文化内涵和象征意义。',
      '传统色彩不仅是视觉元素，更是文化符号。例如，黄色在古代象征皇权，青色代表东方和生机，红色象征喜庆和吉祥。',
      '传统色彩的命名富有诗意，如天水碧、远山黛、胭脂红等，体现了中国人对自然和美的独特感悟。'
    ]
  },
  {
    keywords: ['作品', '评分', '评价'],
    responses: [
      '您的作品色彩搭配和谐，传统元素运用得当，整体效果出色。建议可以尝试更多传统色彩的组合，进一步提升作品的文化内涵。',
      '作品的色彩选择符合传统美学，构图合理，展现了传统色彩的魅力。继续保持这种创作风格！',
      '您的作品融合了现代设计与传统色彩，既有创新又不失传统韵味，非常出色。'
    ]
  },
  {
    keywords: ['素材', '图片', '上传'],
    responses: [
      '您可以在管理员素材页面上传新的染色素材，支持各种传统纹样和图案。上传时可以添加分类标签，方便用户查找和使用。',
      '素材上传建议：选择清晰的图片，添加准确的分类标签，这样用户可以更容易找到和使用您上传的素材。',
      '好的素材对于染色创作非常重要，您可以上传各种传统纹样、自然元素等素材，丰富工坊的素材库。'
    ]
  },
  {
    keywords: ['排行榜', '点赞', '热度'],
    responses: [
      '热度排行榜展示了用户作品的受欢迎程度，按点赞数从高到低排序。您可以通过创作优质作品获得更多点赞，提升排名。',
      '排行榜是展示优秀作品的平台，鼓励用户创作更多优质的传统色彩作品。您的作品如果获得足够多的点赞，就有机会登上排行榜。',
      '排行榜每小时更新一次，展示当前最受欢迎的作品。努力创作，争取上榜吧！'
    ]
  },
  {
    keywords: ['管理员', '权限', '功能'],
    responses: [
      '管理员拥有查看统计数据、管理用户评论、上传素材、使用AI评分等权限。您可以通过左侧菜单访问各项管理功能。',
      '管理员功能包括数据统计、评论监管、素材管理、AI评分和热度排行等。这些功能帮助您更好地管理和运营工坊。',
      '作为管理员，您可以查看系统运行状态，管理用户内容，优化工坊体验，为用户提供更好的服务。'
    ]
  }
];

function getMockResponse(prompt) {
  for (var i = 0; i < MOCK_RESPONSES.length; i++) {
    var mock = MOCK_RESPONSES[i];
    for (var j = 0; j < mock.keywords.length; j++) {
      if (prompt.includes(mock.keywords[j])) {
        var responses = mock.responses;
        return responses[Math.floor(Math.random() * responses.length)];
      }
    }
  }
  // 默认回复
  var defaultResponses = [
    '感谢您的问题！传统色彩是中国文化的瑰宝，值得我们深入了解和传承。',
    '这个问题很有意义。传统色彩不仅是视觉艺术，更是文化传承的重要载体。',
    '传统色彩工坊致力于推广中国传统色彩文化，希望能为您提供更多有价值的内容。',
    '您的问题很有趣！传统色彩文化博大精深，我们可以一起探索更多。',
    '感谢您对传统色彩的关注！如果您有任何其他问题，随时可以问我。'
  ];
  return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

async function getAccessToken() {
  if (accessToken) return accessToken;
  
  try {
    var response = await fetch('https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=' + AI_CONFIG.API_KEY + '&client_secret=' + AI_CONFIG.SECRET_KEY);
    var data = await response.json();
    accessToken = data.access_token;
    return accessToken;
  } catch (error) {
    console.error('获取access_token失败:', error);
    throw new Error('AI服务连接失败');
  }
}

async function callAI(prompt, context) {
  // 使用模拟数据
  if (AI_CONFIG.USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(getMockResponse(prompt));
      }, 1000);
    });
  }
  
  try {
    var token = await getAccessToken();
    
    var messages = [];
    if (context) {
      messages.push({role: 'system', content: context});
    }
    messages.push({role: 'user', content: prompt});
    
    var response = await fetch(AI_CONFIG.API_URL + '?access_token=' + token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: messages,
        temperature: 0.7,
        max_output_tokens: 1000
      })
    });
    
    var data = await response.json();
    
    if (data.error_code) {
      throw new Error(data.error_msg || 'AI服务错误');
    }
    
    return data.result || '抱歉，我无法回答这个问题。';
  } catch (error) {
    console.error('AI调用失败:', error);
    // 调用失败时使用模拟数据
    return getMockResponse(prompt);
  }
}

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
    #ai-chat-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      font-family: "Microsoft YaHei", "PingFang SC", serif;
    }
    
    .ai-chat-button {
      background: linear-gradient(135deg, #b17a54 0%, #8c5c3b 100%);
      color: white;
      padding: 15px 25px;
      border-radius: 50px;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(177, 122, 84, 0.4);
      font-size: 16px;
      font-weight: bold;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .ai-chat-button:hover {
      transform: translateY(-3px);
      box-shadow: 0 6px 20px rgba(177, 122, 84, 0.6);
    }
    
    .ai-chat-window {
      position: absolute;
      bottom: 70px;
      right: 0;
      width: 380px;
      height: 500px;
      background: rgba(255, 250, 245, 0.98);
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      border: 1px solid #d4b2a2;
      display: none;
      flex-direction: column;
      backdrop-filter: blur(10px);
    }
    
    .ai-chat-window.active {
      display: flex;
    }
    
    .ai-chat-header {
      background: linear-gradient(135deg, #b17a54 0%, #8c5c3b 100%);
      color: white;
      padding: 15px 20px;
      border-radius: 16px 16px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .ai-chat-title {
      font-size: 18px;
      font-weight: bold;
    }
    
    .ai-chat-close {
      background: none;
      border: none;
      color: white;
      font-size: 28px;
      cursor: pointer;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background 0.3s;
    }
    
    .ai-chat-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    .ai-chat-messages {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    
    .ai-message {
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.5;
      animation: slideIn 0.3s ease;
    }
    
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .ai-message.user {
      background: #b17a54;
      color: white;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    
    .ai-message.ai {
      background: #fffaf5;
      color: #7a513c;
      align-self: flex-start;
      border: 1px solid #e2c9b8;
      border-bottom-left-radius: 4px;
    }
    
    .ai-message.loading {
      background: #f0e6d6;
      color: #8c5c3b;
      align-self: flex-start;
      border: 1px dashed #d4b2a2;
    }
    
    .ai-chat-input-area {
      padding: 15px 20px;
      border-top: 1px solid #e2c9b8;
      display: flex;
      gap: 10px;
    }
    
    #aiChatInput {
      flex: 1;
      padding: 12px 15px;
      border: 1px solid #d4b2a2;
      border-radius: 8px;
      background: #fffaf5;
      color: #5a3c2c;
      font-size: 14px;
      resize: none;
      height: 45px;
      outline: none;
      font-family: inherit;
    }
    
    #aiChatInput:focus {
      border-color: #b17a54;
      box-shadow: 0 0 0 3px rgba(177, 122, 84, 0.1);
    }
    
    .ai-chat-send {
      background: #b17a54;
      color: white;
      border: none;
      padding: 0 25px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
      transition: all 0.3s;
    }
    
    .ai-chat-send:hover {
      background: #8c5c3b;
      transform: translateY(-2px);
    }
    
    .ai-chat-send:disabled {
      background: #a87f61;
      cursor: not-allowed;
      transform: none;
    }
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
    var response = await callAI(message, '你是一个传统色彩数字工坊的AI助手，专门帮助用户了解中国传统色彩、染色技术、文化内涵等问题。请用友好、专业的语气回答，回答要简洁明了。');
    
    loadingDiv.remove();
    addAIMessage(response, 'ai');
  } catch (error) {
    loadingDiv.remove();
    addAIMessage('抱歉，AI服务暂时不可用。请稍后再试或联系管理员。', 'ai');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  initAIChat();
});