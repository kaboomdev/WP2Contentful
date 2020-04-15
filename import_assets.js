require('dotenv').config();
const contentful = require('contentful-management');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const mimeTypeMap = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml'
};

const errors = JSON.parse(fs.readFileSync(path.resolve("./logs/errors_assets.json")));
const publishedAssets = JSON.parse(fs.readFileSync(path.resolve("./logs/published_assets.json")));



const assets = JSON.parse(fs.readFileSync(path.resolve("./wp-assets.json")));
const locale = 'en-US';
const client = contentful.createClient({
  accessToken: process.env.MANAGEMENT_TOKEN
})


init();
async function init() {
  for (const asset of assets) {
    try {
      if (asset.link.includes("beta.avexstage")) {
        asset.link = asset.link.replace("beta.avexstage", "https://avexdesigns");
      }
      await axios.get(asset.link);
    } catch (e) {
      const errorComment = `Error in ${asset.link}, skipping.`;
      console.error(errorComment);
      logError(asset, e, errorComment);
      continue;
    }

    const publishedAsset = await createAndPublishSingleAsset(asset);

    //Save the id from contentful and the encoded url to reference later
    publishedAssets.push({
      sysId: publishedAsset.sys.id,
      url: publishedAsset.wpAsset.url,
    })
  }
  fs.writeFileSync(path.resolve('./logs/published_assets.json'), JSON.stringify(publishedAssets));
  fs.writeFileSync(path.resolve('./logs/errors_assets.json'), JSON.stringify(errors));
}


async function createAndPublishSingleAsset(asset) {
  const space = await client.getSpace(process.env.SPACE_ID)
  return new Promise(async (resolve) => {
    let cmsAsset;

    //Encode and remove query params
    const url = encodeURI(asset.link).split("?")[0];
    asset.url = url;

    const extension = url.match(/\.(jpg|jpeg|png|gif|svg)$/)[1];
    const fileName = url.match(/\/([^\/]+)$/)[1];
    try {
      cmsAsset = await space.createAsset({
        fields: {
          title: {
            [locale]: asset.title
          },
          description: {
            [locale]: asset.description
          },
          file: {
            [locale]: {
              contentType: mimeTypeMap[extension],
              fileName: fileName,
              upload: url
            }
          }
        }
      })
    } catch (e) {
      const errorComment = `Error! Asset "${asset.link}" failed to create.`;
      console.error(errorComment);
      logError(asset, e, errorComment);
    }

    try {
      const processedCMSAsset = await cmsAsset.processForLocale(locale, { processingCheckWait: 2000 });
      const publishedCMSAsset = await processedCMSAsset.publish()


      // Save mapping information
      publishedCMSAsset.wpAsset = asset;
      console.log(`Published asset ${asset.link}`);
      
      //Contentful timeout workaround
      await timeout(2000);
      resolve(publishedCMSAsset);
    } catch (e) {
      const errorComment = `Error! Asset "${asset.link}" failed to process and publish..`;
      console.error(errorComment);
      logError(asset, e, errorComment);
    }
  })
};

function logError(asset, error, comment) {
  const errObj = {
    identifier: {
      url: asset.link,
      postId: asset.postId
    },
    comment: comment,
    body: error,
  };
  errors.push(errObj);
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}