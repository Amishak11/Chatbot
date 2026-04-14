const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const documentTitle = document.getElementById('chatTitle');
const historyList = document.getElementById('historyList');
const newChatBtn = document.getElementById('newChatBtn');
const nlpStatus = document.getElementById('nlpStatus');

let currentSessionId = generateUUID();
let chatHistory = {};

marked.setOptions({
    breaks: true,
    gfm: true
});

// Init sequence
window.onload = async () => {
    await fetchHistory();
    renderSidebar();
}

newChatBtn.addEventListener('click', () => {
    currentSessionId = generateUUID();
    clearChatUI();
    documentTitle.innerText = "New Sparkle Session";
    renderSidebar(); // Unselects active
});

async function fetchHistory() {
    try {
        chatHistory = await eel.get_all_chats()();
    } catch(e) {
        console.error("Could not load history", e);
    }
}

function renderSidebar() {
    historyList.innerHTML = '';
    
    // Sort by timestamp descending
    const sortedIds = Object.keys(chatHistory).sort((a,b) => {
        return new Date(chatHistory[b].timestamp) - new Date(chatHistory[a].timestamp);
    });

    sortedIds.forEach(id => {
        const data = chatHistory[id];
        const title = data.title || "New Sparkle";
        const dateObj = new Date(data.timestamp);
        const dateStr = dateObj.toLocaleDateString() + " " + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        const item = document.createElement('div');
        item.className = 'history-item';
        if (id === currentSessionId) item.classList.add('active');
        
        item.innerHTML = `
            <div class="history-item-content">
                <div class="history-title">${title}</div>
                <div class="history-date">${dateStr}</div>
            </div>
            <button class="delete-btn" onclick="event.stopPropagation(); deleteChat('${id}')" title="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
            </button>
        `;

        item.addEventListener('click', () => loadChatSession(id));
        historyList.appendChild(item);
    });
}

function loadChatSession(id) {
    if (!chatHistory[id]) return;
    currentSessionId = id;
    documentTitle.innerText = chatHistory[id].title;
    
    clearChatUI(true); // Don't append default hello
    
    chatHistory[id].messages.forEach(msg => {
        appendMessage(msg.role, msg.text, false);
    });
    
    renderSidebar();
}

window.deleteChat = async function(id) {
    await eel.delete_chat(id)();
    delete chatHistory[id];
    if (id === currentSessionId) {
        newChatBtn.click();
    } else {
        renderSidebar();
    }
}

// Auto-resize textarea
userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

userInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    userInput.value = '';
    userInput.style.height = 'auto';

    // 1. Display User Message
    appendMessage('user', text);
    
    // 2. Save User Message Local+Backend
    saveToMemory(currentSessionId, 'user', text);
    await eel.save_chat_message(currentSessionId, 'user', text)();
    
    if (documentTitle.innerText === "New Sparkle Session") {
        documentTitle.innerText = text.length > 30 ? text.substring(0, 30) + '...' : text;
        renderSidebar();
    }

    // 3. Status updates
    nlpStatus.style.opacity = '1';
    nlpStatus.innerHTML = "<span style='color: var(--secondary-color)'>Consulting sparkling intelligence...</span>";

    const typingElement = addTypingIndicator();

    try {
        // Call Python Backend
        const response = await eel.generate_response(currentSessionId, text)();
        
        typingElement.remove();
        
        // Appending text exactly as received
        appendMessage('model', response);
        
        // Save AI response Local+Backend
        saveToMemory(currentSessionId, 'model', response);
        await eel.save_chat_message(currentSessionId, 'model', response)();
        
        nlpStatus.innerHTML = "<span style='color: #10b981'>Sparkle received! ✨</span>";
        setTimeout(() => { nlpStatus.style.opacity = '0'; }, 3000);
        
    } catch (error) {
        typingElement.remove();
        appendMessage('model', "Oopsie! I stumbled on an error in the backend!");
        console.error(error);
        nlpStatus.innerHTML = "<span style='color: #ef4444'>Connection glitch! 💢</span>";
    }
}

function appendMessage(role, text, animate = true) {
    // Map role 'model' to 'ai' class for styling
    const cssRole = role === 'model' ? 'ai' : 'user';
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${cssRole}-message`;
    if (!animate) msgDiv.style.animation = 'none';

    const avatarDiv = document.createElement('div');
    avatarDiv.className = `avatar ${cssRole}-avatar`;
    if (cssRole === 'ai') {
        avatarDiv.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10H12Z"/></svg>';
    } else {
        avatarDiv.textContent = '🎀'; // Using a cute emoji for user avatar
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (cssRole === 'ai') {
        // Render Markdown securely
        const rawHTML = marked.parse(text);
        contentDiv.innerHTML = DOMPurify.sanitize(rawHTML);
    } else {
        const p = document.createElement('p');
        p.textContent = text;
        contentDiv.appendChild(p);
    }

    msgDiv.appendChild(avatarDiv);
    msgDiv.appendChild(contentDiv);

    chatArea.appendChild(msgDiv);
    scrollToBottom();
}

function addTypingIndicator() {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', 'ai-message', 'typing-indicator-container');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar', 'ai-avatar');
    avatarDiv.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10H12Z"/></svg>';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content', 'typing-indicator');
    contentDiv.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';

    msgDiv.appendChild(avatarDiv);
    msgDiv.appendChild(contentDiv);

    chatArea.appendChild(msgDiv);
    scrollToBottom();
    return msgDiv;
}

function saveToMemory(sessionId, role, text) {
    if (!chatHistory[sessionId]) {
        chatHistory[sessionId] = {
            title: text.length > 30 ? text.substring(0,30) + '...' : text,
            timestamp: new Date().toISOString(),
            messages: []
        };
    }
    chatHistory[sessionId].messages.push({ role, text, timestamp: new Date().toISOString() });
    chatHistory[sessionId].timestamp = new Date().toISOString(); // update latest
}

function clearChatUI(emptyOnly = false) {
    chatArea.innerHTML = '';
    if (!emptyOnly) {
        const helloHtml = `
        <div class="message ai-message" style="animation: none">
            <div class="avatar ai-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10H12Z"/></svg>
            </div>
            <div class="message-content">
                <p>Hey, your personal AI chatbot here, how can I help you?</p>
            </div>
        </div>`;
        chatArea.innerHTML = helloHtml;
    }
}

function scrollToBottom() {
    chatArea.scrollTop = chatArea.scrollHeight;
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
