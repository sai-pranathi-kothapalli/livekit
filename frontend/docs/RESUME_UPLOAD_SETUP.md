# Resume Upload Feature - Setup Complete ✅

## What's Been Implemented

1. ✅ **Resume Upload Field** - Added to `/apply` page with validation (PDF, DOC, DOCX, max 5MB)
2. ✅ **Upload API** - `/api/upload-resume` handles file upload to Supabase Storage and text extraction
3. ✅ **Text Extraction** - Uses `pdf-parse` for PDFs and `mammoth` for DOCX files
4. ✅ **Database Storage** - Resume text and URL stored in `interview_bookings` table
5. ✅ **Backend Integration** - Resume text passed to AI agent for personalized questions
6. ✅ **Packages Installed** - `pdf-parse` and `mammoth` are already in package.json

## Next Steps (Required)

### 1. Add Columns to Supabase Table

Run this SQL in your Supabase SQL Editor:

```sql
ALTER TABLE interview_bookings 
ADD COLUMN IF NOT EXISTS resume_text TEXT,
ADD COLUMN IF NOT EXISTS resume_url TEXT;
```

Or use the file: `supabase_schema_update.sql`

### 2. Verify Supabase Storage Bucket Permissions

1. Go to Supabase Dashboard → Storage
2. Click on `resumes` bucket
3. Make sure it's set to **Public** (or configure RLS policies if you want it private)
4. Verify the bucket exists and is accessible

### 3. Test the Flow

1. Visit `/apply` page
2. Fill in the form and upload a resume (PDF or DOCX)
3. Submit the form
4. Check that:
   - Resume is uploaded to Supabase Storage
   - Resume text is extracted and stored in database
   - Interview link is generated
   - When interview starts, agent receives resume text

## How It Works

1. **User uploads resume** → Form validates file (type, size)
2. **Frontend calls `/api/upload-resume`** → Uploads to Supabase Storage, extracts text
3. **Frontend calls `/api/schedule-interview`** → Stores resume_text and resume_url in database
4. **User clicks interview link** → `/interview/[token]` page loads
5. **User clicks "Start Interview"** → `/api/connection-details` fetches booking and passes resume_text to LiveKit room metadata
6. **Backend agent receives resume** → Extracts from room metadata and uses it to personalize questions

## File Structure

```
frontend/
├── app/
│   ├── (app)/
│   │   ├── apply/page.tsx          # Form with resume upload
│   │   └── interview/[token]/page.tsx  # Interview page
│   └── api/
│       ├── upload-resume/route.ts  # Upload & extract text
│       └── schedule-interview/route.ts  # Store booking with resume
├── lib/
│   └── inMemoryBookings.ts         # Database functions (updated)
└── components/app/
    └── app.tsx                      # Passes token to connection-details

backend/
└── agent.py                        # Agent uses resume_text for questions
```

## Troubleshooting

### Resume upload fails
- Check Supabase Storage bucket exists and is accessible
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`

### Text extraction fails
- Ensure file is not corrupted
- Check file type is PDF, DOC, or DOCX
- Verify `pdf-parse` and `mammoth` packages are installed

### Agent doesn't receive resume
- Check backend logs for "RESUME DETECTED" message
- Verify resume_text is stored in database
- Check room metadata is being passed correctly

## Notes

- Resume text is limited to first 3000 characters to avoid token limits
- Files are stored with unique names: `{timestamp}_{random}.{ext}`
- Resume text is cleaned (whitespace normalized) before storage
- If text extraction fails, the upload still succeeds (URL stored, text is null)

