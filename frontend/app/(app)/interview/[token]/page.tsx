import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { App } from '@/components/app/app';
import { getAppConfig } from '@/lib/utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface InterviewPageProps {
  params: Promise<{
    token: string;
  }>;
}

async function getBooking(token: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/booking/${token}`, {
      cache: 'no-store',
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      console.error('[InterviewPage] Failed to fetch booking:', response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[InterviewPage] Error fetching booking:', error);
    return null;
  }
}

export default async function InterviewPage({ params }: InterviewPageProps) {
  // Await params first (required in Next.js 15)
  const { token } = await params;

  console.log('[InterviewPage] Token received:', token);
  console.log('[InterviewPage] Looking for booking in backend...');

  // Get booking from Python backend
  const booking = await getBooking(token);
  
  console.log('[InterviewPage] Booking found:', booking ? 'YES' : 'NO');
  
  if (!booking) {
    console.log('[InterviewPage] Token not found:', token);
    return notFound();
  }

  // Parse scheduled_at as UTC and convert to local time for display
  const scheduledAt = new Date(booking.scheduled_at);
  const now = new Date();
  const diffMinutes = (now.getTime() - scheduledAt.getTime()) / 60000;

  // Format date/time in user's local timezone
  const formattedDate = scheduledAt.toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  });

  if (diffMinutes < -5) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-2xl font-semibold">Your interview has not started yet</h1>
          <p className="text-sm text-muted-foreground">
            Scheduled for {formattedDate}.
          </p>
          <p className="text-sm text-muted-foreground">
            Please join within 5 minutes before the scheduled time.
          </p>
        </div>
      </main>
    );
  }

  if (diffMinutes > 60) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-2xl font-semibold">Interview window has expired</h1>
          <p className="text-sm text-muted-foreground">
            This link is no longer active. Please contact support to reschedule.
          </p>
        </div>
      </main>
    );
  }

  const hdrs = await headers();
  const appConfig = await getAppConfig(hdrs);

  // Within the allowed window → render existing LiveKit app UI
  // Pass the token so connection-details can fetch resume text
  return <App appConfig={appConfig} interviewToken={token} />;
}


