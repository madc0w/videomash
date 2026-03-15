<template>
	<div class="container">
		<h1>🎬 VideoMash</h1>
		<p class="subtitle">
			Type some words and we'll mash together a video from clips!
		</p>

		<div class="form-group">
			<label>Categories</label>
			<div class="multi-select" :class="{ disabled: state === 'working' }">
				<div class="multi-select-toggle" @click="toggleDropdown">
					<span v-if="selectedCategories.length === 0" class="placeholder"
						>Any category</span
					>
					<span v-else class="selected-summary">{{
						selectedCategories.join(', ')
					}}</span>
					<span class="arrow">▾</span>
				</div>
				<div v-if="isDropdownOpen" class="multi-select-dropdown">
					<label
						v-for="cat in categories"
						:key="cat"
						class="multi-select-option"
						@click.stop
					>
						<input type="checkbox" :value="cat" v-model="selectedCategories" />
						{{ cat }}
					</label>
				</div>
			</div>
		</div>

		<textarea
			v-model="userText"
			placeholder="Type your text here…"
			:disabled="state === 'working'"
			rows="4"
		/>

		<button
			class="mash-btn"
			:disabled="state === 'working' || !userText.trim()"
			@click="mashIt"
		>
			🎬 Mash it!
		</button>

		<!-- Working state -->
		<div v-if="state === 'working'" class="status working">
			<div class="spinner" />
			<span>Working…</span>
		</div>

		<!-- Error state -->
		<div v-if="state === 'error'" class="status error">
			⚠️ {{ errorMessage }}
		</div>

		<!-- Player -->
		<div v-if="state === 'playing'" class="player">
			<p class="clip-info">
				Clip {{ currentClipIndex + 1 }} / {{ clips.length }} —
				<em>"{{ clips[currentClipIndex]?.word }}"</em>
			</p>
			<div class="video-wrapper">
				<video
					ref="videoA"
					:class="{ active: activeVideo === 'A' }"
					@ended="onClipEnded"
					@error="onVideoError"
				/>
				<video
					ref="videoB"
					:class="{ active: activeVideo === 'B' }"
					@ended="onClipEnded"
					@error="onVideoError"
				/>
			</div>
		</div>

		<!-- Done -->
		<div v-if="state === 'done'" class="status done">
			✅ Done! <button class="replay-btn" @click="replay">Replay</button>
		</div>

		<!-- Skipped words -->
		<div
			v-if="skippedWords.length && (state === 'playing' || state === 'done')"
			class="skipped-words"
		>
			<span v-for="(word, idx) in skippedWords" :key="idx" class="skipped-chip">
				{{ word }}
			</span>
		</div>

		<!-- Word list preview -->
		<div
			v-if="clips.length && (state === 'playing' || state === 'done')"
			class="clip-list"
		>
			<span
				v-for="(clip, idx) in clips"
				:key="idx"
				class="chip"
				:class="{
					active: state === 'playing' && idx === currentClipIndex,
					played: idx < currentClipIndex || state === 'done',
				}"
			>
				{{ clip.word }}
			</span>
		</div>

		<NuxtLink to="/admin" class="admin-link">Admin</NuxtLink>
	</div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { matchClips, type IndexEntry } from '~/utils/matchClips';

type State = 'idle' | 'working' | 'error' | 'playing' | 'done';

const userText = ref('');
const selectedCategories = ref<string[]>([]);
const categories = ref<string[]>([]);
const isDropdownOpen = ref(false);
const state = ref<State>('idle');
const errorMessage = ref('');
const clips = ref<IndexEntry[]>([]);
const skippedWords = ref<string[]>([]);
const currentClipIndex = ref(0);
const videoA = ref<HTMLVideoElement | null>(null);
const videoB = ref<HTMLVideoElement | null>(null);
const activeVideo = ref<'A' | 'B'>('A');

let indexData: IndexEntry[] | null = null;
const baseURL = useRuntimeConfig().app.baseURL;

