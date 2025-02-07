const mongoose = require('mongoose');
const { Schema } = mongoose;

const PostSchema = new Schema({
  title: { type: String, required: true },
  summary: { type: String, required: true },
  content: { type: String, required: true },
  cover: { type: String }, // Field to store the image path
  author: { type: Schema.Types.ObjectId, ref: 'User' }, // Ensure this is correct
  likes: [{ type: Schema.Types.ObjectId, ref: 'User' }], // New field for storing user IDs of those who liked the post
}, { timestamps: true });

const Posts = mongoose.model('Posts', PostSchema);
module.exports = Posts;
