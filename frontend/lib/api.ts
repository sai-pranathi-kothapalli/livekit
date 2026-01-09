/**
 * API Client
 * 
 * Centralized API client for calling the Python backend.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export interface UploadApplicationResponse {
  resumeUrl: string;
  resumeText?: string | null;
  extractionError?: string | null;
}

export interface ScheduleInterviewRequest {
  name: string;
  email: string;
  phone: string;
  datetime: string;
  resumeUrl?: string;
  resumeText?: string;
}

export interface ScheduleInterviewResponse {
  ok: boolean;
  interviewUrl: string;
  emailSent: boolean;
  emailError?: string | null;
}

export interface BookingResponse {
  token: string;
  name: string;
  email: string;
  phone: string;
  scheduled_at: string;
  created_at: string;
  resume_text?: string | null;
  resume_url?: string | null;
}

/**
 * Upload application file and extract text
 */
export async function uploadApplication(file: File): Promise<UploadApplicationResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/upload-application`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to upload application' }));
    throw new Error(error.detail || error.error || 'Failed to upload application');
  }

  return await response.json();
}

/**
 * Schedule an interview
 */
export async function scheduleInterview(data: ScheduleInterviewRequest): Promise<ScheduleInterviewResponse> {
  const response = await fetch(`${API_BASE_URL}/api/schedule-interview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to schedule interview' }));
    throw new Error(error.detail || error.error || 'Failed to schedule interview');
  }

  return await response.json();
}

/**
 * Get booking by token
 */
export async function getBooking(token: string): Promise<BookingResponse | null> {
  const response = await fetch(`${API_BASE_URL}/api/booking/${token}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch booking' }));
    throw new Error(error.detail || error.error || 'Failed to fetch booking');
  }

  return await response.json();
}

