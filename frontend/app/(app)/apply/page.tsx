'use client';

import { useState } from 'react';

type FormState = {
  name: string;
  email: string;
  phone: string;
  date: string;
  hour: string;
  minute: string;
  ampm: 'AM' | 'PM';
  resume: File | null;
};

export default function ApplyPage() {
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    phone: '',
    date: '',
    hour: '10',
    minute: '00',
    ampm: 'AM',
    resume: null,
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [interviewUrl, setInterviewUrl] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{
    name?: string;
    phone?: string;
    datetime?: string;
    resume?: string;
  }>({});

  // Generate hours (1-12) and minutes (00-59) arrays
  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  // Get minimum date (today)
  const getMinDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Validate name - only letters and spaces
  const handleNameChange = (value: string) => {
    // Allow only letters, spaces, and common name characters (hyphens, apostrophes)
    const cleaned = value.replace(/[^a-zA-Z\s'-]/g, '');
    setForm(f => ({ ...f, name: cleaned }));
    if (cleaned && !/^[a-zA-Z\s'-]+$/.test(cleaned)) {
      setValidationErrors(e => ({ ...e, name: 'Name can only contain letters and spaces' }));
    } else {
      setValidationErrors(e => {
        const { name, ...rest } = e;
        return rest;
      });
    }
  };

  // Validate phone - only digits, exactly 10 digits
  const handlePhoneChange = (value: string) => {
    // Remove all non-digit characters
    const digitsOnly = value.replace(/\D/g, '');
    // Limit to 10 digits
    const limited = digitsOnly.slice(0, 10);
    setForm(f => ({ ...f, phone: limited }));
    
    if (limited && limited.length !== 10) {
      setValidationErrors(e => ({ ...e, phone: 'Phone number must be exactly 10 digits' }));
    } else {
      setValidationErrors(e => {
        const { phone, ...rest } = e;
        return rest;
      });
    }
  };

  // Validate date/time is in the future
  const validateDateTime = () => {
    if (!form.date) {
      setValidationErrors(e => ({ ...e, datetime: 'Please select a date and time' }));
      return false;
    }

    const datetime = getDateTimeString();
    if (!datetime) {
      setValidationErrors(e => ({ ...e, datetime: 'Please select a date and time' }));
      return false;
    }

    const selectedDateTime = new Date(datetime);
    const now = new Date();
    
    // Add 1 minute buffer to ensure we're truly in the future
    const buffer = new Date(now.getTime() + 60000); // 1 minute from now

    if (selectedDateTime <= buffer) {
      setValidationErrors(e => ({ ...e, datetime: 'Please select a date and time at least 1 minute in the future' }));
      return false;
    }

    setValidationErrors(e => {
      const { datetime, ...rest } = e;
      return rest;
    });
    return true;
  };

  // Convert form fields to datetime string for API
  function getDateTimeString(): string {
    if (!form.date) return '';
    
    // Convert 12-hour to 24-hour format
    let hour24 = parseInt(form.hour, 10);
    if (form.ampm === 'PM' && hour24 !== 12) {
      hour24 += 12;
    } else if (form.ampm === 'AM' && hour24 === 12) {
      hour24 = 0;
    }
    
    const hour24Str = String(hour24).padStart(2, '0');
    const minuteStr = form.minute.padStart(2, '0');
    
    // Create a Date object from local date/time (this interprets it in user's local timezone)
    const localDate = new Date(`${form.date}T${hour24Str}:${minuteStr}`);
    
    // Get timezone offset in minutes and convert to hours:minutes format
    const offsetMinutes = localDate.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
    const offsetMins = Math.abs(offsetMinutes) % 60;
    const offsetSign = offsetMinutes <= 0 ? '+' : '-';
    const offsetStr = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;
    
    // Format as YYYY-MM-DDTHH:mm:ss+HH:mm (with timezone offset)
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const hours = String(localDate.getHours()).padStart(2, '0');
    const minutes = String(localDate.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}:00${offsetStr}`;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    setError(null);
    setInterviewUrl(null);

    // Validate all fields
    if (!form.name.trim()) {
      setError('Please enter your name');
      setStatus('error');
      return;
    }

    if (!/^[a-zA-Z\s'-]+$/.test(form.name.trim())) {
      setError('Name can only contain letters and spaces');
      setStatus('error');
      return;
    }

    if (form.phone.length !== 10) {
      setError('Phone number must be exactly 10 digits');
      setStatus('error');
      return;
    }

    const datetime = getDateTimeString();
    if (!datetime) {
      setError('Please select a date and time');
      setStatus('error');
      return;
    }

    const selectedDateTime = new Date(datetime);
    const now = new Date();
    if (selectedDateTime <= now) {
      setError('Please select a future date and time');
      setStatus('error');
      return;
    }

    if (!form.resume) {
      setError('Please upload your application');
      setStatus('error');
      return;
    }

    try {
      // First, upload application and extract text
      const { uploadApplication, scheduleInterview } = await import('@/lib/api');
      
      if (!form.resume) {
        throw new Error('Application file is required');
      }
      
      const uploadData = await uploadApplication(form.resume);

      // Then, schedule interview with resume data
      const data = await scheduleInterview({
        name: form.name,
        email: form.email,
        phone: form.phone,
        datetime,
        resumeUrl: uploadData.resumeUrl,
        resumeText: uploadData.resumeText ?? undefined,
      });

      setInterviewUrl(data.interviewUrl ?? null);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Schedule your interview</h1>
          <p className="text-sm text-muted-foreground">
            Share your details and choose a convenient date and time. You&apos;ll receive a unique
            interview link by email.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Full name</label>
            <input
              type="text"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-0 focus-visible:border-blue-500"
              value={form.name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Enter your full name"
              pattern="[a-zA-Z\s'-]+"
              title="Name can only contain letters and spaces"
              required
            />
            {validationErrors.name && (
              <p className="text-xs text-red-600">{validationErrors.name}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Email address</label>
            <input
              type="email"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-0 focus-visible:border-blue-500"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Phone number</label>
            <input
              type="tel"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-0 focus-visible:border-blue-500"
              value={form.phone}
              onChange={e => handlePhoneChange(e.target.value)}
              placeholder="10 digit phone number"
              pattern="[0-9]{10}"
              title="Phone number must be exactly 10 digits"
              maxLength={10}
              required
            />
            {validationErrors.phone && (
              <p className="text-xs text-red-600">{validationErrors.phone}</p>
            )}
            {form.phone && form.phone.length < 10 && (
              <p className="text-xs text-muted-foreground">
                {form.phone.length}/10 digits
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Upload Application</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-0 focus-visible:border-blue-500 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) {
                  // Validate file size (max 5MB)
                  if (file.size > 5 * 1024 * 1024) {
                    setValidationErrors(e => ({
                      ...e,
                      resume: 'Application file must be less than 5MB',
                    }));
                    setForm(f => ({ ...f, resume: null }));
                    return;
                  }
                  // Validate file type
                  const validTypes = [
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  ];
                  if (!validTypes.includes(file.type)) {
                    setValidationErrors(e => ({
                      ...e,
                      resume: 'Please upload a PDF or DOC/DOCX file',
                    }));
                    setForm(f => ({ ...f, resume: null }));
                    return;
                  }
                  setForm(f => ({ ...f, resume: file }));
                  setValidationErrors(e => {
                    const { resume, ...rest } = e;
                    return rest;
                  });
                }
              }}
              required
            />
            {validationErrors.resume && (
              <p className="text-xs text-red-600">{validationErrors.resume}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Accepted formats: PDF, DOC, DOCX (Max 5MB)
            </p>
            {form.resume && (
              <p className="text-xs text-green-600">
                ✓ Selected: {form.resume.name} ({(form.resume.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">Preferred date &amp; time</label>
            
            {/* Date picker */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Date</label>
              <input
                type="date"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-0 focus-visible:border-blue-500"
                value={form.date}
                onChange={e => {
                  setForm(f => ({ ...f, date: e.target.value }));
                  // Validate after date change
                  setTimeout(validateDateTime, 100);
                }}
                required
                min={getMinDate()} // Prevent past dates
              />
            </div>

            {/* Time dropdowns */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Hour</label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-0 focus-visible:border-blue-500"
                  value={form.hour}
                  onChange={e => {
                    setForm(f => ({ ...f, hour: e.target.value }));
                    setTimeout(validateDateTime, 100);
                  }}
                  required
                >
                  {hours.map(h => (
                    <option key={h} value={h}>
                      {parseInt(h, 10)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Minute</label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-0 focus-visible:border-blue-500"
                  value={form.minute}
                  onChange={e => {
                    setForm(f => ({ ...f, minute: e.target.value }));
                    setTimeout(validateDateTime, 100);
                  }}
                  required
                >
                  {minutes.map(m => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">AM/PM</label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-0 focus-visible:border-blue-500"
                  value={form.ampm}
                  onChange={e => {
                    setForm(f => ({ ...f, ampm: e.target.value as 'AM' | 'PM' }));
                    setTimeout(validateDateTime, 100);
                  }}
                  required
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
            {validationErrors.datetime && (
              <p className="text-xs text-red-600">{validationErrors.datetime}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={status === 'loading'}
            className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-60"
          >
            {status === 'loading' ? 'Scheduling…' : 'Schedule interview'}
          </button>
        </form>

        {status === 'success' && (
          <div className="space-y-3 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <p className="font-semibold">✅ Interview scheduled successfully!</p>
            {interviewUrl ? (
              <div className="space-y-2">
                <p>Your unique interview link:</p>
                <a
                  href={interviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block break-all rounded bg-green-100 px-3 py-2 font-mono text-xs text-green-900 underline hover:bg-green-200 dark:bg-green-900 dark:text-green-100 dark:hover:bg-green-800"
                >
                  {interviewUrl}
                </a>
                <p className="text-xs text-green-700 dark:text-green-300">
                  ⚠️ For testing: Click the link above. In production, this will be sent via email.
                </p>
              </div>
            ) : (
              <p>We&apos;ve sent a unique join link to your email.</p>
            )}
          </div>
        )}
        {status === 'error' && error && (
          <p className="text-sm text-red-600">Something went wrong: {error}</p>
        )}
      </div>
    </main>
  );
}


