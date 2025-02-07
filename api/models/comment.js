// models/Comment.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const CommentSchema = new Schema({
  content: { type: String, required: true },
  post: { type: Schema.Types.ObjectId, ref: 'Posts', required: true }, // The post the comment belongs to
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // The user who made the comment
  createdAt: { type: Date, default: Date.now },
});

const Comment = mongoose.model('Comment', CommentSchema);
module.exports = Comment;
