// Generate or retrieve a random ID for the client
let mySocketId = localStorage.getItem('chat_socket_id');
if (!mySocketId) {
    mySocketId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('chat_socket_id', mySocketId);
}

const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const fileInput = document.getElementById('fileInput');
const statusDiv = document.getElementById('status');
const userCountSpan = document.getElementById('userCount');
const emojiBtn = document.getElementById('emojiBtn'); // Added
const emojiPicker = document.getElementById('emojiPicker'); // Added

// Emoji List
const emojis = [
    "😀", "😂", "🥰", "😍", "😎", "😭", "😡", "👍", "👎", "👏", "🙏", "❤️", "💔", "🔥", "✨", "🎉",
    "🤔", "😅", "🙄", "🤫", "🤥", "😬", "🤮", "🤧", "😷", "🤒", "🤕", "🤢", "🥴", "🤤", "🤠", "🥳",
    "👀", "🧠", "🦷", "🦴", "🤝", "🤛", "🤜", "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤏", "✌️", "🤞",
    "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌"
];

// Populate Emoji Picker
emojis.forEach(emoji => {
    const span = document.createElement('span');
    span.textContent = emoji;
    span.classList.add('emoji-item');
    span.onclick = (e) => {
        e.stopPropagation();
        messageInput.value += emoji;
        // messageInput.focus(); // Removed to keep picker open
    };
    emojiPicker.appendChild(span);
});

// Toggle Emoji Picker
emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShowing = emojiPicker.classList.contains('show');
    if (!isShowing) {
        // Opening picker: hide keyboard
        messageInput.blur();
        emojiPicker.classList.add('show');
    } else {
        emojiPicker.classList.remove('show');
    }
});

// Close Picker on Outside Click
document.addEventListener('click', (e) => {
    if (!emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
        emojiPicker.classList.remove('show');
    }
});

// Hide picker when input is focused (Mobile behavior)
messageInput.addEventListener('focus', () => {
    emojiPicker.classList.remove('show');
});

// SSE Connection
let eventSource = null;
let myAssignedName = "Me"; // Will be updated by server

// Icons
const copyIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const downloadIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';

function getWebGLRenderer() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            }
        }
    } catch (e) { console.error('WebGL not supported', e); }
    return null;
}

async function detectDeviceName() {
    const ua = navigator.userAgent;

    // 1. Try Client Hints (Modern Android/Chrome)
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
        try {
            const uaData = await navigator.userAgentData.getHighEntropyValues(['model']);
            if (uaData.model) {
                return uaData.model; // e.g. "Pixel 6"
            }
        } catch (e) {
            console.warn('Client Hints failed', e);
        }
    }

    // 2. Try Regex for Android (Legacy)
    if (/Android/i.test(ua)) {
        const match = ua.match(/Android\s+[\d\.]+;\s*([^;]+)\s+Build/i);
        if (match && match[1]) {
            return match[1].trim();
        }
        return "Android Device";
    }

    // 3. iOS + WebGL Hint
    if (/iPad|iPhone|iPod/.test(ua)) {
        let base = "iOS Device";
        if (/iPad/.test(ua)) base = "iPad";
        if (/iPhone/.test(ua)) base = "iPhone";
        
        // Try to add Chipset info from GPU
        const renderer = getWebGLRenderer();
        if (renderer) {
            // e.g. "Apple A15 GPU"
            const match = renderer.match(/Apple A(\d+)/);
            if (match) {
                base += ` (A${match[1]})`;
            }
        }
        return base;
    }

    // 4. Desktop / Others
    if (/Windows/i.test(ua)) return "Windows PC";
    if (/Mac OS/i.test(ua)) return "Mac";
    if (/Linux/i.test(ua)) return "Linux PC";
    
    return "Unknown Device";
}

async function connectSSE() {
    const deviceName = await detectDeviceName();
    eventSource = new EventSource('/stream?name=' + encodeURIComponent(deviceName));

    eventSource.onopen = () => {
        statusDiv.classList.remove('disconnected');
        statusDiv.classList.add('connected');
        statusDiv.title = "Connected";
        console.log('Connected via SSE');
    };

    eventSource.onerror = (err) => {
        statusDiv.classList.remove('connected');
        statusDiv.classList.add('disconnected');
        statusDiv.title = "Disconnected";
        console.log('SSE connection lost. Reconnecting...', err);
    };

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'history') {
            data.messages.forEach(msg => appendMessage(msg));
        } else if (data.type === 'welcome') {
            myAssignedName = data.assigned_name;
            console.log('Assigned Name:', myAssignedName);
        } else if (data.type === 'user_count') {
            if (userCountSpan) {
                userCountSpan.innerText = `${data.count} Online`;
            }
        } else {
            appendMessage(data);
        }
    };
}

