const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    family: 4
});

pool.connect((err) => {
    if (err) {
        console.error('Lỗi kết nối Database Supabase:', err.stack);
    } else {
        console.log('Đã kết nối thành công với Supabase!');
    }
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
            item_type TEXT DEFAULT 'Phụ tùng xe',
            brand TEXT,
            category TEXT,
            item_name TEXT,
            part_code TEXT,
            supplier TEXT,
            quantity INTEGER,
            unit TEXT DEFAULT 'Cái',
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
            customer_name TEXT DEFAULT 'Khách lẻ',
            customer_phone TEXT DEFAULT '',
            items_detail TEXT,
            total_amount REAL,
            total_import_cost REAL,
            payment_method TEXT,
            created_date TEXT
        )`);

        const userCountRes = await pool.query(`SELECT COUNT(*) as count FROM users`);
        if (userCountRes.rows[0] && parseInt(userCountRes.rows[0].count) === 0) {
            await pool.query(`INSERT INTO users (username, password, role) VALUES ('admin', '123456', 'admin')`);
            await pool.query(`INSERT INTO settings (name, address, phone, qr_code, banners) VALUES ('Cửa Hàng Phụ Tùng & Phụ Kiện Ô Tô', '123 Nguyễn Văn Cừ, Cần Thơ', '0909123456', 'https://api.vietqr.io/image/970422-123456789-n5398FP.jpg', '["https://images.unsplash.com/photo-1486006920555-c77dce18193b"]')`);
        }
        console.log('Khởi tạo cấu trúc CSDL trên Supabase hoàn tất.');
    } catch (err) {
        console.error('Lỗi khởi tạo CSDL:', err);
    }
};

initDatabase();

// --- API Users & Auth ---
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

// --- API Settings ---
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

// --- API Inventory ---
app.get('/api/inventory', async (req, res) => {
    const { search } = req.query;
    try {
        let query = `SELECT * FROM inventory`;
        let params = [];
        if (search) {
            query += ` WHERE item_type ILIKE $1 OR brand ILIKE $1 OR category ILIKE $1 OR item_name ILIKE $1 OR part_code ILIKE $1 OR supplier ILIKE $1`;
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
    const { id, item_type, brand, category, item_name, part_code, supplier, quantity, unit, import_price, sell_price, import_date } = req.body;
    const finalImportDate = import_date || new Date().toISOString().split('T')[0];
    const finalItemType = item_type || 'Phụ tùng xe';
    try {
        if (id) {
            await pool.query(`UPDATE inventory SET item_type = $1, brand = $2, category = $3, item_name = $4, part_code = $5, supplier = $6, quantity = $7, unit = $8, import_price = $9, sell_price = $10 WHERE id = $11`,
                [finalItemType, brand, category, item_name, part_code, supplier, quantity, unit || 'Cái', import_price, sell_price, id]);
        } else {
            await pool.query(`INSERT INTO inventory (item_type, brand, category, item_name, part_code, supplier, quantity, unit, import_price, sell_price, import_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [finalItemType, brand, category, item_name, part_code, supplier, quantity, unit || 'Cái', import_price, sell_price, finalImportDate]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Import file Excel hỗ trợ đọc cột đầu tiên là Phụ tùng xe / Phụ kiện
app.post('/api/inventory/import', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Chưa tải lên file Excel!' });
    }
    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet);

        const import_date = new Date().toISOString().split('T')[0];
        let importedCount = 0;

        for (let row of rawData) {
            const keys = Object.keys(row);
            const item_type = row[keys[0]] || row['Phụ tùng xe'] || 'Phụ tùng xe';
            const brand = row['Thương hiệu'] || row['brand'] || '';
            const category = row['Chủng loại'] || row['category'] || '';
            const item_name = row['Tên hàng hoá'] || row['item_name'] || '';
            const part_code = row['Mã số'] || row['part_code'] || '';
            const supplier = row['Nhà cung cấp'] || row['supplier'] || '';
            const quantity = Number(row['Số lượng'] || row['quantity'] || 0);
            const unit = row['Đơn vị tính'] || row['unit'] || 'Cái';
            const import_price = Number(row['Giá nhập'] || row['import_price'] || 0);
            const sell_price = Number(row['Giá bán'] || row['sell_price'] || 0);

            if (part_code || item_name) {
                await pool.query(
                    `INSERT INTO inventory (item_type, brand, category, item_name, part_code, supplier, quantity, unit, import_price, sell_price, import_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                    [item_type, brand, category, item_name, part_code, supplier, quantity, unit, import_price, sell_price, import_date]
                );
                importedCount++;
            }
        }

        res.json({ success: true, message: `Đã import thành công ${importedCount} sản phẩm vào tồn kho!` });
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

// --- API Sell ---
app.post('/api/inventory/sell', async (req, res) => {
    const { items, payment_method, customer_name, customer_phone } = req.body;
    const created_date = new Date().toISOString().split('T')[0];
    const cName = customer_name && customer_name.trim() !== '' ? customer_name.trim() : 'Khách lẻ';
    const cPhone = customer_phone || '';

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
                unit: inv.unit,
                quantity: item.quantity_sold,
                sell_price: inv.sell_price,
                subTotal
            });

            await pool.query(`UPDATE inventory SET quantity = quantity - $1 WHERE id = $2`, [item.quantity_sold, item.id]);
        }

        await pool.query(`INSERT INTO bills (customer_name, customer_phone, items_detail, total_amount, total_import_cost, payment_method, created_date) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [cName, cPhone, JSON.stringify(soldDetails), total_amount, total_import_cost, payment_method, created_date]);

        res.json({ success: true, total_amount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API Expenses ---
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

// --- API Reports ---
app.get('/api/reports', async (req, res) => {
    const { start_date, end_date } = req.query;
    try {
        let billQuery = `SELECT * FROM bills`;
        let expQuery = `SELECT SUM(amount) as total_expense FROM expenses`;
        let invQuery = `SELECT * FROM inventory`;
        let params = [];

        if (start_date && end_date) {
            billQuery += ` WHERE created_date BETWEEN $1 AND $2`;
            expQuery += ` WHERE date BETWEEN $1 AND $2`;
            invQuery += ` WHERE import_date BETWEEN $1 AND $2`;
            params = [start_date, end_date];
        }

        const billRes = await pool.query(billQuery, params);
        const expRes = await pool.query(expQuery, params.length ? params : []);
        const invRes = await pool.query(invQuery, params);

        const bills = billRes.rows || [];
        const inventoryImports = invRes.rows || [];

        let totalRevenue = 0;
        let totalImportSold = 0;
        let revenueByMethod = { 'Tiền mặt': 0, 'Chuyển khoản': 0, 'Công nợ': 0 };

        bills.forEach(b => {
            const amount = Number(b.total_amount || 0);
            const importCost = Number(b.total_import_cost || 0);
            totalRevenue += amount;
            totalImportSold += importCost;

            const method = b.payment_method || 'Tiền mặt';
            if (revenueByMethod[method] !== undefined) {
                revenueByMethod[method] += amount;
            } else {
                revenueByMethod[method] = amount;
            }
        });

        let totalImportInventoryCost = 0;
        inventoryImports.forEach(i => {
            totalImportInventoryCost += Number(i.import_price || 0) * Number(i.quantity || 0);
        });

        const totalExpense = Number(expRes.rows[0]?.total_expense || 0);
        const netProfit = totalRevenue - totalImportSold - totalExpense;

        res.json({ 
            totalRevenue, 
            totalImportSold, 
            totalExpense, 
            totalImportInventoryCost,
            netProfit,
            revenueByMethod,
            billsList: bills,
            importList: inventoryImports
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
