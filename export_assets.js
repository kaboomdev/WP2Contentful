const fs = require("fs")
const path = require("path")
var getJSON = require("get-json")
const fetch = require('node-fetch');

const generateAssetsList = (posts, baseUrl, simpleLog = console.log) =>
  new Promise(async resolve => {
    const apiURL = `${baseUrl.replace(/\/$/, "")}/wp-json/wp/v2/media`
    simpleLog("Reducing posts to asset numbers")
    let infosFetched = 0

    // First add the featured_media images and get ther URLs.
    const featuredAssets = await Promise.all(
      posts
        .reduce((all, post) => {
          if (!post.featured_media) return all
          return all.concat([
            {
              mediaNumber: post.featured_media,
              postId: post.id,
            },
          ])
        }, [])
        .map(async ({ mediaNumber, postId }, i, array) => {
          const featuredMedia = await fetch(`${apiURL}/${mediaNumber}`).then(response => {
						return response.json()
					})
         
          infosFetched += 1
          simpleLog(`Getting info about assets ${infosFetched}/${array.length}`)
          if (featuredMedia.id) {
            return {
              //mediaNumber,
              link: featuredMedia.guid.rendered,
              title: featuredMedia.title.rendered || `asset${i}`,
              description: featuredMedia.alt_text || "",
              postId,
            }
					} 
        })
    )
    const assets = featuredAssets.concat(posts.reduce((all, post) => {
      const images = post.bodyImages ? post.bodyImages : []
      return all.concat(images)
    }, []))

  	resolve(assets)
  })

const baseUrl = "https://avexdesigns.com"
const posts = JSON.parse(fs.readFileSync(path.resolve("./wp-posts.json")))

generateAssetsList(posts, baseUrl).then(posts => {
		fs.writeFileSync(path.resolve('./wp-assets.json'), JSON.stringify(posts.filter(e=>e != null)));
			console.log('WP assets exported successfully');
})
.catch(e => {
		console.log(e);
});
