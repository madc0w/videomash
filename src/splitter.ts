import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { IndexEntry, WordTimestamp } from './types.js';
import { uploadClip } from './upload.js';

const MIN_DURATION = 0.05; // minimum clip length in seconds

/**
 * Sanitize a word for use in a filename.
 */
function sanitize(word: string): string {
	return word.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

/**
 * Split a video into individual word clips using FFmpeg,
 * upload each to Cloudinary, then delete the local file.
 * Returns the index entries for each clip.
 */
export async function splitVideo(
	videoPath: string,
	words: WordTimestamp[],
	outputDir: string
): Promise<IndexEntry[]> {
	const index: IndexEntry[] = [];
	const baseName = path.basename(videoPath, path.extname(videoPath));

	for (let i = 0; i < words.length; i++) {
		const { word, start, end } = words[i];
		const duration = +(end - start).toFixed(4);

		// Skip words with zero or negative duration
		if (duration < MIN_DURATION) {
			console.log(
				`[${i + 1}/${
					words.length
				}] "${word}" — skipped (duration ${duration}s too short)`
			);
			continue;
		}

		const padded = String(i + 1).padStart(4, '0');
		const safeName = sanitize(word);
		const filename = `${padded}_${safeName}.mp4`;
		const outPath = path.join(outputDir, filename);
		const publicId = `videomash/${sanitize(baseName)}/${padded}_${safeName}`;

		console.log(
			`[${i + 1}/${words.length}] "${word}" (${start.toFixed(
				2
			)}s → ${end.toFixed(2)}s)`
		);

		try {
			execSync(
				`ffmpeg -y -i "${videoPath}" -ss ${start} -to ${end} -c:v libx264 -c:a aac -avoid_negative_ts make_zero "${outPath}"`,
				{ stdio: 'pipe' }
			);

			// Upload to Cloudinary
			console.log(`  ↑ Uploading…`);
			const url = await uploadClip(outPath, publicId);
			console.log(`  ✓ ${url}`);

			// Delete local clip
			fs.unlinkSync(outPath);

			index.push({ url, word, length: duration });
		} catch (err) {
			console.error(`  ⚠ Failed on "${word}", skipping`);
		}
	}

	return index;
}
