const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const {
  MONGODB_URI,
  JWT_SECRET,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  EMAIL_USER,
  EMAIL_PASS,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  STRIPE_PUBLISHABLE_KEY
} = process.env;

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        frameSrc: ["'self'", "https://js.stripe.com"],
      },
    },
  })
);

app.use(cors());
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many requests. Try again later.'
});
app.use(['/login', '/register', '/admin/login'], authLimiter);

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

const userSchema = new mongoose.Schema({ username: { type: String, unique: true }, password: String });
const User = mongoose.model('User', userSchema);

const orderSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  customerName: String,
  customerPhone: String,
  customerEmail: String,
  items: [{ name: String, price: String, quantity: Number }],
  totalAmount: Number,
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: 'Pending' },
  statusUpdatedAt: { type: Date }
});
const Order = mongoose.model('Order', orderSchema);

const logSchema = new mongoose.Schema({
  type: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});
const Log = mongoose.model('Log', logSchema);

const menuSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: String,
  image: String,
  category: String
});
const MenuItem = mongoose.model('MenuItem', menuSchema);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Forbidden' });
    req.user = user;
    next();
  });
}

function authenticateAdmin(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    req.user = user;
    next();
  });
}

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
  try {
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ message: 'Username already exists' });
    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashed });
    await newUser.save();
    const token = jwt.sign({ id: newUser._id, username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id, username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.get('/menu', (req, res) => {
  const menuPath = path.join(__dirname, 'public', 'menu.json');
  fs.readFile(menuPath, 'utf-8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Could not load menu' });
    res.json(JSON.parse(data));
  });
});

app.get('/pub', async (req, res) => {
  try {
    const items = await MenuItem.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch menu items' });
  }
});

app.post('/order', async (req, res) => {
  const { customerName, customerPhone, customerEmail, items, totalAmount } = req.body;
  try {
    const order = new Order({ customerName, customerPhone, customerEmail, items, totalAmount });
    await order.save();


    await transporter.sendMail({
  from: EMAIL_USER,
  to: customerEmail,
  subject: '🧾 CurryCrate Order Receipt',
  html: `
    <div style="max-width: 600px; margin: auto; font-family: Arial, sans-serif; border: 1px solid #ddd; border-radius: 10px; padding: 24px; background: #fff;">
      <h2 style="text-align: center; color: #e67e22;">🍛 <span style="color: #e67e22;">CurryCrate</span> Order Receipt</h2>
      <p>Hello <strong>${customerName}</strong>,</p>
      <p>Thank you for your order! Here are your order details:</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background-color: #f6f6f6;">
            <th style="text-align: left; padding: 10px; border: 1px solid #ccc;">Item</th>
            <th style="text-align: center; padding: 10px; border: 1px solid #ccc;">Qty</th>
            <th style="text-align: right; padding: 10px; border: 1px solid #ccc;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td style="padding: 10px; border: 1px solid #eee;">${item.name}</td>
              <td style="text-align: center; padding: 10px; border: 1px solid #eee;">${item.quantity}</td>
              <td style="text-align: right; padding: 10px; border: 1px solid #eee;">$${item.price}</td>
            </tr>
          `).join('')}
          <tr style="font-weight: bold;">
            <td colspan="2" style="text-align: right; padding: 10px; border: 1px solid #ccc;">Total</td>
            <td style="text-align: right; padding: 10px; border: 1px solid #ccc;">$${totalAmount}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin-top: 20px;">📍 <strong>You will be notified once your order is on the way!</strong></p>
      <p>Thanks for choosing <strong>CurryCrate</strong>!</p>
      <p style="font-size: 12px; color: #999; margin-top: 30px;">This is an automated message. Please do not reply.</p>
    </div>
  `
});

 
await transporter.sendMail({
  from: EMAIL_USER,
  to: EMAIL_USER, // Send to admin
  subject: `📦 New Order Received from ${customerName}`,
  html: `
    <div style="max-width: 600px; margin: auto; font-family: Arial, sans-serif; border: 1px solid #ddd; border-radius: 10px; padding: 24px; background: #fff;">
      <h2 style="text-align: center; color: #e67e22;">📦 New Order Received</h2>
      <p><strong>Name:</strong> ${customerName}</p>
      <p><strong>Email:</strong> ${customerEmail}</p>
      <p><strong>Phone:</strong> ${customerPhone}</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background-color: #f6f6f6;">
            <th style="text-align: left; padding: 10px; border: 1px solid #ccc;">Item</th>
            <th style="text-align: center; padding: 10px; border: 1px solid #ccc;">Qty</th>
            <th style="text-align: right; padding: 10px; border: 1px solid #ccc;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td style="padding: 10px; border: 1px solid #eee;">${item.name}</td>
              <td style="text-align: center; padding: 10px; border: 1px solid #eee;">${item.quantity}</td>
              <td style="text-align: right; padding: 10px; border: 1px solid #eee;">$${item.price}</td>
            </tr>
          `).join('')}
          <tr style="font-weight: bold;">
            <td colspan="2" style="text-align: right; padding: 10px; border: 1px solid #ccc;">Total</td>
            <td style="text-align: right; padding: 10px; border: 1px solid #ccc;">$${totalAmount}</td>
          </tr>
        </tbody>
      </table>

      <p><strong>📬 Order placed on:</strong> ${new Date().toLocaleString()}</p>
      <p style="font-size: 12px; color: #999; margin-top: 30px;">This is an automated notification to the CurryCrate admin.</p>
    </div>
  `
});



    // Send receipt to customer
    

    const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    await twilio.messages.create({
      body: `Hi ${customerName}, your order has been received!`,
      from: TWILIO_PHONE_NUMBER,
      to: customerPhone
    });

    io.emit('orderUpdated');
    res.status(201).json({ message: 'Order saved', orderId: order._id });
  } catch (err) {
    await Log.create({ type: 'order_error', message: err.message });
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/create-payment-intent', async (req, res) => {
  const { amount } = req.body;
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      payment_method_types: ['card']
    });
    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).send({ error: 'Payment intent creation failed' });
  }
});

