// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	ssr: false,
	app: {
		head: {
			title: 'VideoMash',
			meta: [
				{ charset: 'utf-8' },
				{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			],
		},
	},
	compatibilityDate: '2025-01-01',
	runtimeConfig: {
		adminPassword: process.env.ADMIN_PW || '',
		openaiApiKey: process.env.OPENAI_API_KEY || '',
		cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
		cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
		cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
	},
});
