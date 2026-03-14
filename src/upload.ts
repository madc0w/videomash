import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a video clip to Cloudinary and return the secure URL.
 */
export async function uploadClip(
	localPath: string,
	publicId: string
): Promise<string> {
	const result = await cloudinary.uploader.upload(localPath, {
		resource_type: 'video',
		public_id: publicId,
		overwrite: true,
	});
	return result.secure_url;
}
