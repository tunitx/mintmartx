// model.js
const mongoose = require('mongoose');

// Create a schema for the photo model
const photoSchema = new mongoose.Schema({
  name: String,
  description: String,
  filename: String,
  paymentStatus: String,
});

// Create a Photo model using the schema
const Photo = mongoose.model('Photo', photoSchema);

// Export the Photo model
module.exports = Photo;

