const express = require('express');
const router = express.Router();
const Stroke = require('../models/Stroke'); // Require the model

// GET /strokes/:roomId
router.get('/:roomId', async (req, res) => {
  const { roomId } = req.params;
  try {
    const strokes = await Stroke.find({ room_id: parseInt(roomId) }).sort({ created_at: 1 });
    res.json(strokes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /strokes
router.post('/', async (req, res) => {
  const { room_id, strokes, color, created_by } = req.body;
  try {
    const newStroke = new Stroke({ room_id, strokes, color, created_by });
    await newStroke.save();
    res.status(201).json(newStroke);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /strokes/:roomId
router.delete('/:roomId', async (req, res) => {
  const { roomId } = req.params;
  try {
    await Stroke.deleteMany({ room_id: parseInt(roomId) });
    res.json({ message: 'Cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;