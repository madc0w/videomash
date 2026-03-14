import { execSync } from 'child_process';
import fs from 'fs';
import OpenAI from 'openai';
import path from 'path';
import type { WordTimestamp } from './types.js';

const openai = new OpenAI(); // uses OPENAI_API_KEY env var

/**
 * Extract audio from a video file as mp3 (Whisper accepts mp3).
 * Returns the path to the extracted audio file.
 */
export function extractAudio(videoPath: string, outputDir: string): string {
	const audioPath = path.join(outputDir, 'audio.mp3');
	console.log(`Extracting audio → ${audioPath}`);
	execSync(
		`ffmpeg -y -i "${videoPath}" -vn -acodec libmp3lame -q:a 4 "${audioPath}"`,
		{ stdio: 'inherit' }
	);
	return audioPath;
}

/**
 * Send audio to OpenAI Whisper and get word-level timestamps.
 */
export async function transcribe(audioPath: string): Promise<WordTimestamp[]> {
	console.log('Transcribing with Whisper…');

	const transcription = await openai.audio.transcriptions.create({
		file: fs.createReadStream(audioPath),
		model: 'whisper-1',
		response_format: 'verbose_json',
		timestamp_granularities: ['word'],
	});

	const words = (transcription as any).words as Array<{
		word: string;
		start: number;
		end: number;
	}>;

	if (!words || words.length === 0) {
		throw new Error('Whisper returned no word-level timestamps');
	}

	console.log(`Got ${words.length} words`);
	return words.map((w) => ({
		word: w.word.trim(),
		start: w.start,
		end: w.end,
	}));
}
