import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createBooking } from '@/lib/inMemoryBookings';

type SchedulePayload = {
  name: string;
  email: string;
  phone: string;
  datetime: string; // ISO or datetime-local string
  resumeUrl?: string;
  resumeText?: string;
};

// Create SMTP transporter (reusable)
const getSmtpTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  if (!host || !user || !password) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure, // true for 465, false for other ports
    auth: {
      user,
      pass: password,
    },
    // Additional options for better reliability
    tls: {
      rejectUnauthorized: false, // For self-signed certificates (if needed)
    },
  });
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SchedulePayload;
    const { name, email, phone, datetime, resumeUrl, resumeText } = body;

    console.log('[schedule-interview] Received request:', { 
      name, 
      email, 
      phone, 
      datetime,
      hasResume: !!resumeText,
      resumeTextLength: resumeText?.length ?? 0,
    });

    if (!name || !email || !phone || !datetime) {
      console.error('[schedule-interview] Missing fields:', { name: !!name, email: !!email, phone: !!phone, datetime: !!datetime });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const scheduledAt = new Date(datetime);
    if (Number.isNaN(scheduledAt.getTime())) {
      console.error('[schedule-interview] Invalid datetime:', datetime);
      return NextResponse.json({ error: 'Invalid datetime' }, { status: 400 });
    }

    console.log('[schedule-interview] Parsed datetime:', scheduledAt.toISOString());

    // Create booking in Supabase
    const token = await createBooking({
      name,
      email,
      phone,
      scheduled_at: scheduledAt.toISOString(),
      resume_text: resumeText || null,
      resume_url: resumeUrl || null,
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? 'http://localhost:3000';
    const interviewUrl = `${baseUrl.replace(/\/$/, '')}/interview/${token}`;

    // Format scheduled date/time for email
    const formattedDate = scheduledAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = scheduledAt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    // Send email via SMTP
    const transporter = getSmtpTransporter();
    const fromName = process.env.SMTP_FROM_NAME || "Sreedhar's CCE Team";
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

    if (!transporter || !fromEmail) {
      console.warn('[schedule-interview] SMTP not configured - skipping email send');
      return NextResponse.json({
        ok: true,
        interviewUrl,
        emailSent: false,
        emailError: 'Email service not configured',
      });
    }

    try {
      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject: 'Your Regional Rural Bank PO Interview - Join Link',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #002cf2 0%, #1fd5f9 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .button { display: inline-block; background: #002cf2; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
                .button:hover { background: #001bb8; }
                .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
                .detail-row { margin: 10px 0; }
                .detail-label { font-weight: bold; color: #555; }
                .logo-text { font-size: 16px; font-weight: bold; margin-top: 10px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🎯 Your Interview is Scheduled!</h1>
                  <p style="margin: 0; font-size: 18px;">Regional Rural Bank Probationary Officer (PO)</p>
                  <div class="logo-text">Sreedhar's CCE - RESULTS SUPER STAR</div>
                </div>
                <div class="content">
                  <p>Hi <strong>${name}</strong>,</p>
                  
                  <p>Thank you for applying for the <strong>Regional Rural Bank Probationary Officer (PO)</strong> position!</p>
                  
                  <div class="details">
                    <h2 style="margin-top: 0; color: #002cf2;">📅 Interview Details</h2>
                    <div class="detail-row">
                      <span class="detail-label">Date:</span> ${formattedDate}
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Time:</span> ${formattedTime} (IST)
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Position:</span> Regional Rural Bank Probationary Officer (PO)
                    </div>
                  </div>

                  <p><strong>Your unique interview link is ready!</strong> Click the button below to join your interview at the scheduled time:</p>
                  
                  <div style="text-align: center;">
                    <a href="${interviewUrl}" class="button">Join Interview</a>
                  </div>
                  
                  <p style="font-size: 14px; color: #666; margin-top: 30px;">
                    <strong>Important Notes:</strong>
                  </p>
                  <ul style="font-size: 14px; color: #666;">
                    <li>This link will be active <strong>5 minutes before</strong> your scheduled time</li>
                    <li>The interview window is open for <strong>60 minutes</strong> after the scheduled time</li>
                    <li>Please ensure you have a stable internet connection and a quiet environment</li>
                    <li>You can test your microphone and camera before joining</li>
                    <li>The interview will cover: Personal Introduction, RRB Background, Current Affairs for Banking, and Domain Knowledge</li>
                  </ul>
                  
                  <p style="font-size: 12px; color: #999; margin-top: 20px;">
                    If you have any questions or need to reschedule, please contact us at your earliest convenience.
                  </p>
                  
                  <div class="footer">
                    <p>Best regards,<br><strong>Sreedhar's CCE Team</strong><br>RESULTS SUPER STAR</p>
                    <p style="margin-top: 20px;">
                      <a href="${interviewUrl}" style="color: #002cf2; word-break: break-all;">${interviewUrl}</a>
                    </p>
                  </div>
                </div>
              </div>
            </body>
          </html>
        `,
      });

      console.log(`[schedule-interview] ✅ Email sent successfully to ${email} (Message ID: ${info.messageId})`);
      return NextResponse.json({ ok: true, interviewUrl, emailSent: true });
    } catch (emailErr) {
      console.error('[schedule-interview] SMTP email error:', emailErr);
      return NextResponse.json({
        ok: true,
        interviewUrl,
        emailSent: false,
        emailError: emailErr instanceof Error ? emailErr.message : 'Unknown error',
      });
    }
  } catch (err) {
    console.error('[schedule-interview] Unexpected error', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[schedule-interview] Error details:', {
      message: errorMessage,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: `Failed to schedule interview: ${errorMessage}` },
      { status: 500 }
    );
  }
}


