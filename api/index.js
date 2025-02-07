const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Posts = require('./models/Posts');
const User = require('./models/User');
const app = express();

const secret = 'your_jwt_secret_key_here';

// Multer configuration for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      cb(null, true);
    } else {
      cb('Error: Only images are allowed!');
    }
  }
});

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static('uploads'));
app.use(cors({
  origin: 'https://saba-blog.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// MongoDB connection
mongoose.connect('mongodb+srv://saba:blog@cluster0.1w49u.mongodb.net/')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware for token authentication
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Token not provided' });
  }

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = decoded;
    next();
  });
};

// Routes

// Register
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    const newUser = await User.create({ username, password: hashedPassword });
    res.json(newUser);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Wrong credentials' });
    }

    const token = jwt.sign({ id: user._id, username: user.username }, secret, { expiresIn: '1d' });
    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none' });
    res.json({ id: user._id, username: user.username });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Profile
app.get('/profile', authenticateToken, (req, res) => {
  res.json(req.user);
});

// Logout
app.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });
  res.json({ message: 'Logged out successfully' });
});

// Create Post
app.post('/post', upload.single('file'), authenticateToken, async (req, res) => {
  const { title, summary, content } = req.body;
  try {
    const { originalname, path: tempPath } = req.file;
    const ext = path.extname(originalname);
    const newPath = path.join(__dirname, 'uploads', `${req.file.filename}${ext}`);
    fs.renameSync(tempPath, newPath);

    const newPost = await Posts.create({
      title,
      summary,
      content,
      cover: `uploads/${req.file.filename}${ext}`,
      author: req.user.id,
    });
    res.json(newPost);
  } catch (error) {
    res.status(500).json({ error: 'Error saving post' });
  }
});

// Get all posts
app.get('/post', async (req, res) => {
  try {
    const posts = await Posts.find().populate('author', ['username']).sort({ createdAt: -1 }).lean();
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching posts' });
  }
});

// Get single post by ID
app.get('/post/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const post = await Posts.findById(id).populate('author', ['username']);
    res.json(post);
  } catch (error) {
    res.status(404).json({ error: 'Post not found' });
  }
});

// Update Post
app.put('/post', upload.single('file'), authenticateToken, async (req, res) => {
  const { id, title, summary, content } = req.body;
  try {
    const post = await Posts.findById(id);
    if (!post || String(post.author) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (req.file) {
      const { originalname, path: tempPath } = req.file;
      const ext = path.extname(originalname);
      const newPath = path.join(__dirname, 'uploads', `${req.file.filename}${ext}`);
      fs.renameSync(tempPath, newPath);
      post.cover = `uploads/${req.file.filename}${ext}`;
    }

    post.title = title;
    post.summary = summary;
    post.content = content;
    await post.save();
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: 'Error updating post' });
  }
});

// Delete Post
app.delete('/post/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const post = await Posts.findById(id);
    if (!post || String(post.author) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await Posts.findByIdAndDelete(id);
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting post' });
  }
});

// Start server
app.listen(8000, () => {
  console.log('Server is running on port 8000');
});
