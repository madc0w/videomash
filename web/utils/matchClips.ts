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
 * If categories are provided, only clips with one of those categories are used.
 *
 * Returns { clips } on success, or { error, word } if a word is not found.
 */
export function matchClips(
	text: string,
	index: IndexEntry[],
	categories?: string[]
): { clips: IndexEntry[]; skippedWords: string[]; error?: string } {
	// Filter by categories if provided
	const filtered =
		categories && categories.length > 0
			? index.filter((e) => e.category && categories.includes(e.category))
			: index;

	const words = text
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9'\s]/g, '')
		.split(/\s+/)
		.filter(Boolean);

	if (words.length === 0) {
		return { clips: [], skippedWords: [], error: 'Please enter some text.' };
	}

	// Build a lookup: normalised phrase -> all matching IndexEntries
	const lookup = new Map<string, IndexEntry[]>();
	for (const entry of filtered) {
		const key = entry.word.toLowerCase().trim();
		const arr = lookup.get(key);
		if (arr) {
			arr.push(entry);
		} else {
			lookup.set(key, [entry]);
		}
	}

	// Find the maximum n-gram size available in the index
	let maxN = 1;
	for (const entry of filtered) {
		const n = entry.word.trim().split(/\s+/).length;
		if (n > maxN) maxN = n;
	}

	const clips: IndexEntry[] = [];
	const skippedWords: string[] = [];
	let i = 0;

	while (i < words.length) {
		let matched = false;

		// Try longest possible sequence first
		for (let n = Math.min(maxN, words.length - i); n >= 1; n--) {
			const phrase = words.slice(i, i + n).join(' ');
			const entries = lookup.get(phrase);
			if (entries) {
				// Pick a random clip from all matches
				const entry = entries[Math.floor(Math.random() * entries.length)];
				clips.push(entry);
				i += n;
				matched = true;
				break;
			}
		}

		if (!matched) {
			skippedWords.push(words[i]);
			i++;
		}
	}

	return { clips, skippedWords };
}
