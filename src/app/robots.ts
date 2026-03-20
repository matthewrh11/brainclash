import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/auth/', '/match/', '/queue/', '/lobby/'],
    },
    sitemap: 'https://brainclash.vercel.app/sitemap.xml',
  };
}
