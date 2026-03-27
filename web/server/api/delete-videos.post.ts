import { v2 as cloudinary } from 'cloudinary';
import path from 'path';

import { readIndex, writeIndex } from '../utils/processVideo';

function getCloudinaryPublicId(url: string): string | null {
	try {
		const pathname = new URL(url).pathname;
		const uploadMarker = '/video/upload/';
		const uploadIndex = pathname.indexOf(uploadMarker);

		if (uploadIndex === -1) return null;

		const assetPath = pathname.slice(uploadIndex + uploadMarker.length);
		const segments = assetPath.split('/').filter(Boolean);

		while (segments[0] && /^v\d+$/.test(segments[0])) {
			segments.shift();
		}

		if (!segments.length) return null;

		segments[segments.length - 1] = segments[segments.length - 1].replace(
			/\.[^.]+$/,
			''
		);

		return segments.join('/');
	} catch {
		return null;
	}
}

async function listCloudinaryPublicIdsByPrefix(
	prefix: string
): Promise<string[]> {
	const publicIds: string[] = [];
	let nextCursor: string | undefined;

	do {
		const response = await cloudinary.api.resources({
			resource_type: 'video',
			type: 'upload',
			prefix,
			max_results: 500,
			...(nextCursor ? { next_cursor: nextCursor } : {}),
		});

		for (const resource of response.resources ?? []) {
			if (resource.public_id) publicIds.push(resource.public_id);
		}

		nextCursor = response.next_cursor;
	} while (nextCursor);

	return publicIds;
}

async function deleteCloudinaryPublicIds(publicIds: string[]): Promise<number> {
	let deletedCount = 0;

	for (let start = 0; start < publicIds.length; start += 100) {
		const chunk = publicIds.slice(start, start + 100);
		const response = await cloudinary.api.delete_resources(chunk, {
			resource_type: 'video',
			type: 'upload',
			invalidate: true,
		});

		for (const status of Object.values(response.deleted ?? {})) {
			if (status === 'deleted') deletedCount += 1;
		}
	}

	return deletedCount;
}

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const body = await readBody(event);

	if (!body) {
		throw createError({ statusCode: 400, statusMessage: 'No request body' });
	}

	const password = typeof body.password === 'string' ? body.password : '';
	const category =
		typeof body.category === 'string' ? body.category.trim() : '';

	if (!config.adminPassword || password !== config.adminPassword) {
		throw createError({ statusCode: 401, statusMessage: 'Invalid password' });
	}

	if (
		!config.cloudinaryCloudName ||
		!config.cloudinaryApiKey ||
		!config.cloudinaryApiSecret
	) {
		throw createError({
			statusCode: 500,
			statusMessage: 'Cloudinary credentials are not configured',
		});
	}

	cloudinary.config({
		cloud_name: config.cloudinaryCloudName,
		api_key: config.cloudinaryApiKey,
		api_secret: config.cloudinaryApiSecret,
	});

	const indexPath = path.resolve('public', 'index.json');
	const existingIndex = readIndex(indexPath);

	if (category) {
		const entriesToDelete = existingIndex.filter(
			(entry) => entry.category === category
		);
		const publicIds = [
			...new Set(
				entriesToDelete
					.map((entry) => getCloudinaryPublicId(entry.url))
					.filter((value): value is string => Boolean(value))
			),
		];
		const deletedResources = publicIds.length
			? await deleteCloudinaryPublicIds(publicIds)
			: 0;
		const updatedIndex = existingIndex.filter(
			(entry) => entry.category !== category
		);

		writeIndex(indexPath, updatedIndex);

		return {
			success: true,
			scope: 'category',
			category,
			deletedClips: entriesToDelete.length,
			deletedResources,
			remainingClips: updatedIndex.length,
			message: entriesToDelete.length
				? `Deleted ${entriesToDelete.length} indexed clips from ${category}.`
				: `No indexed clips found for ${category}.`,
		};
	}

	const publicIds = await listCloudinaryPublicIdsByPrefix('videomash/');
	const deletedResources = publicIds.length
		? await deleteCloudinaryPublicIds(publicIds)
		: 0;

	writeIndex(indexPath, []);

	return {
		success: true,
		scope: 'all',
		category: null,
		deletedClips: existingIndex.length,
		deletedResources,
		remainingClips: 0,
		message: publicIds.length
			? 'Deleted all VideoMash videos from Cloudinary and cleared the index.'
			: 'No VideoMash videos were found in Cloudinary. The index was cleared.',
	};
});