// Initial connection
connectSSE();

function scrollToBottom() {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendMessage(data) {
    const isSelf = data.sender_id === mySocketId;
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    msgDiv.classList.add(isSelf ? 'sent' : 'received');

    let innerHTML = '';
    
    // Sender Label
    // If it's self, show "Me", otherwise show the sender_name from data (or fallback)
    const senderNameDisplay = isSelf ? 'Me' : (data.sender_name || 'User ' + data.sender_id.substring(0, 4));
    const timestamp = data.timestamp || '';
    
    const senderHTML = `
        <div class="message-sender" style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
            <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">${escapeHtml(senderNameDisplay)}</span>
            <span style="font-size: 0.65rem; color: var(--text-secondary); opacity: 0.7;">${timestamp}</span>
        </div>`;

    if (data.type === 'text') {
        innerHTML = `
            ${senderHTML}
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <div class="message-content" style="flex: 1; word-break: break-word;">${escapeHtml(data.content)}</div>
                <div class="action-btn" onclick="copyText(this)" title="Copy" style="cursor:pointer; flex-shrink: 0;">${copyIcon}</div>
            </div>`;
    } else if (data.type === 'file') {
        let ext = data.filename.split('.').pop().toUpperCase();
        if (ext.length > 4) {
            ext = ext.substring(0, 4);
        }
        innerHTML = `
            ${senderHTML}
            <div class="file-message" style="display: flex; align-items: center; gap: 12px;">
                <div class="file-icon">${ext}</div>
                <div class="file-info" style="flex: 1; min-width: 0;">
                    <div class="file-name">${escapeHtml(data.filename)}</div>
                </div>
                <div class="action-btn" onclick="downloadFile('${data.url}', '${escapeHtml(data.filename)}')" title="Download" style="cursor:pointer; flex-shrink: 0;">${downloadIcon}</div>
            </div>`;
    }

    msgDiv.innerHTML = innerHTML;
    messagesDiv.appendChild(msgDiv);
    scrollToBottom();
}

window.downloadFile = function(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.copyText = function(btn) {
    const messageDiv = btn.closest('.message');
    const contentDiv = messageDiv.querySelector('.message-content');
    
    if (contentDiv) {
        const text = contentDiv.innerText;
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                showCopyFeedback(btn);
            }).catch(err => {
                console.warn('Clipboard API failed, trying fallback:', err);
                fallbackCopyText(text, btn);
            });
        } else {
            fallbackCopyText(text, btn);
        }
    }
}

function fallbackCopyText(text, btn) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showCopyFeedback(btn);
        } else {
            alert('Copy failed.');
        }
    } catch (err) {
        alert('Copy not supported.');
    }
    document.body.removeChild(textArea);
}

function showCopyFeedback(btn) {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span style="font-size:12px">✓</span>'; 
    setTimeout(() => {
        btn.innerHTML = originalHTML;
    }, 1500);
}

// Handle Send
async function sendMessage() {
    const content = messageInput.value.trim();
    if (content) {
        const payload = {
            content: content,
            sender_id: mySocketId,
            sender_name: myAssignedName
        };
        
        try {
            messageInput.value = '';
            await fetch('/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            console.error('Failed to send message:', error);
            alert('Failed to send message');
        }
    }
}

sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Handle File Upload
fileInput.addEventListener('change', () => {
    const files = fileInput.files;
    if (files.length > 0) {
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
        
        formData.append('socket_id', mySocketId);
        formData.append('sender_name', myAssignedName);

        // Show uploading indicator
        const loadingMsg = document.createElement('div');
        loadingMsg.classList.add('system-message');
        loadingMsg.innerText = `Uploading ${files.length} file(s)...`;
        messagesDiv.appendChild(loadingMsg);
        scrollToBottom();
        
        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            loadingMsg.remove();
            if (data.error) {
                alert('Upload failed: ' + data.error);
            }
        })
        .catch((error) => {
            loadingMsg.innerText = 'Upload failed.';
            console.error('Error:', error);
        });
        
        fileInput.value = ''; 
    }
});
