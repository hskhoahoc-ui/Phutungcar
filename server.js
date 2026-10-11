const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    family: 4
});

pool.connect((err) => {
    if (err) console.error('Lỗi kết nối Database:', err.stack);
    else console.log('Đã kết nối thành công với Database!');
});

const initDatabase = async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'staff'
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            name TEXT,
            address TEXT,
            phone TEXT,
            qr_code TEXT,
            banners TEXT
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS inventory (
            id SERIAL PRIMARY KEY,
            brand TEXT,
            category TEXT,
            item_name TEXT,
            part_code TEXT,
            supplier TEXT,
            quantity INTEGER,
            import_price REAL,
            sell_price REAL,
            import_date TEXT
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS expenses (
            id SERIAL PRIMARY KEY,
            category TEXT,
            amount REAL,
            note TEXT,
            date TEXT
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS bills (
            id SERIAL PRIMARY KEY,
            items_detail TEXT,
            total_amount REAL,
            total_import_cost REAL,
            payment_method TEXT,
            created_date TEXT
        )`);

        const userCountRes = await pool.query(`SELECT COUNT(*) as count FROM users`);
        if (userCountRes.rows[0] && parseInt(userCountRes.rows[0].count) === 0) {
            await pool.query(`INSERT INTO users (username, password, role) VALUES ('admin', '123456', 'admin')`);
            await pool.query(`INSERT INTO settings (name, address, phone, qr_code, banners) VALUES ('Cửa Hàng Phụ Tùng Ô Tô Việt', '123 Nguyễn Văn Cừ, TP.HCM', '0909123456', 'https://api.vietqr.io/image/970422-123456789-n5398FP.jpg', '["https://images.unsplash.com/photo-1486006920555-c77dce18193b"]')`);
        }
        console.log('Khởi tạo CSDL hoàn tất.');
    } catch (err) {
        console.error('Lỗi khởi tạo CSDL:', err);
    }
};

initDatabase();

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(`SELECT * FROM users WHERE username = $1 AND password = $2`, [username, password]);
        const row = result.rows[0];
        if (!row) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu!' });
        res.json({ success: true, user: { username: row.username, role: row.role } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, username, role FROM users`);
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/save', async (req, res) => {
    const { id, username, password, role } = req.body;
    try {
        if (id) {
            if (password) {
                await pool.query(`UPDATE users SET username = $1, password = $2, role = $3 WHERE id = $4`, [username, password, role, id]);
            } else {
                await pool.query(`UPDATE users SET username = $1, role = $2 WHERE id = $3`, [username, role, id]);
            }
        } else {
            await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, $3)`, [username, password || '123456', role || 'staff']);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: 'Tên tài khoản đã tồn tại!' });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM settings LIMIT 1`);
        res.json(result.rows[0] || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings', async (req, res) => {
    const { name, address, phone, qr_code, banners } = req.body;
    try {
        await pool.query(`UPDATE settings SET name = $1, address = $2, phone = $3, qr_code = $4, banners = $5 WHERE id = 1`, 
            [name, address, phone, qr_code, JSON.stringify(banners || [])]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/inventory', async (req, res) => {
    const { search } = req.query;
    try {
        let query = `SELECT * FROM inventory`;
        let params = [];
        if (search) {
            query += ` WHERE brand ILIKE $1 OR category ILIKE $1 OR item_name ILIKE $1 OR part_code ILIKE $1 OR supplier ILIKE $1`;
            params = [`%${search}%`];
        }
        query += ` ORDER BY id DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory/save', async (req, res) => {
    const { id, brand, category, item_name, part_code, supplier, quantity, import_price, sell_price } = req.body;
    const import_date = new Date().toISOString().split('T')[0];
    try {
        if (id) {
            await pool.query(`UPDATE inventory SET brand = $1, category = $2, item_name = $3, part_code = $4, supplier = $5, quantity = $6, import_price = $7, sell_price = $8 WHERE id = $9`,
                [brand, category, item_name, part_code, supplier, quantity, import_price, sell_price, id]);
        } else {
            await pool.query(`INSERT INTO inventory (brand, category, item_name, part_code, supplier, quantity, import_price, sell_price, import_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [brand, category, item_name, part_code, supplier, quantity, import_price, sell_price, import_date]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/inventory/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM inventory WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory/sell', async (req, res) => {
    const { items, payment_method } = req.body;
    const created_date = new Date().toISOString().split('T')[0];
    try {
        let total_amount = 0;
        let total_import_cost = 0;
        let soldDetails = [];

        for (let item of items) {
            const invRes = await pool.query(`SELECT * FROM inventory WHERE id = $1`, [item.id]);
            const inv = invRes.rows[0];
            if (!inv || inv.quantity < item.quantity_sold) {
                return res.status(400).json({ error: `Mặt hàng ${inv?.part_code || ''} không đủ số lượng trong kho!` });
            }

            const subTotal = inv.sell_price * item.quantity_sold;
            const importSubTotal = inv.import_price * item.quantity_sold;
            total_amount += subTotal;
            total_import_cost += importSubTotal;

            soldDetails.push({
                part_code: inv.part_code,
                item_name: inv.item_name,
                brand: inv.brand,
                category: inv.category,
                quantity: item.quantity_sold,
                sell_price: inv.sell_price,
                subTotal
            });

            await pool.query(`UPDATE inventory SET quantity = quantity - $1 WHERE id = $2`, [item.quantity_sold, item.id]);
        }

        await pool.query(`INSERT INTO bills (items_detail, total_amount, total_import_cost, payment_method, created_date) VALUES ($1, $2, $3, $4, $5)`,
            [JSON.stringify(soldDetails), total_amount, total_import_cost, payment_method, created_date]);

        res.json({ success: true, total_amount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/expenses', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM expenses ORDER BY date DESC`);
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/expenses', async (req, res) => {
    const { category, amount, note, date } = req.body;
    const expenseDate = date || new Date().toISOString().split('T')[0];
    try {
        await pool.query(`INSERT INTO expenses (category, amount, note, date) VALUES ($1, $2, $3, $4)`, [category, amount, note, expenseDate]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports', async (req, res) => {
    const { start_date, end_date } = req.query;
    try {
        let billQuery = `SELECT SUM(total_amount) as total_revenue, SUM(total_import_cost) as total_import_sold FROM bills`;
        let expQuery = `SELECT SUM(amount) as total_expense FROM expenses`;
        let params = [];

        if (start_date && end_date) {
            billQuery += ` WHERE created_date BETWEEN $1 AND $2`;
            expQuery += ` WHERE date BETWEEN $1 AND $2`;
            params = [start_date, end_date];
        }

        const billRes = await pool.query(billQuery, params);
        const expRes = await pool.query(expQuery, params);

        const totalRevenue = Number(billRes.rows[0]?.total_revenue || 0);
        const totalImportSold = Number(billRes.rows[0]?.total_import_sold || 0);
        const totalExpense = Number(expRes.rows[0]?.total_expense || 0);
        const netProfit = totalRevenue - totalImportSold - totalExpense;

        res.json({ totalRevenue, totalImportSold, totalExpense, netProfit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