async function loadIndex(): Promise<IndexEntry[]> {
	if (indexData) return indexData;
	const res = await fetch(`${baseURL}index.json`);
	if (!res.ok) throw new Error('Failed to load index.json');
	indexData = (await res.json()) as IndexEntry[];
	return indexData;
}

async function loadCategories() {
	try {
		const index = await loadIndex();
		const cats = new Set<string>();
		for (const entry of index) {
			if (entry.category) cats.add(entry.category);
		}
		categories.value = [...cats].sort();
	} catch {}
}

loadCategories();

function toggleDropdown() {
	if (state.value === 'working') return;
	isDropdownOpen.value = !isDropdownOpen.value;
}

function closeDropdown(e: MouseEvent) {
	const target = e.target as HTMLElement;
	if (!target.closest('.multi-select')) {
		isDropdownOpen.value = false;
	}
}

onMounted(() => document.addEventListener('click', closeDropdown));
onUnmounted(() => document.removeEventListener('click', closeDropdown));

async function mashIt() {
	state.value = 'working';
	errorMessage.value = '';
	clips.value = [];
	skippedWords.value = [];
	currentClipIndex.value = 0;

	try {
		const index = await loadIndex();
		await new Promise((r) => setTimeout(r, 200));

		const result = matchClips(
			userText.value,
			index,
			selectedCategories.value.length > 0 ? selectedCategories.value : undefined
		);

		if (result.error) {
			errorMessage.value = result.error;
			state.value = 'error';
			return;
		}

		skippedWords.value = result.skippedWords;
		clips.value = result.clips;
		state.value = 'playing';
		activeVideo.value = 'A';

		await nextTick();
		playClip(0);
	} catch (err: any) {
		errorMessage.value = err.message || 'Something went wrong';
		state.value = 'error';
	}
}

function getActiveEl(): HTMLVideoElement | null {
	return activeVideo.value === 'A' ? videoA.value : videoB.value;
}

function getInactiveEl(): HTMLVideoElement | null {
	return activeVideo.value === 'A' ? videoB.value : videoA.value;
}

function preloadNext(nextIndex: number) {
	const el = getInactiveEl();
	if (!el || nextIndex >= clips.value.length) return;
	el.src = clips.value[nextIndex].url;
	el.load();
}

function playClip(index: number) {
	currentClipIndex.value = index;
	const el = getActiveEl();
	if (!el || index >= clips.value.length) {
		state.value = 'done';
		return;
	}
	el.src = clips.value[index].url;
	el.load();
	el.play().catch(() => {});

	// Preload the next clip in the inactive video
	preloadNext(index + 1);
}

function onClipEnded() {
	const nextIndex = currentClipIndex.value + 1;
	if (nextIndex >= clips.value.length) {
		state.value = 'done';
		return;
	}

	// Swap to the pre-loaded inactive video
	activeVideo.value = activeVideo.value === 'A' ? 'B' : 'A';
	currentClipIndex.value = nextIndex;

	const el = getActiveEl();
	if (el) {
		el.play().catch(() => {});
	}

	// Preload the next clip in the now-inactive video
	preloadNext(nextIndex + 1);
}

function onVideoError() {
	console.warn(
		`Failed to load clip: ${clips.value[currentClipIndex.value]?.url}`
	);
	// Skip to next, reset the inactive buffer for the one after
	const nextIndex = currentClipIndex.value + 1;
	if (nextIndex >= clips.value.length) {
		state.value = 'done';
		return;
	}
	activeVideo.value = activeVideo.value === 'A' ? 'B' : 'A';
	currentClipIndex.value = nextIndex;

	const el = getActiveEl();
	if (el) {
		el.src = clips.value[nextIndex].url;
		el.load();
		el.play().catch(() => {});
	}
	preloadNext(nextIndex + 1);
}

function replay() {
	state.value = 'playing';
	activeVideo.value = 'A';
	nextTick(() => playClip(0));
}
</script>

