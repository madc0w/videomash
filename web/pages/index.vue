<template>
	<div class="container">
		<h1>🎬 VideoMash</h1>
		<p class="subtitle">
			Type some words and we'll mash together a video from clips!
		</p>

		<div class="form-group">
			<label for="category">Category</label>
			<select
				id="category"
				v-model="selectedCategory"
				:disabled="state === 'working'"
			>
				<option value="">Any category</option>
				<option v-for="cat in categories" :key="cat" :value="cat">
					{{ cat }}
				</option>
			</select>
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
			<video
				ref="videoEl"
				autoplay
				@ended="onClipEnded"
				@error="onVideoError"
			/>
		</div>

		<!-- Done -->
		<div v-if="state === 'done'" class="status done">
			✅ Done! <button class="replay-btn" @click="replay">Replay</button>
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
import { ref } from 'vue';
import { matchClips, type IndexEntry } from '~/utils/matchClips';

type State = 'idle' | 'working' | 'error' | 'playing' | 'done';

const userText = ref('');
const selectedCategory = ref('');
const categories = ref<string[]>([]);
const state = ref<State>('idle');
const errorMessage = ref('');
const clips = ref<IndexEntry[]>([]);
const currentClipIndex = ref(0);
const videoEl = ref<HTMLVideoElement | null>(null);

let indexData: IndexEntry[] | null = null;

async function loadIndex(): Promise<IndexEntry[]> {
	if (indexData) return indexData;
	const res = await fetch('/index.json');
	if (!res.ok) throw new Error('Failed to load index.json');
	indexData = (await res.json()) as IndexEntry[];
	return indexData;
}

async function loadCategories() {
	try {
		const res = await fetch('/categories.json');
		if (res.ok) categories.value = await res.json();
	} catch {}
}

loadCategories();

async function mashIt() {
	state.value = 'working';
	errorMessage.value = '';
	clips.value = [];
	currentClipIndex.value = 0;

	try {
		const index = await loadIndex();
		await new Promise((r) => setTimeout(r, 200));

		const result = matchClips(
			userText.value,
			index,
			selectedCategory.value || undefined
		);

		if (result.error) {
			errorMessage.value = result.error;
			state.value = 'error';
			return;
		}

		clips.value = result.clips ?? [];
		state.value = 'playing';

		await nextTick();
		playClip(0);
	} catch (err: any) {
		errorMessage.value = err.message || 'Something went wrong';
		state.value = 'error';
	}
}

function playClip(index: number) {
	currentClipIndex.value = index;
	const el = videoEl.value;
	if (!el || index >= clips.value.length) {
		state.value = 'done';
		return;
	}
	el.src = clips.value[index].url;
	el.play().catch(() => {});
}

function onClipEnded() {
	playClip(currentClipIndex.value + 1);
}

function onVideoError() {
	console.warn(
		`Failed to load clip: ${clips.value[currentClipIndex.value]?.url}`
	);
	playClip(currentClipIndex.value + 1);
}

function replay() {
	state.value = 'playing';
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

.form-group select {
	width: 100%;
	padding: 0.75rem 1rem;
	font-size: 1rem;
	border: 2px solid #333;
	border-radius: 10px;
	background: #1a1a2e;
	color: #e0e0e0;
	outline: none;
	transition: border-color 0.2s;
	cursor: pointer;
}

.form-group select:focus {
	border-color: #7873f5;
}

.form-group select:disabled {
	opacity: 0.5;
	cursor: not-allowed;
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
