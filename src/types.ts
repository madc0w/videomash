/** A single word detected by Whisper with its timestamps */
export interface WordTimestamp {
	word: string;
	start: number; // seconds
	end: number; // seconds
}

/** An entry in the output index.json */
export interface IndexEntry {
	url: string;
	word: string;
	start: number; // start time in seconds
	length: number; // duration in seconds
}
