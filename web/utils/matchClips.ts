export interface IndexEntry {
	url: string;
	word: string;
	length: number;
	category?: string;
}

/**
 * Greedy longest-match algorithm.
 *
 * Given user text and the clip index, find the sequence of clips
 * that covers the text using the fewest (longest) clips.
 * If category is provided, only clips with that category are used.
 *
 * Returns { clips } on success, or { error, word } if a word is not found.
 */
export function matchClips(
	text: string,
	index: IndexEntry[],
	category?: string
):
	| { clips: IndexEntry[]; error?: undefined }
	| { clips?: undefined; error: string } {
	// Filter by category if provided
	const filtered = category
		? index.filter((e) => e.category === category)
		: index;

	const words = text
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9'\s]/g, '')
		.split(/\s+/)
		.filter(Boolean);

	if (words.length === 0) {
		return { error: 'Please enter some text.' };
	}

	// Build a lookup: normalised phrase -> IndexEntry (keep first occurrence)
	const lookup = new Map<string, IndexEntry>();
	for (const entry of filtered) {
		const key = entry.word.toLowerCase().trim();
		if (!lookup.has(key)) {
			lookup.set(key, entry);
		}
	}

	// Find the maximum n-gram size available in the index
	let maxN = 1;
	for (const entry of filtered) {
		const n = entry.word.trim().split(/\s+/).length;
		if (n > maxN) maxN = n;
	}

	const clips: IndexEntry[] = [];
	let i = 0;

	while (i < words.length) {
		let matched = false;

		// Try longest possible sequence first
		for (let n = Math.min(maxN, words.length - i); n >= 1; n--) {
			const phrase = words.slice(i, i + n).join(' ');
			const entry = lookup.get(phrase);
			if (entry) {
				clips.push(entry);
				i += n;
				matched = true;
				break;
			}
		}

		if (!matched) {
			return {
				error: `Word not found in clips: "${words[i]}"`,
			};
		}
	}

	return { clips };
}
