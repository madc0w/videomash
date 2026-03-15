import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { IndexEntry, WordTimestamp } from './types.js';
import { uploadClip } from './upload.js';

const MIN_DURATION = 0.1; // minimum clip length in seconds
const MAX_GAP = 0.4; // max silence gap (seconds) between consecutive words
const N_GRAM_SIZES = [1, 2, 3, 4]; // produce clips for 1-, 2-, 3-, and 4-word sequences

/**
 * Check whether a sequence of words has any inter-word gap exceeding MAX_GAP.
 */
function hasLargeGap(slice: WordTimestamp[]): boolean {
	for (let j = 1; j < slice.length; j++) {
		const gap = slice[j].start - slice[j - 1].end;
		if (gap > MAX_GAP) return true;
	}
	return false;
}

/**
 * Sanitize a string for use in a filename.
 */
function sanitize(text: string): string {
	return text.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

/**
 * Cut a single clip, upload to Cloudinary, delete local file.
 * Returns the IndexEntry or null on failure.
 */
async function cutAndUpload(
	videoPath: string,
	start: number,
	end: number,
	label: string,
	outPath: string,
	publicId: string
): Promise<IndexEntry | null> {
	const duration = +(end - start).toFixed(4);

	if (duration < MIN_DURATION) {
		console.log(`  ⚠ "${label}" — skipped (${duration}s too short)`);
		return null;
	}

	try {
		execSync(
			`ffmpeg -y -i "${videoPath}" -ss ${start} -to ${end} -c:v libx264 -c:a aac -avoid_negative_ts make_zero "${outPath}"`,
			{ stdio: 'pipe' }
		);

		console.log(`  ↑ Uploading…`);
		const url = await uploadClip(outPath, publicId);
		console.log(`  ✓ ${url}`);

		fs.unlinkSync(outPath);

		return { url, word: label.toLowerCase(), start, length: duration };
	} catch (err) {
		console.error(`  ⚠ Failed on "${label}", skipping`);
		return null;
	}
}

/**
 * Split a video into clips for every 1-, 2-, 3-, and 4-word sequence,
 * upload each to Cloudinary, then delete the local file.
 */
export async function splitVideo(
	videoPath: string,
	words: WordTimestamp[],
	outputDir: string,
	indexPath: string
): Promise<IndexEntry[]> {
	const index: IndexEntry[] = [];
	const baseName = sanitize(path.basename(videoPath, path.extname(videoPath)));

	for (const n of N_GRAM_SIZES) {
		console.log(`\n── ${n}-word sequences ──`);

		for (let i = 0; i <= words.length - n; i++) {
			const slice = words.slice(i, i + n);

			// Skip sequences with large gaps between words
			if (n > 1 && hasLargeGap(slice)) {
				const label = slice.map((w) => w.word).join(' ');
				console.log(`  ⚠ "${label}" — skipped (gap > ${MAX_GAP}s)`);
				continue;
			}

			const start = slice[0].start;
			const end = slice[slice.length - 1].end;
			const label = slice.map((w) => w.word).join(' ');

			const seq = String(i + 1).padStart(4, '0');
			const safeName = sanitize(label);
			const filename = `${n}w_${seq}_${safeName}.mp4`;
			const outPath = path.join(outputDir, filename);
			const publicId = `videomash/${baseName}/${n}w_${seq}_${safeName}`;

			console.log(
				`[${i + 1}/${words.length - n + 1}] "${label}" (${start.toFixed(
					2
				)}s → ${end.toFixed(2)}s)`
			);

			const entry = await cutAndUpload(
				videoPath,
				start,
				end,
				label,
				outPath,
				publicId
			);
			if (entry) {
				index.push(entry);
				fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
			}
		}
	}

	return index;
}