<style scoped>
.form-group {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
}

.form-group label {
	font-size: 0.9rem;
	color: #aaa;
	font-weight: 600;
}

.multi-select {
	position: relative;
	width: 100%;
}

.multi-select.disabled {
	opacity: 0.5;
	pointer-events: none;
}

.multi-select-toggle {
	width: 100%;
	padding: 0.75rem 1rem;
	font-size: 1rem;
	border: 2px solid #333;
	border-radius: 10px;
	background: #1a1a2e;
	color: #e0e0e0;
	cursor: pointer;
	display: flex;
	justify-content: space-between;
	align-items: center;
	transition: border-color 0.2s;
}

.multi-select-toggle:hover {
	border-color: #7873f5;
}

.multi-select-toggle .placeholder {
	color: #888;
}

.multi-select-toggle .selected-summary {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	margin-right: 0.5rem;
}

.multi-select-toggle .arrow {
	flex-shrink: 0;
	color: #888;
}

.multi-select-dropdown {
	position: absolute;
	top: calc(100% + 4px);
	left: 0;
	right: 0;
	background: #1a1a2e;
	border: 2px solid #333;
	border-radius: 10px;
	max-height: 220px;
	overflow-y: auto;
	z-index: 10;
	padding: 0.35rem 0;
}

.multi-select-option {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	padding: 0.55rem 1rem;
	cursor: pointer;
	font-size: 0.95rem;
	color: #e0e0e0;
	transition: background 0.15s;
}

.multi-select-option:hover {
	background: #2a2a4a;
}

.multi-select-option input[type='checkbox'] {
	accent-color: #7873f5;
	width: 16px;
	height: 16px;
	cursor: pointer;
}

textarea {
	width: 100%;
	padding: 1rem;
	font-size: 1.1rem;
	border: 2px solid #333;
	border-radius: 12px;
	background: #1a1a2e;
	color: #e0e0e0;
	resize: vertical;
	outline: none;
	transition: border-color 0.2s;
}

textarea:focus {
	border-color: #7873f5;
}

textarea:disabled {
	opacity: 0.5;
}

.mash-btn {
	padding: 0.75rem 2rem;
	font-size: 1.15rem;
	font-weight: 600;
	border: none;
	border-radius: 10px;
	background: linear-gradient(135deg, #7873f5, #ff6ec7);
	color: #fff;
	cursor: pointer;
	transition: transform 0.15s, opacity 0.2s;
}

.mash-btn:hover:not(:disabled) {
	transform: scale(1.04);
}

.mash-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.player {
	width: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.75rem;
}

.player video {
	width: 100%;
	border-radius: 12px;
	background: #000;
	position: absolute;
	top: 0;
	left: 0;
	opacity: 0;
	pointer-events: none;
	transition: none;
}

.player video.active {
	opacity: 1;
	pointer-events: auto;
}

.video-wrapper {
	position: relative;
	width: 100%;
	aspect-ratio: 16 / 9;
	border-radius: 12px;
	overflow: hidden;
	background: #000;
}

.clip-info {
	font-size: 0.95rem;
	color: #888;
}

.clip-list {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
	justify-content: center;
}

.replay-btn {
	margin-left: 0.75rem;
	padding: 0.4rem 1rem;
	border: none;
	border-radius: 6px;
	background: #7873f5;
	color: #fff;
	cursor: pointer;
	font-size: 0.95rem;
}

.replay-btn:hover {
	background: #6b65e0;
}

.skipped-words {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
	justify-content: center;
}

.skipped-chip {
	padding: 0.25rem 0.6rem;
	border-radius: 6px;
	font-size: 0.85rem;
	background: rgba(220, 38, 38, 0.25);
	color: #f87171;
	border: 1px solid rgba(220, 38, 38, 0.4);
}

.admin-link {
	margin-top: 2rem;
	color: #555;
	font-size: 0.85rem;
	text-decoration: none;
}

.admin-link:hover {
	color: #7873f5;
}
</style>
