<template>
	<NuxtPage />
</template>

<style>
* {
	box-sizing: border-box;
	margin: 0;
	padding: 0;
}

body {
	font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
	background: #0f0f1a;
	color: #e0e0e0;
	min-height: 100vh;
}

.container {
	max-width: 640px;
	margin: 0 auto;
	padding: 3rem 1.5rem;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1.25rem;
}

h1 {
	font-size: 2.4rem;
	background: linear-gradient(135deg, #ff6ec7, #7873f5);
	-webkit-background-clip: text;
	background-clip: text;
	-webkit-text-fill-color: transparent;
}

.subtitle {
	color: #888;
	text-align: center;
}

.status {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	font-size: 1.1rem;
	padding: 1rem 1.5rem;
	border-radius: 10px;
	width: 100%;
	justify-content: center;
}

.working {
	background: #1c1c3a;
	color: #a5a0ff;
}

.error {
	background: #2e1a1a;
	color: #ff6b6b;
}

.done {
	background: #1a2e1c;
	color: #6bffa5;
}

.spinner {
	width: 24px;
	height: 24px;
	border: 3px solid rgba(165, 160, 255, 0.3);
	border-top-color: #a5a0ff;
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.chip {
	padding: 0.3rem 0.65rem;
	border-radius: 6px;
	background: #1c1c3a;
	color: #888;
	font-size: 0.85rem;
	transition: all 0.25s;
}

.chip.active {
	background: #7873f5;
	color: #fff;
	transform: scale(1.1);
}

.chip.played {
	background: #2a2a4a;
	color: #aaa;
}
</style>