app.get('/admin/orders', authenticateAdmin, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/admin/orders/:id/status', authenticateAdmin, async (req, res) => {
  const { status } = req.body;
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, { status, statusUpdatedAt: new Date() }, { new: true });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    await transporter.sendMail({
      from: EMAIL_USER,
      to: order.customerEmail,
      subject: `Order ${status}`,
      html: `<p>Hello ${order.customerName},<br>Your order status is now <strong>${status}</strong>.</p>`
    });

    const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    await twilio.messages.create({
      body: `Hi ${order.customerName}, your order status is now "${status}".`,
      from: TWILIO_PHONE_NUMBER,
      to: order.customerPhone
    });

    io.emit('orderUpdated');
    res.json({ message: `Order marked as ${status}` });
  } catch (err) {
    await Log.create({ type: 'status_error', message: err.message });
    res.status(500).json({ message: 'Error updating status' });
  }
});

app.delete('/admin/orders/:id', authenticateAdmin, async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    io.emit('orderUpdated');
    res.json({ message: 'Order deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/menu', authenticateAdmin, async (req, res) => {
  const items = await MenuItem.find();
  res.json(items);
});

app.post('/api/menu', authenticateAdmin, async (req, res) => {
  const item = new MenuItem(req.body);
  await item.save();
  res.status(201).json(item);
});

app.put('/api/menu/:id', authenticateAdmin, async (req, res) => {
  const updated = await MenuItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!updated) return res.status(404).json({ message: 'Item not found' });
  res.json(updated);
});

app.delete('/api/menu/:id', authenticateAdmin, async (req, res) => {
  await MenuItem.findByIdAndDelete(req.params.id);
  res.json({ message: 'Item deleted' });
});

app.get('/payment.html', (req, res) => {
  fs.readFile(path.join(__dirname, 'public', 'payment.html'), 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error loading payment page');
    const html = data.replace('%%STRIPE_KEY%%', STRIPE_PUBLISHABLE_KEY);
    res.send(html);
  });
});

app.get('/confirmation.html', (req, res) => {
  fs.readFile(path.join(__dirname, 'public', 'confirmation.html'), 'utf8',(err, data) => {
    if (err) return res.status(500).send('Error loading confirmation page');
    res.send(data);
  });
});

app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
