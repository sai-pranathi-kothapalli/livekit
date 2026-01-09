import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import mammoth from 'mammoth';

// CRITICAL: Ensure Node.js runtime (not Edge) for pdf-parse compatibility
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 5MB' },
        { status: 400 },
      );
    }

    // Validate file type
    const validTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Please upload a PDF or DOC/DOCX file' },
        { status: 400 },
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase storage is not configured' },
        { status: 500 },
      );
    }

    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}.${fileExt}`;
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage
      .from('resumes')
      .upload(fileName, Buffer.from(fileBuffer), {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[upload-application] Supabase upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload application: ' + uploadError.message },
        { status: 500 },
      );
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from('resumes').getPublicUrl(fileName);

    // Extract text from application
    let resumeText = '';
    let extractionError: Error | null = null;
    
    try {
      if (file.type === 'application/pdf') {
        console.log('[upload-application] Starting PDF text extraction with pdf-parse...');
        
        try {
          // Correct CommonJS import for ESM context - use default export
          const pdfParseModule = await import('pdf-parse');
          // pdf-parse is CommonJS, accessed via .default or directly
          const pdfParse = (pdfParseModule as any).default || pdfParseModule;
          
          if (typeof pdfParse !== 'function') {
            throw new Error('pdf-parse did not export a function');
          }
          
          console.log('[upload-application] pdf-parse loaded, parsing PDF...');
          
          const pdfData = await pdfParse(Buffer.from(fileBuffer), {
            // Options for better extraction
            max: 0, // Parse all pages (0 = all)
          });
          
          resumeText = pdfData.text || '';
          console.log(
            `[upload-application] ✅ PDF extraction complete: ${resumeText.length} characters from ${pdfData.numpages} page(s)`,
          );
          
          if (!resumeText || resumeText.trim().length === 0) {
            throw new Error(
              'PDF appears to be image-based (scanned) - no text content found. Please upload a text-based PDF.',
            );
          }
        } catch (pdfError) {
          extractionError = pdfError instanceof Error ? pdfError : new Error(String(pdfError));
          console.error('[upload-application] pdf-parse error:', {
            message: extractionError.message,
            stack: extractionError.stack,
            fileName: file.name,
          });
          throw extractionError; // Re-throw to be caught by outer catch
        }
      } else if (
        file.type === 'application/msword' ||
        file.type ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        console.log('[upload-application] Starting DOCX text extraction with mammoth...');
        const result = await mammoth.extractRawText({
          buffer: Buffer.from(fileBuffer),
        });
        resumeText = result.value || '';
        console.log(
          `[upload-application] ✅ DOCX extraction complete: ${resumeText.length} characters`,
        );
      }

      // Clean up the text (remove extra whitespace, normalize)
      if (resumeText) {
        resumeText = resumeText
          .replace(/\s+/g, ' ')
          .replace(/\n\s*\n/g, '\n')
          .trim();
      }

      if (!resumeText || resumeText.length < 50) {
        console.warn(
          `[upload-application] ⚠️ Extracted text is very short (${resumeText.length} chars) - may be an image-based PDF or extraction issue`,
        );
      }
    } catch (extractError) {
      extractionError = extractError instanceof Error ? extractError : new Error(String(extractError));
      console.error('[upload-application] ❌ Text extraction error:', {
        message: extractionError.message,
        stack: extractionError.stack,
        fileType: file.type,
        fileName: file.name,
      });
      // Don't return early - continue to return success with URL, but no text
      resumeText = '';
    }

    if (resumeText) {
      console.log(
        `[upload-application] ✅ Success: Uploaded ${fileName}, extracted ${resumeText.length} characters`,
      );
    } else {
      console.log(
        `[upload-application] ⚠️ Partial success: Uploaded ${fileName}, but text extraction failed${extractionError ? `: ${extractionError.message}` : ''}`,
      );
    }

    return NextResponse.json({
      resumeUrl: publicUrl,
      resumeText: resumeText || null,
      extractionError: extractionError ? extractionError.message : null,
    });
  } catch (error) {
    console.error('[upload-application] Unexpected error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to process application: ' + errorMessage },
      { status: 500 },
    );
  }
}

