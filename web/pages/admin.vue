<template>
	<div class="container">
		<h1>🔐 Admin</h1>
		<p class="subtitle">
			Submit a YouTube URL to add clips to the index, or permanently delete
			Cloudinary videos.
		</p>

		<div class="form-group">
			<label for="password">Password</label>
			<input
				id="password"
				v-model="password"
				type="password"
				placeholder="Enter admin password"
				:disabled="isProcessing"
			/>
		</div>

		<div class="form-group">
			<label for="category">Category</label>
			<select id="category" v-model="selectedCategory" :disabled="isProcessing">
				<option value="">— No category selected —</option>
				<option v-for="cat in categories" :key="cat" :value="cat">
					{{ cat }}
				</option>
			</select>
		</div>

		<div class="form-group">
			<label for="youtubeUrl">YouTube URL</label>
			<input
				id="youtubeUrl"
				v-model="youtubeUrl"
				type="url"
				placeholder="https://www.youtube.com/watch?v=..."
				:disabled="isProcessing"
			/>
		</div>

		<div class="button-row">
			<button
				class="upload-btn"
				:disabled="
					isProcessing || !password || !youtubeUrl || !selectedCategory
				"
				@click="submit"
			>
				🚀 Process Video
			</button>

			<button
				class="delete-btn"
				:disabled="isProcessing || !password"
				@click="requestDelete"
			>
				🗑️
				{{ selectedCategory ? 'Delete Category Videos' : 'Delete All Videos' }}
			</button>
		</div>

		<p class="danger-note">
			Deletes every Cloudinary video for the selected category. If no category
			is selected, it deletes everything under VideoMash.
		</p>

		<div v-if="isProcessing" class="status working">
			<div class="spinner" />
			<span>{{ statusMessage }}</span>
		</div>

		<div v-if="progressLog.length" class="progress-log" ref="logContainer">
			<div v-for="(msg, idx) in progressLog" :key="idx" class="progress-line">
				{{ msg }}
			</div>
		</div>

		<div v-if="error" class="status error">⚠️ {{ error }}</div>

		<div v-if="result" class="result">
			<div class="status done">
				<span>
					✅ Done! Added
					<strong>{{ result.newClips }}</strong> new clips. Total:
					<strong>{{ result.totalClips }}</strong>
				</span>
			</div>
			<div v-if="result.words.length" class="new-words">
				<p class="new-words-title">New words added:</p>
				<div class="chip-list">
					<span v-for="w in result.words" :key="w" class="chip played">
						{{ w }}
					</span>
				</div>
			</div>
		</div>

		<div v-if="deleteResult" class="result">
			<div class="status done danger-done">
				<span>
					✅ Deleted
					<strong>{{ deleteResult.deletedResources }}</strong>
					Cloudinary resources and removed
					<strong>{{ deleteResult.deletedClips }}</strong>
					indexed clips. Remaining index size:
					<strong>{{ deleteResult.remainingClips }}</strong>
				</span>
			</div>
		</div>

		<NuxtLink to="/" class="back-link">← Back to VideoMash</NuxtLink>

		<div
			v-if="isShowDuplicateModal"
			class="modal-overlay"
			@click.self="isShowDuplicateModal = false"
		>
			<div class="modal">
				<p class="modal-title">⚠️ Duplicate URL</p>
				<p class="modal-message">
					This YouTube URL already exists in the index under category
					<strong>"{{ duplicateCategory }}"</strong>. Do you want to process it
					again?
				</p>
				<div class="modal-actions">
					<button
						class="modal-btn cancel"
						@click="isShowDuplicateModal = false"
					>
						Cancel
					</button>
					<button class="modal-btn ok" @click="confirmSubmit">OK</button>
				</div>
			</div>
		</div>

		<div
			v-if="isShowDeleteModal"
			class="modal-overlay"
			@click.self="isShowDeleteModal = false"
		>
			<div class="modal danger-modal">
				<p class="modal-title">🗑️ Delete Videos</p>
				<p class="modal-message">
					This will permanently delete all Cloudinary videos for
					<strong>{{ deleteScopeLabel }}</strong> and remove those entries from
					the public index.
				</p>
				<div class="modal-actions">
					<button class="modal-btn cancel" @click="isShowDeleteModal = false">
						Cancel
					</button>
					<button class="modal-btn delete-confirm" @click="confirmDelete">
						Delete Permanently
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';

