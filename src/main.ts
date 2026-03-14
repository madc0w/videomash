import fs from 'fs';
import path from 'path';
import { splitVideo } from './splitter.js';
import { extractAudio, transcribe } from './transcribe.js';
import type { IndexEntry } from './types.js';

async function main() {
	// Join all args after "src/main.ts" to handle paths with spaces
	const videoPath = process.argv.slice(2).join(' ');
	if (!videoPath) {
		console.error('Usage: npx tsx src/main.ts <video-file>');
		process.exit(1);
	}

	const resolvedVideo = path.resolve(videoPath);
	if (!fs.existsSync(resolvedVideo)) {
		console.error(`File not found: ${resolvedVideo}`);
		process.exit(1);
	}

	// Validate Cloudinary config
	if (
		!process.env.CLOUDINARY_CLOUD_NAME ||
		!process.env.CLOUDINARY_API_KEY ||
		!process.env.CLOUDINARY_API_SECRET
	) {
		console.error(
			'Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET'
		);
		process.exit(1);
	}

	// Create output directory based on input filename
	const baseName = path.basename(resolvedVideo, path.extname(resolvedVideo));
	const outputDir = path.resolve('output', baseName);
	fs.mkdirSync(outputDir, { recursive: true });

	// Step 1: Extract audio
	const audioPath = extractAudio(resolvedVideo, outputDir);

	// Step 2: Transcribe with word-level timestamps
	const words = await transcribe(audioPath);

	// Step 3: Split video into per-word clips & upload to Cloudinary
	const clipsDir = path.join(outputDir, 'clips');
	fs.mkdirSync(clipsDir, { recursive: true });
	const index: IndexEntry[] = await splitVideo(resolvedVideo, words, clipsDir);

	// Step 4: Write index.json
	const indexPath = path.join(outputDir, 'index.json');
	fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
	console.log(`\n✓ Done! ${index.length} clips uploaded to Cloudinary.`);
	console.log(`Index: ${indexPath}`);

	// Clean up temp audio
	fs.unlinkSync(audioPath);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
