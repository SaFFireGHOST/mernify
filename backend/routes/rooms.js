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
/**
 * POST /api/rooms
 * Create a new room. Requires auth.
 * body: { title: string, subject?: string, video_url?: string, thumbnail?: string }
 */
router.post('/', verifyToken, async (req, res) => {
    try {
        const { title, subject = null, video_url = null } = req.body;
        if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title is required' });

        const created_by = req.user?.id; // should be mongo _id string from verifyToken
        if (!created_by) return res.status(401).json({ error: 'unauthorized' });

        const row = {
            title: title.trim(),
            subject: subject ? subject.trim() : null,
            video_url,
            created_by,
        };

        // Insert into public.rooms
        const { data, error } = await supabaseAdmin
            .from('rooms')
            .insert([row])
            .select()
            .single();

        if (error) {
            console.error('Supabase insert error (rooms):', error);
            return res.status(500).json({ error: error.message || 'failed to create room', detail: error });
        }

        const createdRoom = data; // the inserted room row

        // --- NEW: create initial room_playback row (idempotent) ---
        // Use upsert on room_id so repeated attempts are safe
        try {
            const playbackRow = {
                room_id: Number(createdRoom.id),
                video_url: createdRoom.video_url || null,
                is_playing: false,
                playback_time: 0,
                client_ts: 0,
                updated_by: createdRoom.created_by || null,
            };

            const { data: pbData, error: pbError } = await supabaseAdmin
                .from('room_playback')
                .upsert([playbackRow], { onConflict: 'room_id' })
                .select()
                .single();

            if (pbError) {
                // warn but do not fail room creation (idempotency or FK issues will be visible here)
                console.warn('Failed to create initial room_playback (non-fatal):', pbError);
            } else {
                // optional: you can log pbData for debugging
                // console.log('Created initial room_playback:', pbData);
            }
        } catch (e) {
            // catch unexpected exceptions and continue (non-fatal)
            console.warn('Exception while creating initial room_playback (non-fatal):', e);
        }
        // ------------------ END room_playback upsert ------------------

        // Return the created room object
        return res.status(201).json({ room: createdRoom });
    } catch (err) {
        console.error('Create room error:', err);
        return res.status(500).json({ error: 'internal server error' });
    }
});

/**
 * PATCH /api/rooms/:id
 * Body: { video_url?: string, title?: string, subject?: string }
 * Requires: Authorization: Bearer <app-jwt> (verifyToken)
 */
/**
 * PATCH /api/rooms/:id
 * Body: { video_url?: string, title?: string, subject?: string }
 * Requires: Authorization: Bearer <app-jwt> (verifyToken)
 *
 * Note: ANY authenticated user can update the room now (no creator-only restriction).
 */
router.patch('/:id', verifyToken, async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    if (Number.isNaN(roomId)) return res.status(400).json({ error: 'invalid room id' });

    // fetch existing room
    const { data: existingRoom, error: fetchErr } = await supabaseAdmin
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle();

    if (fetchErr) {
      console.error('Supabase select error (rooms fetch):', fetchErr);
      return res.status(500).json({ error: fetchErr.message || 'failed to fetch room' });
    }
    if (!existingRoom) return res.status(404).json({ error: 'room not found' });

    // requester id (for audit) — may be null if you later remove verifyToken
    const requesterId = req.user?.id ?? null;

    const updates = {};
    if (typeof req.body.video_url !== 'undefined') updates.video_url = req.body.video_url;
    if (typeof req.body.title !== 'undefined') updates.title = req.body.title;
    if (typeof req.body.subject !== 'undefined') updates.subject = req.body.subject;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'no fields to update' });
    }

    const { data: updatedRoom, error: updateErr } = await supabaseAdmin
      .from('rooms')
      .update(updates)
      .eq('id', roomId)
      .select()
      .single();

    if (updateErr) {
      console.error('Supabase update error (rooms):', updateErr);
      return res.status(500).json({ error: updateErr.message || 'failed to update room' });
    }

    // If video_url changed, reset/upsert room_playback row so players re-sync to start
    if (typeof updates.video_url !== 'undefined') {
      try {
        const playbackRow = {
          room_id: roomId,
          video_url: updates.video_url ?? null,
          is_playing: false,
          playback_time: 0,
          client_ts: 0,
          updated_by: requesterId,
        };
        const { data: pbData, error: pbError } = await supabaseAdmin
          .from('room_playback')
          .upsert([playbackRow], { onConflict: 'room_id' })
          .select()
          .single();

        if (pbError) {
          // non-fatal but log for debugging
          console.warn('room_playback upsert warning after video_url update:', pbError);
        }
      } catch (e) {
        console.warn('Exception upserting room_playback after video update:', e);
      }
    }

    return res.json({ room: updatedRoom });
  } catch (err) {
    console.error('PATCH /api/rooms/:id error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});



module.exports = router;
