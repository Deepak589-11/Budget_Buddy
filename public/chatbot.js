const chatWindow = document.getElementById('chat-window');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const suggestedQuestions = document.getElementById('suggested-questions');

const FRIEND_NAME = "Finn";

function appendMessage(text, who = 'bot', insights = [], type = 'normal') {
    const el = document.createElement('div');
    el.className = `msg ${who} ${type}`;
    
    let insightHTML = '';
    if (insights && insights.length > 0) {
        insightHTML = '<div class="insights">' + 
            insights.map(insight => 
                `<div class="insight"> ${insight.message}</div>`
            ).join('') + 
            '</div>';
    }

    const displayName = who === 'bot' ? FRIEND_NAME : 'You';
    
    el.innerHTML = `
        <div class="message-header">
            <span class="sender-name">${displayName}</span>
            ${who === 'bot' ? '<span class="friend-badge">🤝 Your Friend</span>' : ''}
        </div>
        <div class="message-body">${escapeHtml(text)}</div>
        ${insightHTML}
    `;
    
    chatWindow.appendChild(el);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return el;
}

function escapeHtml(s) { 
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); 
}

function showTyping() {
    const el = document.createElement('div');
    el.className = 'msg bot typing';
    el.innerHTML = `
        <div class="message-header">
            <span class="sender-name">${FRIEND_NAME}</span>
            <span class="friend-badge">🤝 Your Friend</span>
        </div>
        <div class="typing-indicator">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-text">Thinking about your money...</span>
        </div>
    `;
    chatWindow.appendChild(el);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return el;
}


function hideSuggestedQuestions() {
    suggestedQuestions.style.opacity = '0';
    setTimeout(() => {
        suggestedQuestions.style.display = 'none';
    }, 300);
}


async function sendMessage(message) {
    hideSuggestedQuestions();
    
    appendMessage(message, 'user');
    chatInput.value = '';

    const typingEl = showTyping();

    try {
        const res = await fetch('/api/chatbot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: message,
                userId: 'student-user'
            })
        });
        
        const data = await res.json();
        typingEl.remove();
        
        if (res.ok && data && data.reply) {
            appendMessage(
                data.reply, 
                'bot', 
                data.insights || [],
                data.type || 'normal'
            );
            
            addContextualActions(data.type, data.data);
        } else {
            appendMessage("Hmm, let me check that again. Sometimes even friends need a moment! 😊", 'bot');
        }
    } catch (err) {
        console.error('Chat error:', err);
        typingEl.remove();
        appendMessage("I'm having trouble connecting right now, but here's a quick tip: Review your last week of spending - you might spot easy savings! 💡", 'bot');
    }
}

function addContextualActions(responseType, data) {
    const actions = {
        spending_summary: [
            { text: 'Show categories', action: 'Show me my spending by category' },
            { text: 'Saving tips', action: 'How can I save more?' },
            { text: 'Add expense', action: 'I want to add an expense' }
        ],
        category_analysis: [
            { text: 'Biggest category', action: 'Where am I spending the most?' },
            { text: 'Saving tips', action: 'Give me saving advice' },
            { text: 'Set a budget', action: 'Help me set spending limits' }
        ],
        saving_tip: [
            { text: 'More tips', action: 'Give me another saving tip' },
            { text: 'Track spending', action: 'How much have I spent this month?' },
            { text: 'Easy savings', action: 'What are quick ways to save?' }
        ],
        general_advice: [
            { text: 'More advice', action: 'Give me more financial advice' },
            { text: 'My spending', action: 'How much have I spent?' },
            { text: 'Saving tips', action: 'How can I save money?' }
        ]
    };

    const quickActions = actions[responseType];
    if (quickActions) {
        const actionsEl = document.createElement('div');
        actionsEl.className = 'quick-actions';
        
        quickActions.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'quick-action';
            btn.textContent = item.text;
            btn.addEventListener('click', () => sendMessage(item.action));
            actionsEl.appendChild(btn);
        });
        
        chatWindow.appendChild(actionsEl);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
}

function init() {
    setTimeout(() => {
        appendMessage(
            "Hey there! I'm Finn, your financial friend! 🤝 I'm here to help you understand your money, find saving opportunities, and make finance fun. What would you like to chat about today?",
            'bot',
            [],
            'welcome'
        );
    }, 1000);
}

function setupQuickExpense() {
    const expenseBtn = document.createElement('button');
    expenseBtn.className = 'quick-expense-btn';
    expenseBtn.innerHTML = '💸 Add Quick Expense';
    expenseBtn.addEventListener('click', showExpenseModal);
    
    
    const chatContainer = document.querySelector('.chat-app');
    const chatForm = document.querySelector('.chat-form');
    chatContainer.insertBefore(expenseBtn, chatForm);
}

function showExpenseModal() {
    const modal = document.createElement('div');
    modal.className = 'expense-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Add Quick Expense</h3>
            <input type="number" placeholder="Amount" class="expense-amount" step="0.01" min="0.01">
            <select class="expense-category">
                <option value="Food">Food</option>
                <option value="Transport">Transport</option>
                <option value="Entertainment">Entertainment</option>
                <option value="Shopping">Shopping</option>
                <option value="Bills">Bills</option>
                <option value="Other">Other</option>
            </select>
            <input type="text" placeholder="Description (optional)" class="expense-desc">
            <div class="modal-actions">
                <button class="btn-cancel">Cancel</button>
                <button class="btn-add">Add Expense</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    
    modal.querySelector('.btn-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('.btn-add').addEventListener('click', addQuickExpense);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function addQuickExpense() {
    const modal = document.querySelector('.expense-modal');
    const amount = modal.querySelector('.expense-amount').value;
    const category = modal.querySelector('.expense-category').value;
    const description = modal.querySelector('.expense-desc').value;
    
    if (!amount || parseFloat(amount) <= 0) {
        alert('Please enter a valid amount');
        return;
    }
    
    try {
        const res = await fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: parseFloat(amount),
                category: category,
                description: description || `Expense for ${category}`
            })
        });
        
        const data = await res.json();
        if (data.success) {
            appendMessage(`I added $${amount} for ${category} to your expenses! `, 'bot');
            modal.remove();
            
            
            setTimeout(() => {
                sendMessage('How am I doing with my spending?');
            }, 1500);
        } else {
            alert('Failed to add expense: ' + (data.error || 'Unknown error'));
        }
    } catch (err) {
        console.error('Expense error:', err);
        alert('Failed to add expense. Please try again.');
    }
}

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const txt = chatInput.value.trim();
    if (!txt) return;
    sendMessage(txt);
});

document.querySelectorAll('.suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
        const text = btn.innerText;
        sendMessage(text);
    });
});

document.addEventListener('DOMContentLoaded', () => {
    init();
    setupQuickExpense();
});