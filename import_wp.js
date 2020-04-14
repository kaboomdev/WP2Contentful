/*
TODO:
    1. Make the import available for all locales


*/
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const contentful = require('contentful-management');
const TurndownService = require('turndown');
const { richTextFromMarkdown } = require('@contentful/rich-text-from-markdown');

const errors = JSON.parse(fs.readFileSync(path.resolve("./logs/errors_posts.json")));
const publishedPosts = JSON.parse(fs.readFileSync(path.resolve("./logs/published_posts.json")));



const turndownService = new TurndownService();
const posts = JSON.parse(fs.readFileSync(path.resolve('./wp-posts.json')));

//Read all exported assets and filter only the ones that had been successfully published
const publishedAssets = JSON.parse(fs.readFileSync(path.resolve('./logs/published_assets.json'))).filter(el => el.sysId);
migratePosts(posts);


async function transformPost(post) {
    const markdown = turndownService.turndown(post.body.replace(/<a[^>]+>[^<]*<img[^>]+>[^<]*<\/a>/mg, ''))
    fs.writeFileSync(path.resolve('./post-markdown.md'), markdown);
    let parsedContent;
    
    try {
        parsedContent = await richTextFromMarkdown(markdown, imgTagParse(post));
    } catch (error) {
        const errorComment = "Error in richTextFromMarkdown";
        logError(post.slug, e, errorComment);
        console.log(`${post.slug} - ${errorComment}.`);
    }

    const postData = {
        publishDate: post.publishDate,
        title: post.title,
        description: turndownService.turndown(post.excerpt).replace(/\s?\\\[…\\\]/g, ''),
        content: parsedContent,
        slug: post.slug,
        image: getFeaturedImage(post, "full"),
        thumbnail: getFeaturedImage(post, "thumbnail_480x360"),
        author: post.author,
        tags: post.terms
    };
    return postData;
};

function imgTagParse(post) {

    return (node) => {
        if (node.type === 'image') {
            const url = encodeURI(node.url);
            const asset = publishedAssets.find(el => el.url === url);

            if (asset) {
                console.log("BodyImage found: ", asset.url);
                return {
                    nodeType: 'embedded-asset-block',
                    content: [],
                    data: {
                        target: {
                            sys: {
                                type: 'Link',
                                linkType: 'Asset',
                                id: asset.sysId
                            }
                        }
                    }
                }
            } else {
                const errorComment = "BodyImage was not published. URL: " + url;
                console.log(errorComment);
                logError(post.slug, e, errorComment);
                return null;
            }
        }
    }
}

function getFeaturedImage(post, size) {
    try {
        const wpFeaturedImage = post.featuredMedia[0];
        const title = (wpFeaturedImage.title && wpFeaturedImage.title.rendered) || wpFeaturedImage.alt_text || '_';
        return {
            title,
            filename: `${wpFeaturedImage.media_details.sizes[size].file}_${size}`,
            type: wpFeaturedImage.media_details.sizes[size].mime_type,
            url: wpFeaturedImage.media_details.sizes[size].source_url
        };
    } catch (e) {
        const errorComment = "Error in getting featured image with size: "+size;
        logError(post.slug, e, errorComment);
        console.log(`${post.slug} - ${errorComment}.`);
        return null;
    }


}

async function processAsset(environment, post, imgField) {
    if (!post[imgField]) {
        return null;
    }
    const url = encodeURI(post[imgField].url);

    //Check if the asset is already published and return id, else publish it and return id
    const publishedAsset = publishedAssets.find(asset => asset.url === url);
    if (publishedAsset) {
        return new Promise(resolve => {
            resolve(publishedAsset.sysId)
        });
    } else {
        return environment.createAsset({
            fields: {
                title: {
                    'en-US': post[imgField].title || post[imgField].filename
                },
                file: {
                    'en-US': {
                        contentType: post[imgField].type,
                        fileName: post[imgField].filename,
                        upload: url,
                    }
                },
            }
        })
            .then(asset => asset.processForLocale('en-US'), { processingCheckWait: 2000 })
            .then(asset => asset.publish())
            .then(asset => asset.sys.id)
    }

}


async function migrateToContentful(environment, post) {
    //Get the uploaded ids of image and thumbnail

    const imageAssetId = await processAsset(environment, post, "image");
    const imageThumbnailAssetId = await processAsset(environment, post, "thumbnail");

    //Build data for the image and thumbnail
    const imageAssetData = imageAssetId ? {
        'en-US': {
            sys: {
                type: 'Link',
                linkType: 'Asset',
                id: imageAssetId
            }
        }
    } : null;
    const imageThumbnailAssetData = imageThumbnailAssetId ? {
        'en-US': {
            sys: {
                type: 'Link',
                linkType: 'Asset',
                id: imageThumbnailAssetId
            }
        }
    } : null;


    return await environment.createEntry('blogPost', {
        fields: {
            title: {
                'en-US': post.title
            },
            publishDate: {
                'en-US': post.publishDate
            },
            description: {
                'en-US': post.description
            },
            slug: {
                'en-US': post.slug
            },
            content: {
                'en-US': post.content
            },
            author: {
                'en-US': post.author
            },
            tags: {
                'en-US': post.tags
            },
            image: imageAssetData,
            thumbnail: imageThumbnailAssetData,
        }
    })
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function migratePosts(posts, startFrom = 0) {
    const environment = await getContentfulEnvironment();
    for (const postIndex in posts) {
        if (postIndex < startFrom) {
            continue;
        }
        console.log(`Migrating ${postIndex} of ${posts.length - 1}`);
        const post = posts[postIndex];


        let entry;
        try {
            const transformedPost = await transformPost(post);
            entry = await migrateToContentful(environment, transformedPost);
        } catch (e) {
            const errorComment = "Error while migrating";
            logError(post.slug, e, errorComment);
            console.log(`${errorComment} ${post.slug}e`);
            continue;
        }

        try {
            await entry.publish();
        } catch (e) {
            const errorComment = "Error while publishing";
            logError(post.slug, e, errorComment);
            console.log(`${errorComment} ${post.slug}`);
            continue;
        }
        publishedPosts.push({
            slug: post.slug
        })
        await timeout(2000);
    }
    console.log('Migration done.');
    fs.writeFileSync(path.resolve('./logs/published_posts.json'), JSON.stringify(publishedPosts));
    fs.writeFileSync(path.resolve('./logs/errors_posts.json'), JSON.stringify(errors));
}

async function getContentfulEnvironment() {
    const client = contentful.createClient({
        accessToken: process.env.MANAGEMENT_TOKEN
    });
    const space = await client.getSpace(process.env.SPACE_ID);
    return await space.getEnvironment('master');
}

function logError(identifier, error, comment) {
    const errObj = {
        identifier: identifier,
        comment: comment,
        body: error,
    };
    errors.push(errObj);
}

//Testing single post upload
async function init() {
    const environment = await getContentfulEnvironment();
    const post = await transformPost(posts[2]);
    console.log(await migrateToContentful(environment, post));
}


