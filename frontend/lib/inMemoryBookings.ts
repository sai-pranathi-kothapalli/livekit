// Supabase storage for interview bookings
import crypto from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';

type Booking = {
  token: string;
  name: string;
  email: string;
  phone: string;
  scheduled_at: string; // ISO string
  created_at: string;
  resume_text?: string | null;
  resume_url?: string | null;
};

export async function createBooking(
  data: Omit<Booking, 'token' | 'created_at'>
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  const token = crypto.randomBytes(16).toString('hex');
  const booking = {
    token,
    name: data.name,
    email: data.email,
    phone: data.phone,
    scheduled_at: data.scheduled_at,
    created_at: new Date().toISOString(),
    resume_text: data.resume_text ?? null,
    resume_url: data.resume_url ?? null,
  };

  const { error } = await supabaseAdmin.from('interview_bookings').insert(booking);

  if (error) {
    console.error('[createBooking] Supabase insert error:', error);
    throw new Error(`Failed to create booking: ${error.message}`);
  }

  console.log(`[createBooking] ✅ Created booking for ${data.email} with token ${token}`);
  return token;
}

export async function getBooking(token: string): Promise<Booking | null> {
  if (!supabaseAdmin) {
    console.error('[getBooking] Supabase is not configured');
    return null;
  }

  console.log(`[getBooking] Looking for token: ${token}`);

  const { data, error } = await supabaseAdmin
    .from('interview_bookings')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    console.error('[getBooking] Supabase query error:', error);
    return null;
  }

  if (!data) {
    console.log(`[getBooking] Found: NO`);
    return null;
  }

  console.log(`[getBooking] Found: YES`);
  console.log(`[getBooking] Booking details:`, { email: data.email, name: data.name });

  return {
    token: data.token,
    name: data.name,
    email: data.email,
    phone: data.phone,
    scheduled_at: data.scheduled_at,
    created_at: data.created_at,
    resume_text: data.resume_text ?? null,
    resume_url: data.resume_url ?? null,
  };
}

export async function getAllBookings(): Promise<Booking[]> {
  if (!supabaseAdmin) {
    console.error('[getAllBookings] Supabase is not configured');
    return [];
  }

  const { data, error } = await supabaseAdmin.from('interview_bookings').select('*');

  if (error) {
    console.error('[getAllBookings] Supabase query error:', error);
    return [];
  }

  return (
    data?.map(booking => ({
      token: booking.token,
      name: booking.name,
      email: booking.email,
      phone: booking.phone,
      scheduled_at: booking.scheduled_at,
      created_at: booking.created_at,
      resume_text: booking.resume_text ?? null,
      resume_url: booking.resume_url ?? null,
    })) ?? []
  );
}

