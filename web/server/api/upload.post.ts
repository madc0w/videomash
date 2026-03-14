import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	const body = await readBody(event);
	if (!body) {
		throw createError({ statusCode: 400, statusMessage: 'No request body' });
	}

	// Validate password
	const { password, category, youtubeUrl } = body;
	if (!config.adminPassword || password !== config.adminPassword) {
		throw createError({ statusCode: 401, statusMessage: 'Invalid password' });
	}

	// Validate YouTube URL
	if (!youtubeUrl || typeof youtubeUrl !== 'string') {
		throw createError({
			statusCode: 400,
			statusMessage: 'No YouTube URL provided',
		});
	}

	const ytUrlPattern =
		/^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/;
	if (!ytUrlPattern.test(youtubeUrl)) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Invalid YouTube URL',
		});
	}

	// Set up streaming response (NDJSON)
	const res = event.node.res;
	res.writeHead(200, {
		'Content-Type': 'application/x-ndjson',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive',
		'X-Accel-Buffering': 'no',
	});

	function sendProgress(message: string) {
		res.write(JSON.stringify({ type: 'progress', message }) + '\n');
	}

	function sendResult(data: any) {
		res.write(JSON.stringify({ type: 'result', ...data }) + '\n');
	}

	function sendError(message: string) {
		res.write(JSON.stringify({ type: 'error', message }) + '\n');
	}

	// Download video from YouTube to a temp directory
	const tmpDir = path.join(os.tmpdir(), `videomash-${Date.now()}`);
	fs.mkdirSync(tmpDir, { recursive: true });
	const videoPath = path.join(tmpDir, 'video.mp4');

	sendProgress('Downloading video from YouTube…');

	try {
		execSync(
			`py -3.13 -m yt_dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4" --merge-output-format mp4 -o "${videoPath}" "${youtubeUrl}"`,
			{ timeout: 600_000, stdio: 'pipe' }
		);
	} catch (dlErr: any) {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		sendError(
			`Failed to download video: ${dlErr.stderr?.toString() || dlErr.message}`
		);
		res.end();
		return;
	}

	const indexPath = path.resolve('public', 'index.json');

	try {
		// Read existing consolidated index
		const existingIndex = readIndex(indexPath);

		// Step 1: Extract audio
		sendProgress('Extracting audio…');
		const audioPath = extractAudio(videoPath, tmpDir);

		// Step 2: Transcribe with Whisper
		sendProgress('Transcribing with Whisper…');
		const words = await transcribeAudio(audioPath, config.openaiApiKey);
		sendProgress(
			`Transcription complete — ${words.length} words detected. Generating clips…`
		);

		// Step 3: Split into clips, upload to Cloudinary (skipping duplicates)
		const newEntries = await splitAndUpload(
			videoPath,
			words,
			existingIndex,
			{
				cloudName: config.cloudinaryCloudName,
				apiKey: config.cloudinaryApiKey,
				apiSecret: config.cloudinaryApiSecret,
			},
			tmpDir,
			category,
			youtubeUrl,
			sendProgress
		);

		// Step 4: Merge into consolidated index and save
		sendProgress('Saving index…');
		const mergedIndex = [...existingIndex, ...newEntries];
		writeIndex(indexPath, mergedIndex);

		// Clean up
		fs.rmSync(tmpDir, { recursive: true, force: true });

		sendResult({
			success: true,
			newClips: newEntries.length,
			totalClips: mergedIndex.length,
			words: newEntries.map((e) => e.word),
		});
		res.end();
	} catch (err: any) {
		// Clean up on error
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {}

		sendError(err.message || 'Video processing failed');
		res.end();
	}
});