const password = ref('');
const selectedCategory = ref('');
const categories = ref<string[]>([]);
const youtubeUrl = ref('');
const isProcessing = ref(false);
const error = ref('');
const result = ref<{
	newClips: number;
	totalClips: number;
	words: string[];
} | null>(null);
const deleteResult = ref<{
	scope: 'category' | 'all';
	category: string | null;
	deletedClips: number;
	deletedResources: number;
	remainingClips: number;
} | null>(null);
const statusMessage = ref('');
const progressLog = ref<string[]>([]);
const logContainer = ref<HTMLElement | null>(null);
const baseURL = useRuntimeConfig().app.baseURL;
const isShowDuplicateModal = ref(false);
const isShowDeleteModal = ref(false);
const duplicateCategory = ref('');
const indexData = ref<{ source?: string; category?: string }[]>([]);

const deleteScopeLabel = computed(() =>
	selectedCategory.value
		? `the category \"${selectedCategory.value}\"`
		: 'every VideoMash category'
);

async function loadIndex() {
	try {
		const res = await fetch(`${baseURL}index.json`);
		if (res.ok) indexData.value = await res.json();
	} catch {}
}

loadIndex();

function extractVideoId(url: string): string | null {
	try {
		const u = new URL(url);
		if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
		return u.searchParams.get('v');
	} catch {
		return null;
	}
}

function findDuplicateSource(url: string): string | null {
	const id = extractVideoId(url);
	if (!id) return null;
	const match = indexData.value.find((entry) => {
		return entry.source && extractVideoId(entry.source) === id;
	});
	return match?.category || null;
}

async function loadCategories() {
	try {
		const res = await fetch(`${baseURL}categories.json`);
		if (res.ok) categories.value = await res.json();
	} catch {}
}

loadCategories();

async function scrollLogToBottom() {
	await nextTick();
	if (logContainer.value) {
		logContainer.value.scrollTop = logContainer.value.scrollHeight;
	}
}

async function submit() {
	if (!youtubeUrl.value || !password.value) return;

	const dupCategory = findDuplicateSource(youtubeUrl.value);
	if (dupCategory) {
		duplicateCategory.value = dupCategory;
		isShowDuplicateModal.value = true;
	} else {
		doSubmit();
	}
}

function confirmSubmit() {
	isShowDuplicateModal.value = false;
	doSubmit();
}

async function doSubmit() {
	if (!youtubeUrl.value || !password.value) return;

	isProcessing.value = true;
	error.value = '';
	result.value = null;
	deleteResult.value = null;
	progressLog.value = [];
	statusMessage.value = 'Starting…';

	try {
		const res = await fetch('/api/upload', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				password: password.value,
				category: selectedCategory.value,
				youtubeUrl: youtubeUrl.value,
			}),
		});

		if (
			!res.ok &&
			res.headers.get('content-type')?.includes('application/json')
		) {
			const msg =
				res.status === 401
					? 'Invalid password'
					: (await res.json().catch(() => null))?.message ||
					  res.statusText ||
					  'Processing failed';
			throw new Error(msg);
		}

		if (!res.ok) {
			throw new Error(res.statusText || 'Processing failed');
		}

		const reader = res.body!.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const event = JSON.parse(line);
					if (event.type === 'progress') {
						statusMessage.value = event.message;
						progressLog.value.push(event.message);
						scrollLogToBottom();
					} else if (event.type === 'result') {
						result.value = {
							newClips: event.newClips,
							totalClips: event.totalClips,
							words: event.words,
						};
					} else if (event.type === 'error') {
						throw new Error(event.message);
					}
				} catch (parseErr: any) {
					if (
						parseErr.message &&
						parseErr.message !== 'Unexpected end of JSON input'
					) {
						throw parseErr;
					}
				}
			}
		}

		if (buffer.trim()) {
			try {
				const event = JSON.parse(buffer);
				if (event.type === 'result') {
					result.value = {
						newClips: event.newClips,
						totalClips: event.totalClips,
						words: event.words,
					};
				} else if (event.type === 'error') {
					throw new Error(event.message);
				}
			} catch {}
		}

		if (!result.value && !error.value) {
			throw new Error('No result received from server');
		}
	} catch (err: any) {
		error.value = err.message || 'Something went wrong';
	} finally {
		isProcessing.value = false;
	}
}

function requestDelete() {
	if (!password.value || isProcessing.value) return;
	isShowDeleteModal.value = true;
}

async function confirmDelete() {
	isShowDeleteModal.value = false;
	await doDelete();
}

