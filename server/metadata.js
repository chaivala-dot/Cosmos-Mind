const axios = require('axios');
const cheerio = require('cheerio');

const getMetadata = async (url) => {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            }
        });
        const $ = cheerio.load(data);

        const title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
        const description = $('meta[property="og:description"]').attr('content') ||
            $('meta[name="description"]').attr('content') || '';
        const image = $('meta[property="og:image"]').attr('content') ||
            $('meta[property="twitter:image"]').attr('content') || '';

        // Auto-tagging heuristics
        const textToScan = (title + ' ' + description).toLowerCase();
        const suggestedTags = [];

        const keywords = {
            'design': ['design', 'ui', 'ux', 'css', 'interface', 'art', 'creative', 'typography', 'figma', 'svg'],
            'dev': ['code', 'github', 'api', 'dev', 'programming', 'react', 'node', 'javascript', 'python', 'framework', 'library'],
            'ai': ['ai', 'gpt', 'llm', 'machine learning', 'neural', 'bot', 'diffusion', 'model'],
            'tools': ['tool', 'utility', 'software', 'app', 'product', 'platform', 'generator'],
            'content': ['blog', 'article', 'news', 'read', 'tutorial', 'guide', 'notion'],
            'inspiration': ['gallery', 'showcase', 'award', 'best', 'collection', 'moodboard'],
            'video': ['youtube', 'video', 'movie', 'cinema', 'watch'],
            'social': ['twitter', 'instagram', 'linkedin', 'social']
        };

        for (const [tag, words] of Object.entries(keywords)) {
            if (words.some(w => textToScan.includes(w))) {
                suggestedTags.push(tag);
            }
        }

        console.log(`Auto-tagging for ${url}: found ${suggestedTags.join(', ')}`);

        return { title, description, image, suggestedTags };
    } catch (err) {
        console.error('Error fetching metadata:', err.message);
        return { title: '', description: '', image: '', suggestedTags: [] };
    }
};

module.exports = { getMetadata };
