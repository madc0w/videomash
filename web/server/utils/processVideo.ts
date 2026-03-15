import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface WordTimestamp {
	word: string;
	start: number;
	end: number;
}

export interface IndexEntry {
	url: string;
	word: string;
	start: number;
	length: number;
	category?: string;
	source?: string;
}

const MIN_DURATION = 0.1;
const MAX_GAP = 0.4;
const N_GRAM_SIZES = [1, 2, 3, 4];

function sanitize(text: string): string {
	return text.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

function hasLargeGap(slice: WordTimestamp[]): boolean {
	for (let j = 1; j < slice.length; j++) {
		if (slice[j].start - slice[j - 1].end > MAX_GAP) return true;
	}
	return false;
}

/**
 * Extract audio from a video file as mp3 for Whisper.
 */
export function extractAudio(videoPath: string, outputDir: string): string {
	const audioPath = path.join(outputDir, 'audio.mp3');
	execSync(
		`ffmpeg -y -i "${videoPath}" -vn -acodec libmp3lame -q:a 4 "${audioPath}"`,
		{ stdio: 'pipe' }
	);
	return audioPath;
}

/**
 * Transcribe audio with OpenAI Whisper, returning word-level timestamps.
 */
export async function transcribeAudio(
	audioPath: string,
	apiKey: string
): Promise<WordTimestamp[]> {
	const OpenAI = (await import('openai')).default;
	const openai = new OpenAI({ apiKey });

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

	return words.map((w) => ({
		word: w.word.trim(),
		start: w.start,
		end: w.end,
	}));
}

/**
 * Split video into n-gram clips, upload to Cloudinary,
 * skipping words/phrases already in the existing index.
 * Returns only the NEW entries.
 */
export async function splitAndUpload(
	videoPath: string,
	words: WordTimestamp[],
	existingIndex: IndexEntry[],
	cloudConfig: { cloudName: string; apiKey: string; apiSecret: string },
	outputDir: string,
	indexPath: string,
	category?: string,
	source?: string,
	onProgress?: (msg: string) => void
): Promise<IndexEntry[]> {
	const { v2: cloudinary } = await import('cloudinary');

	cloudinary.config({
		cloud_name: cloudConfig.cloudName,
		api_key: cloudConfig.apiKey,
		api_secret: cloudConfig.apiSecret,
	});

	const existingKeys = new Set(
		existingIndex.map(
			(e) =>
				`${e.word.toLowerCase().trim()}|${e.category ?? ''}|${
					e.start != null ? (+e.start).toFixed(1) : ''
				}|${e.source ?? ''}`
		)
	);
	const baseName = sanitize(path.basename(videoPath, path.extname(videoPath)));
	const clipsDir = path.join(outputDir, 'clips');
	fs.mkdirSync(clipsDir, { recursive: true });

	const newEntries: IndexEntry[] = [];

	// Pre-count total candidate clips for progress reporting
	let totalCandidates = 0;
	for (const n of N_GRAM_SIZES) {
		for (let i = 0; i <= words.length - n; i++) {
			const slice = words.slice(i, i + n);
			if (n > 1 && hasLargeGap(slice)) continue;
			const start = slice[0].start;
			const end = slice[slice.length - 1].end;
			const duration = +(end - start).toFixed(4);
			const label = slice
				.map((w) => w.word)
				.join(' ')
				.toLowerCase();
			if (duration < MIN_DURATION) continue;
			const key = `${label}|${category ?? ''}|${start.toFixed(1)}|${
				source ?? ''
			}`;
			if (!existingKeys.has(key)) {
				totalCandidates++;
			}
		}
	}

	let clipsDone = 0;

	for (const n of N_GRAM_SIZES) {
		for (let i = 0; i <= words.length - n; i++) {
			const slice = words.slice(i, i + n);
			if (n > 1 && hasLargeGap(slice)) continue;

			const start = slice[0].start;
			const end = slice[slice.length - 1].end;
			const label = slice.map((w) => w.word).join(' ');
			const lowerLabel = label.toLowerCase();
			const duration = +(end - start).toFixed(4);

			if (duration < MIN_DURATION) continue;
			const entryKey = `${lowerLabel}|${category ?? ''}|${start.toFixed(1)}|${
				source ?? ''
			}`;
			if (existingKeys.has(entryKey)) continue;

			const seq = String(i + 1).padStart(4, '0');
			const safeName = sanitize(label);
			const filename = `${n}w_${seq}_${safeName}.mp4`;
			const outPath = path.join(clipsDir, filename);
			const publicId = `videomash/${baseName}/${n}w_${seq}_${safeName}`;

			try {
				execSync(
					`ffmpeg -y -i "${videoPath}" -ss ${start} -to ${end} -c:v libx264 -c:a aac -avoid_negative_ts make_zero "${outPath}"`,
					{ stdio: 'pipe' }
				);

				const result = await cloudinary.uploader.upload(outPath, {
					resource_type: 'video',
					public_id: publicId,
					overwrite: true,
				});

				fs.unlinkSync(outPath);

				const entry: IndexEntry = {
					url: result.secure_url,
					word: lowerLabel,
					start,
					length: duration,
					...(category ? { category } : {}),
					...(source ? { source } : {}),
				};
				newEntries.push(entry);
				existingKeys.add(entryKey);
				writeIndex(indexPath, [...existingIndex, ...newEntries]);
				clipsDone++;
				onProgress?.(`Clip ${clipsDone}/${totalCandidates}: "${label}"`);
			} catch {
				// Skip failed clips
				clipsDone++;
				onProgress?.(
					`Clip ${clipsDone}/${totalCandidates}: "${label}" (failed, skipped)`
				);
			}
		}
	}

	// Clean up clips directory
	try {
		fs.rmSync(clipsDir, { recursive: true, force: true });
	} catch {}

	return newEntries;
}

/**
 * Read the consolidated index.json from public/.
 */
export function readIndex(indexPath: string): IndexEntry[] {
	if (fs.existsSync(indexPath)) {
		return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
	}
	return [];
}

/**
 * Write the consolidated index.json.
 */
export function writeIndex(indexPath: string, index: IndexEntry[]): void {
	const dir = path.dirname(indexPath);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}
