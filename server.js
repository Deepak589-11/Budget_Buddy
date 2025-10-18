const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'expenses.db');
const app = express();

if (!fs.existsSync(DB_FILE)) fs.closeSync(fs.openSync(DB_FILE, 'w'));

app.use(express.json()); 

app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) return console.error('DB open error', err.message);
});
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL
  )`);

  db.get('SELECT COUNT(*) as c FROM expenses', (err, row) => {
    if (err) return console.error(err);
    if (row && row.c === 0) {
      const stmt = db.prepare('INSERT INTO expenses(description,amount,category,date) VALUES (?,?,?,?)');
      const samples = [
        ['Groceries', 24.50, 'Food', '2025-07-10'],
        ['Bus ticket', 2.75, 'Transport', '2025-07-11'],
        ['Electricity bill', 60.00, 'Utilities', '2025-07-05'],
        ['Cinema', 12.00, 'Entertainment', '2025-08-01'],
        ['Lunch', 10.25, 'Food', '2025-08-03']
      ];
      samples.forEach(s => stmt.run(s[0], s[1], s[2], s[3]));
      stmt.finalize();
      console.log('Inserted sample data.');
    }
  });
});


function validateExpense(payload) {
  if (!payload) return 'Missing payload';
  const { description, amount, category, date } = payload;
  if (!description || String(description).trim() === '') return 'Description required';
  if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) return 'Amount must be a positive number';
  if (!category || String(category).trim() === '') return 'Category required';
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Date required (YYYY-MM-DD)';
  return null;
}


app.get('/api/expenses', (req, res) => {
  let sql = 'SELECT * FROM expenses';
  const filters = [];
  const params = [];
  if (req.query.category) {
    filters.push('category = ?'); params.push(req.query.category);
  }
  if (req.query.start) {
    filters.push('date >= ?'); params.push(req.query.start);
  }
  if (req.query.end) {
    filters.push('date <= ?'); params.push(req.query.end);
  }
  if (filters.length) sql += ' WHERE ' + filters.join(' AND ');
  sql += ' ORDER BY date DESC, id DESC';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/expenses', (req, res) => {
  const errMsg = validateExpense(req.body);
  if (errMsg) return res.status(400).json({ error: errMsg });

  const { description, amount, category, date } = req.body;
  const stmt = db.prepare('INSERT INTO expenses(description,amount,category,date) VALUES (?,?,?,?)');
  stmt.run(description.trim(), Number(amount), category.trim(), date, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    const id = this.lastID;
    db.get('SELECT * FROM expenses WHERE id = ?', [id], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json(row);
    });
  });
  stmt.finalize();
});

app.put('/api/expenses/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const errMsg = validateExpense(req.body);
  if (errMsg) return res.status(400).json({ error: errMsg });

  const { description, amount, category, date } = req.body;
  db.run(
    'UPDATE expenses SET description = ?, amount = ?, category = ?, date = ? WHERE id = ?',
    [description.trim(), Number(amount), category.trim(), date, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Expense not found' });
      db.get('SELECT * FROM expenses WHERE id = ?', [id], (err2, row) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json(row);
      });
    }
  );
});


app.delete('/api/expenses/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  db.run('DELETE FROM expenses WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Expense not found' });
    res.json({ success: true });
  });
});


app.get('/api/download', (req, res) => {
  db.all('SELECT * FROM expenses ORDER BY date DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const fields = ['id', 'description', 'amount', 'category', 'date'];
    const escapeCsv = v => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = fields.join(',') + '\n';
    const body = rows.map(r => fields.map(f => escapeCsv(r[f])).join(',')).join('\n');
    const csv = header + body;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
    res.send(csv);
  });
});

//  FINN CHATBOT 
const userProfiles = new Map();

class FinancialFriend {
    constructor(userId) {
        this.userId = userId;
        this.memory = {
            spendingHabits: {},
            goals: {},
            lastConversation: '',
            userPreferences: {}
        };
        this.loadMemory();
    }

    loadMemory() {
        if (userProfiles.has(this.userId)) {
            this.memory = userProfiles.get(this.userId);
        }
    }

    saveMemory() {
        userProfiles.set(this.userId, this.memory);
    }

    async analyzeSpending() {
        return new Promise((resolve, reject) => {
            const insights = [];
            
            const currentMonth = new Date().toISOString().slice(0, 7);
            db.all(
                `SELECT category, SUM(amount) as total 
                 FROM expenses 
                 WHERE substr(date,1,7) = ? 
                 GROUP BY category`,
                [currentMonth],
                (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    let totalSpent = 0;
                    const categorySpending = {};

                    if (rows) {
                        rows.forEach(row => {
                            totalSpent += row.total;
                            categorySpending[row.category] = row.total;
                        });
                    }

                    if (totalSpent > 0) {
                        const categories = Object.keys(categorySpending);
                        if (categories.length > 0) {
                            const largestCategory = categories.reduce((a, b) => 
                                categorySpending[a] > categorySpending[b] ? a : b
                            );

                            insights.push({
                                type: 'spending_pattern',
                                message: `I notice you're spending most on ${largestCategory} (${Math.round(categorySpending[largestCategory]/totalSpent*100)}% of your budget)`,
                                data: categorySpending
                            });

                            if (categorySpending['Food'] && categorySpending['Food'] > totalSpent * 0.3) {
                                insights.push({
                                    type: 'saving_tip',
                                    message: "Pro tip: Meal prepping could save you 30% on food costs! Want some easy recipes?"
                                });
                            }
                        }
                    }

                    resolve(insights);
                }
            );
        });
    }

    getGreeting() {
        const greetings = [
            "Hey there! 👋 Ready to make your money work smarter today?",
            "Hello friend! 💰 How's your financial journey going?",
            "Hi! I was just looking at your expenses - want to hear something interesting?",
            "Hey! I've got some insights about your spending patterns. Want to chat?"
        ];
        return greetings[Math.floor(Math.random() * greetings.length)];
    }

    async generateResponse(userMessage) {
        const message = userMessage.toLowerCase();
        
        this.memory.lastConversation = message;
        this.saveMemory();

        const insights = await this.analyzeSpending();

        if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
            return {
                reply: this.getGreeting(),
                insights: insights.slice(0, 1),
                type: 'greeting'
            };
        }

        if (message.includes('how much') || message.includes('spent') || message.includes('total')) {
            return await this.handleSpendingQuery(message);
        }

        if (message.includes('save') || message.includes('saving')) {
            return await this.handleSavingAdvice(message);
        }

        if (message.includes('category') || message.includes('categories')) {
            return await this.handleCategoryAnalysis();
        }

        if (message.includes('tip') || message.includes('advice') || message.includes('help')) {
            return await this.handleGeneralAdvice();
        }

        if (message.includes('add expense') || message.includes('new expense')) {
            return {
                reply: "I can help you add expenses! Use the '💸 Add Quick Expense' button in chat, or tell me: 'I spent $15 on lunch today' and I'll add it for you!",
                type: 'expense_help'
            };
        }

        const expenseMatch = message.match(/(?:spent|paid|cost)\s*\$\s*(\d+(?:\.\d{2})?)\s*(?:on|for)\s*(.+)/i);
        if (expenseMatch) {
            return await this.handleNaturalExpense(expenseMatch[1], expenseMatch[2]);
        }

        const addMatch = message.match(/add expense[,:\s]+(.+?),\s*([\d\.]+),\s*([a-zA-Z ]+),\s*(\d{4}-\d{2}-\d{2})/i);
        if (addMatch) {
            return await this.handleAddExpense(addMatch[1], addMatch[2], addMatch[3], addMatch[4]);
        }

        const defaultResponses = [
            "I'm your financial friend Finn! I can help you understand your spending, find saving opportunities, or just chat about money goals. What's on your mind?",
            "Hey! I'm here to help with your money questions. You can ask about your spending, get saving tips, or just chat about financial goals!",
            "As your financial buddy, I can analyze your expenses, suggest saving strategies, or help you understand where your money's going. What would you like to know?"
        ];

        return {
            reply: defaultResponses[Math.floor(Math.random() * defaultResponses.length)],
            insights: insights,
            type: 'friendly_nudge'
        };
    }

    async handleSpendingQuery(message) {
        return new Promise((resolve) => {
            const currentMonth = new Date().toISOString().slice(0, 7);
            
            db.get(
                `SELECT SUM(amount) as total 
                 FROM expenses 
                 WHERE substr(date,1,7) = ?`,
                [currentMonth],
                (err, row) => {
                    if (err || !row || !row.total) {
                        resolve({
                            reply: "I don't see any expenses for this month yet. Ready to track your first expense?",
                            type: 'spending_summary'
                        });
                        return;
                    }

                    const responses = [
                        `This month you've spent $${row.total.toFixed(2)} so far. Want me to break it down by category?`,
                        `Your total spending this month is $${row.total.toFixed(2)}. I can show you where it's all going!`,
                        `I see $${row.total.toFixed(2)} in expenses this month. Curious about your spending patterns?`
                    ];

                    resolve({
                        reply: responses[Math.floor(Math.random() * responses.length)],
                        type: 'spending_summary',
                        data: { total: row.total }
                    });
                }
            );
        });
    }

    async handleSavingAdvice(message) {
        const tips = [
            "Try the 24-hour rule: wait a day before buying anything over $50. You'd be surprised how many 'needs' become 'wants'!",
            "Here's a simple trick: Save your $5 bills. Every time you get one, put it aside. You'll save hundreds without noticing!",
            "Meal prep Sundays! Cooking in bulk can cut your food costs by 40% and save you time during the week.",
            "Unsubscribe from store emails. Fewer temptations = more savings. You've got this!",
            "Use cash for fun spending. When the cash is gone, the spending stops. Old school but super effective!"
        ];

        return {
            reply: tips[Math.floor(Math.random() * tips.length)],
            type: 'saving_tip'
        };
    }

    async handleCategoryAnalysis() {
        return new Promise((resolve) => {
            const currentMonth = new Date().toISOString().slice(0, 7);
            
            db.all(
                `SELECT category, SUM(amount) as total 
                 FROM expenses 
                 WHERE substr(date,1,7) = ? 
                 GROUP BY category 
                 ORDER BY total DESC`,
                [currentMonth],
                (err, rows) => {
                    if (err || !rows || rows.length === 0) {
                        resolve({
                            reply: "No category data yet. Start adding expenses and I'll help you analyze them!",
                            type: 'category_analysis'
                        });
                        return;
                    }

                    let response = "Here's your spending breakdown:\n";
                    let total = 0;
                    
                    rows.forEach(row => {
                        response += `• ${row.category}: $${row.total.toFixed(2)}\n`;
                        total += row.total;
                    });

                    response += `\nTotal: $${total.toFixed(2)}\n\n`;
                    response += "See any surprises? I can help you optimize these!";

                    resolve({
                        reply: response,
                        type: 'category_analysis',
                        data: rows
                    });
                }
            );
        });
    }

    async handleGeneralAdvice() {
        const advice = [
            "Start with a $500 emergency fund - it's your financial safety net!",
            "Track every expense for 2 weeks. Knowledge is power when it comes to spending!",
            "Set one small financial goal this month - like saving $50. Small wins build big habits!",
            "Review your subscriptions. The average person pays for 3 subscriptions they don't use!",
            "Pay yourself first! Set up auto-transfer to savings right when you get paid."
        ];

        return {
            reply: advice[Math.floor(Math.random() * advice.length)],
            type: 'general_advice'
        };
    }

    async handleNaturalExpense(amount, description) {
        
        let category = 'Other';
        const desc = description.toLowerCase();
        
        if (desc.includes('food') || desc.includes('lunch') || desc.includes('dinner') || desc.includes('grocer') || desc.includes('restaurant')) {
            category = 'Food';
        } else if (desc.includes('bus') || desc.includes('train') || desc.includes('gas') || desc.includes('uber') || desc.includes('transport')) {
            category = 'Transport';
        } else if (desc.includes('movie') || desc.includes('game') || desc.includes('entertain') || desc.includes('fun')) {
            category = 'Entertainment';
        } else if (desc.includes('bill') || desc.includes('rent') || desc.includes('utility') || desc.includes('electric') || desc.includes('water')) {
            category = 'Utilities';
        } else if (desc.includes('shop') || desc.includes('cloth') || desc.includes('amazon') || desc.includes('buy')) {
            category = 'Shopping';
        }

        return new Promise((resolve) => {
            db.run(
                `INSERT INTO expenses (description, amount, category, date) 
                 VALUES (?, ?, ?, ?)`,
                [description, parseFloat(amount), category, new Date().toISOString().split('T')[0]],
                function(err) {
                    if (err) {
                        resolve({
                            reply: "Oops! I had trouble adding that expense. Can you try the quick expense button instead?",
                            type: 'error'
                        });
                        return;
                    }
                    
                    const responses = [
                        `Got it! I added $${amount} for ${description} to your ${category} expenses. 💰`,
                        `✅ Added! $${amount} for ${description} is now tracked in ${category}.`,
                        `Thanks for telling me! I've recorded $${amount} for ${description} under ${category}.`
                    ];
                    
                    resolve({
                        reply: responses[Math.floor(Math.random() * responses.length)],
                        type: 'expense_added',
                        data: { id: this.lastID, amount: amount, category: category }
                    });
                }
            );
        });
    }

    async handleAddExpense(description, amount, category, date) {
        return new Promise((resolve) => {
            db.run(
                `INSERT INTO expenses (description, amount, category, date) 
                 VALUES (?, ?, ?, ?)`,
                [description.trim(), parseFloat(amount), category.trim(), date],
                function(err) {
                    if (err) {
                        resolve({
                            reply: "Oops! I had trouble adding that expense. Please check the format and try again.",
                            type: 'error'
                        });
                        return;
                    }
                    
                    resolve({
                        reply: `✅ Added expense: ${description} - $${amount} (${category}) on ${date}`,
                        type: 'expense_added',
                        data: { id: this.lastID, amount: amount, category: category }
                    });
                }
            );
        });
    }
}

