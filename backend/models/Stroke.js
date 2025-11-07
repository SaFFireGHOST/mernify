const mongoose = require('mongoose');

const strokeSchema = new mongoose.Schema({
  room_id: { type: Number, required: true }, // Bigint as Number
  strokes: { type: Array, required: true }, // Array of objects
  color: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  created_by: String // Optional
});

const Stroke = mongoose.model('Stroke', strokeSchema);

module.exports = Stroke;