const url = 'https://avexdesigns.com/wp-json/wp/v2/posts';
const fs = require('fs');
const path = require('path');
const https = require("https");

const exportBlogposts = (apiUrl) => new Promise(resolve => {
  const exportPageOfPosts = (apiUrl, page = 2, allPosts = []) => {
    if (page === 3) {
        return resolve(allPosts)
    };
    console.log(`Getting posts for page ${page}`);
    const url = `${apiUrl}?_embed&page=${page}`;
    https.get(url, (res) => {
      // When we get a 404 back we went one page over those with posts.
      // So we are done now.
      if(res.statusCode === 400) {
        return resolve(allPosts)
      }
      let result = ''
  
      res.on('data', (d) => {
        result += d.toString()
      })
  
      res.on('end', async () => {
				blogPosts = JSON.parse(result)
        return exportPageOfPosts(apiUrl, page + 1, allPosts.concat(blogPosts))
      })
    
    }).on('error', (e) => {
      throw(Error('Error while exporting blogposts', e))
    })
  }
  exportPageOfPosts(apiUrl)
})


const transformPosts = posts => posts.map(post => {
  delete post.jetpack_featured_media_url
	delete post.yst_prominent_words
	delete post._links
  delete post.guid
  delete post.author
  delete post.comment_status
  delete post.ping_status
  delete post.template
  delete post.format
  delete post.meta
  delete post.status
  delete post.type
  post.publishDate = post.date_gmt + '+00:00'
  delete post.date_gmt
  delete post.date
  delete post.modified
  delete post.modified_gmt
  delete post.tags
  delete post.sticky
  post.body = `<div>${post.content.rendered}</div>`
  post.excerpt = `<div>${post.excerpt.rendered}</div>`
  delete post.content
  post.title = post.title.rendered
  post.slug = post.slug
  delete post.categories

  post.author = post._embedded.author[0].name
  post.terms = post._embedded['wp:term'][1].map(item => item.name)
  post.featuredMedia = post._embedded['wp:featuredmedia'] ? post._embedded['wp:featuredmedia'] : undefined; 
  delete post._embedded

  return extractBodyImages(post)
})

const extractBodyImages = post =>{
  const regex = /<img.*?src="(.*?)"[\s\S]*?alt="(.*?)"/g
  post.bodyImages = []
  while (foundImage = regex.exec(post.body)) {
    const alt = foundImage[2] ? foundImage[2].replace(/_/g, ' ') : ''
    post.bodyImages.push({
      link: foundImage[1],
      description: alt,
      title: alt,
      postId: post.id
    })
  }
  return post
}

exportBlogposts(url)
.then(async posts => {
		const transformed = await transformPosts(posts);
		fs.writeFileSync(path.resolve('./wp-posts.json'), JSON.stringify(transformed));
			console.log('WP posts exported successfully');
})
.catch(e => {
		console.log(e);
});