app.post('/api/chatbot', express.json(), async (req, res) => {
    const userMsg = (req.body && req.body.message) ? String(req.body.message).trim() : '';
    const userId = req.body.userId || 'demo-user';
    
    if (!userMsg) {
        return res.status(400).json({ error: 'Empty message' });
    }

    try {
        
        const finn = new FinancialFriend(userId);
        const response = await finn.generateResponse(userMsg);
        
        res.json(response);
    } catch (error) {
        console.error('Chatbot error:', error);
        res.status(500).json({ 
            reply: "Oops! I'm having a moment. Can you try that again?",
            type: 'error'
        });
    }
});


app.post('/api/expenses/quick', express.json(), (req, res) => {
    const { amount, category, description } = req.body;
    
    if (!amount || !category) {
        return res.status(400).json({ error: 'Amount and category are required' });
    }
    
    db.run(
        `INSERT INTO expenses (description, amount, category, date) 
         VALUES (?, ?, ?, ?)`,
        [description || `Expense for ${category}`, parseFloat(amount), category, new Date().toISOString().split('T')[0]],
        function(err) {
            if (err) {
                res.status(500).json({ error: 'Failed to add expense' });
                return;
            }
            res.json({ 
                success: true, 
                id: this.lastID,
                message: "Expense added successfully!"
            });
        }
    );
});


app.get('/graph', (req, res) => {
  const p = path.join(__dirname, 'public', 'graph.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(404).send('graph.html not found in /public');
});
app.get('/chat', (req, res) => {
  const p = path.join(__dirname, 'public', 'chat.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(404).send('chat.html not found in /public');
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'BudgetBuddy with Financial Friend Finn is running!',
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Open http://localhost:${PORT}`);
});
0
