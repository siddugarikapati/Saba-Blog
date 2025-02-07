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

const secret = 'abjhg739nobfkb328bnmbh863kjbnkjdsfkjh4ijnfkjn';

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      return cb(null, true);
    } else {
      cb('Error: Only images are allowed!');
    }
  }
});

app.use(express.static('uploads'));
app.use(cors({
  origin: 'https://saba-blog.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static('uploads'));

// MongoDB connection
const mongoURI = 'mongodb+srv://saba:blog@cluster0.1w49u.mongodb.net/';
mongoose.connect(mongoURI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware for token authentication
const authenticateToken = (req, res, next) => {
  const { token } = req.cookies;
  if (!token) return res.status(401).json({ error: 'Token not provided' });

  jwt.verify(token, secret, (err, info) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = info; 
    next();
  });
};

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const salt = bcrypt.genSaltSync(10);
    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password, salt),
    });
    res.json(userDoc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.findOne({ username });
    if (!userDoc) return res.status(400).json("User not found");

    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
        if (err) throw err;
        res.cookie('token', token, { httpOnly: true, secure: false }).json({ id: userDoc._id, username }); // Set secure to true if using HTTPS
      });
    } else {
      res.status(400).json("Wrong credentials");
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Profile endpoint
app.get('/profile', authenticateToken, (req, res) => {
  res.json(req.user);
});

// Logout endpoint
app.post('/logout', (req, res) => {
  res.cookie('token', '').json('ok');
});

// Upload and create post
app.post('/post', upload.single('file'), authenticateToken, async (req, res) => {
  const { title, summary, content } = req.body;
  try {
    const { originalname, path: tempPath } = req.file;
    const ext = path.extname(originalname);
    const newPath = path.join(__dirname, 'uploads', `${req.file.filename}${ext}`);

    fs.renameSync(tempPath, newPath);

    const postDoc = await Posts.create({
      title,
      summary,
      content,
      cover: `uploads/${req.file.filename}${ext}`,
      author: req.user.id,
    });
    res.json(postDoc);
  } catch (error) {
    res.status(500).json({ error: 'Error saving post to the database' });
  }
});

// Fetch all posts with likes count
app.get('/post', async (req, res) => {
  try {
    const posts = await Posts.find()
      .populate('author', ['username'])
      .sort({ createdAt: -1 }) // Sort by createdAt in descending order
      .lean(); 

    // Send posts along with the likes count for each post
    const postsWithLikes = posts.map(post => ({
      ...post,
      likesCount: post.likes.length
    }));

    res.json(postsWithLikes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while fetching posts' });
  }
});


// Fetch single post by ID
app.get('/post/:id', async (req, res) => {
  const { id } = req.params;
  const postDoc = await Posts.findById(id).populate('author', ['username']);
  res.json(postDoc);
});

// Update post
app.put('/post', upload.single('file'), authenticateToken, async (req, res) => {
  let newPath = null;
  if (req.file) {
    const { originalname, path } = req.file;
    const parts = originalname.split('.');
    const ext = parts[parts.length - 1];
    newPath = `${path}.${ext}`;
    fs.renameSync(path, newPath);
  }

  const { id, title, summary, content } = req.body;
  const postDoc = await Posts.findById(id);

  if (String(postDoc.author) !== String(req.user.id)) {
    return res.status(403).json('You are not the author of this post.');
  }

  postDoc.title = title;
  postDoc.summary = summary;
  postDoc.content = content;
  if (newPath) {
    postDoc.cover = newPath;
  }

  await postDoc.save();

  res.json(postDoc);
});

// Delete post
app.delete('/post/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const postDoc = await Posts.findById(id);

  if (String(postDoc.author) !== String(req.user.id)) {
    return res.status(403).json('You are not authorized to delete this post.');
  }

  try {
    await Posts.findByIdAndDelete(id);
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Like post
// Like post
app.post('/post/:id/like', authenticateToken, async (req, res) => {
  const { id } = req.params; 
  const userId = req.user.id; // Get the authenticated user's ID

  try {
    const post = await Posts.findById(id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if the user has already liked the post
    const hasLiked = post.likes.includes(userId);

    if (hasLiked) {
      // If the user has already liked the post, remove their like
      post.likes = post.likes.filter(user => String(user) !== String(userId));
    } else {
      // If the user hasn't liked the post yet, add their like
      post.likes.push(userId);
    }

    await post.save(); // Save the updated post

    res.json({ liked: !hasLiked, likesCount: post.likes.length }); // Respond with the new like state and count
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while processing the like action' });
  }
});



// Start the server
app.listen(8000, () => {
  console.log('Server is running on port 8000');
});