async function doDelete() {
	if (!password.value) return;

	isProcessing.value = true;
	error.value = '';
	result.value = null;
	deleteResult.value = null;
	progressLog.value = [];
	statusMessage.value = selectedCategory.value
		? `Deleting videos in ${selectedCategory.value}…`
		: 'Deleting all VideoMash videos…';

	try {
		const res = await fetch('/api/delete-videos', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				password: password.value,
				category: selectedCategory.value || undefined,
			}),
		});

		const payload = await res.json().catch(() => null);

		if (!res.ok) {
			throw new Error(
				res.status === 401
					? 'Invalid password'
					: payload?.message || res.statusText || 'Delete failed'
			);
		}

		deleteResult.value = {
			scope: payload?.scope === 'category' ? 'category' : 'all',
			category: typeof payload?.category === 'string' ? payload.category : null,
			deletedClips: Number(payload?.deletedClips ?? 0),
			deletedResources: Number(payload?.deletedResources ?? 0),
			remainingClips: Number(payload?.remainingClips ?? 0),
		};
		statusMessage.value = payload?.message || 'Delete complete';
		progressLog.value = [statusMessage.value];
		await loadIndex();
	} catch (err: any) {
		error.value = err.message || 'Something went wrong';
	} finally {
		isProcessing.value = false;
	}
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

.form-group input[type='password'] {
	width: 100%;
	padding: 0.75rem 1rem;
	font-size: 1rem;
	border: 2px solid #333;
	border-radius: 10px;
	background: #1a1a2e;
	color: #e0e0e0;
	outline: none;
	transition: border-color 0.2s;
}

.form-group input[type='password']:focus {
	border-color: #7873f5;
}

.form-group input[type='url'] {
	width: 100%;
	padding: 0.75rem 1rem;
	font-size: 1rem;
	border: 2px solid #333;
	border-radius: 10px;
	background: #1a1a2e;
	color: #e0e0e0;
	outline: none;
	transition: border-color 0.2s;
}

.form-group input[type='url']:focus {
	border-color: #7873f5;
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

.form-group input:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.button-row {
	width: 100%;
	display: flex;
	gap: 0.75rem;
	flex-wrap: wrap;
}

.upload-btn {
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

.upload-btn:hover:not(:disabled) {
	transform: scale(1.04);
}

.upload-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.delete-btn {
	padding: 0.75rem 2rem;
	font-size: 1.05rem;
	font-weight: 600;
	border: 1px solid #7a2736;
	border-radius: 10px;
	background: linear-gradient(135deg, #5c1420, #aa2d44);
	color: #fff;
	cursor: pointer;
	transition: transform 0.15s, opacity 0.2s;
}

.delete-btn:hover:not(:disabled) {
	transform: scale(1.04);
}

.delete-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.danger-note {
	width: 100%;
	margin: -0.25rem 0 0;
	font-size: 0.88rem;
	line-height: 1.45;
	color: #d79aa5;
}

.result {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.new-words {
	width: 100%;
}

.new-words-title {
	font-size: 0.9rem;
	color: #888;
	margin-bottom: 0.5rem;
}

.chip-list {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.back-link {
	margin-top: 2rem;
	color: #7873f5;
	font-size: 0.95rem;
	text-decoration: none;
}

.back-link:hover {
	text-decoration: underline;
}

.progress-log {
	width: 100%;
	max-height: 240px;
	overflow-y: auto;
	background: #111122;
	border: 1px solid #333;
	border-radius: 10px;
	padding: 0.75rem 1rem;
	font-family: 'Courier New', Courier, monospace;
	font-size: 0.82rem;
	color: #8f8;
	line-height: 1.5;
}

.progress-line {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.modal-overlay {
	position: fixed;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	background: rgba(0, 0, 0, 0.6);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 1000;
}

.modal {
	background: #1a1a2e;
	border: 2px solid #444;
	border-radius: 14px;
	padding: 1.5rem 2rem;
	max-width: 420px;
	width: 90%;
	text-align: center;
}

.modal-title {
	font-size: 1.2rem;
	font-weight: 700;
	margin-bottom: 0.75rem;
}

.modal-message {
	font-size: 0.95rem;
	color: #ccc;
	line-height: 1.5;
	margin-bottom: 1.25rem;
}

.modal-actions {
	display: flex;
	gap: 0.75rem;
	justify-content: center;
}

.modal-btn {
	padding: 0.55rem 1.5rem;
	font-size: 1rem;
	font-weight: 600;
	border: none;
	border-radius: 8px;
	cursor: pointer;
	transition: transform 0.15s;
}

.modal-btn:hover {
	transform: scale(1.04);
}

.modal-btn.cancel {
	background: #333;
	color: #ccc;
}

.modal-btn.ok {
	background: linear-gradient(135deg, #7873f5, #ff6ec7);
	color: #fff;
}

.danger-done {
	background: rgba(170, 45, 68, 0.16);
	border-color: #aa2d44;
	color: #ffd7dd;
}

.danger-modal {
	border-color: #7a2736;
}

.delete-confirm {
	background: linear-gradient(135deg, #7a2736, #c93a57);
	color: #fff;
}

@media (max-width: 640px) {
	.button-row {
		flex-direction: column;
	}

	.upload-btn,
	.delete-btn {
		width: 100%;
	}
}
</style>
