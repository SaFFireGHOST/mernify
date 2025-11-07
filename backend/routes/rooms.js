// routes/rooms.js
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { verifyToken } = require('../middleware/auth'); // your existing middleware

const router = express.Router();

// Supabase admin client (server-side only)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set - Supabase operations will fail');
}
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});



// GET /api/rooms
// Returns a paginated list of rooms (public endpoint).
router.get('/', async (req, res) => {
  try {
    // pagination params (optional)
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200); // 1..200
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

    const from = offset;
    const to = offset + limit - 1;

    // select all columns, newest first
    const { data, error } = await supabaseAdmin
      .from('rooms')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Supabase select error (rooms list):', error);
      return res.status(500).json({ error: error.message || 'failed to fetch rooms', detail: error });
    }

    return res.json({ rooms: data || [] });
  } catch (err) {
    console.error('Get rooms error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});




/**
 * POST /api/rooms
 * Body: { title: string, subject?: string, video_url?: string, thumbnail?: string }
 * Requires: Authorization: Bearer <app-jwt> (verifyToken)
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, subject = null, video_url = null, thumbnail = null } = req.body;
    if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title is required' });

    // req.user set by verifyToken: { id, username }
    const created_by = req.user?.id;
    if (!created_by) return res.status(401).json({ error: 'unauthorized' });

    // Prepare row to insert into Supabase
    const row = {
      title: title.trim(),
      subject: subject ? subject.trim() : null,
      video_url,
      created_by, // this should be Mongo _id string that exists in public.profiles
    };

    // Insert into Supabase public.rooms
    const { data, error } = await supabaseAdmin
      .from('rooms')
      .insert([row])
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error (rooms):', error);
      // If profiles FK fails, inform the client
      return res.status(500).json({ error: error.message || 'failed to create room' });
    }

    // Return the created room object
    // data will contain created row; ensure id is present
    return res.status(201).json({ room: data });
  } catch (err) {
    console.error('Create room error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

module.exports = router;
