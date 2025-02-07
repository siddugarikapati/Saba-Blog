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
app.use(
  cors({
    origin: "https://saba-blog.vercel.app", // Frontend URL
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // Allow cookies to be sent
  })
);


// MongoDB connection
mongoose.connect('mongodb+srv://saba:blog@cluster0.1w49u.mongodb.net/')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware for token authentication
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token; // Extract the token from cookies
  if (!token) return res.status(401).json({ error: "Token not provided" });

  jwt.verify(token, secret, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user; // Attach user info to the request
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
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.findOne({ username });
    if (!userDoc) return res.status(400).json({ error: "User not found" });

    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
        if (err) throw err;
        res
          .cookie("token", token, {
            httpOnly: true,
            secure: true, // Set true for HTTPS
            sameSite: "none", // Allow cross-origin cookies
          })
          .json({ id: userDoc._id, username });
      });
    } else {
      res.status(400).json({ error: "Wrong credentials" });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// Profile
app.get('/profile', authenticateToken, (req, res) => {
  res.json(req.user);
});

// Logout
app.post("/logout", (req, res) => {
  res
    .cookie("token", "", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    })
    .json("Logged out");
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
// Start server
app.listen(8000, () => {
  console.log('Server is running on port 8000');
});
