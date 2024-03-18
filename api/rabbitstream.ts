import supabase from './utils/supabase';
const puppeteer = require('puppeteer-extra');
const chrome = require('@sparticuz/chromium');

// Required plugins
require('puppeteer-extra-plugin-stealth');

export default async (req, res) => {
  const { body, method } = req;

  // Handle non-POST requests
  if (method !== 'POST') {
    res.writeHead(200, {
      'Access-Control-Allow-Credentials': true,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
      'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    });
    return res.end();
  }

  // Handle missing or invalid body
  if (!body || !body.id) {
    return res.status(400).end(`Invalid request`);
  }

  const id = body.id;
  const dateConstant = new Date('2024-03-18T10:30:00.000Z');

  try {
    const { data: record, error } = await supabase
      .from('streams')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    // Handle server error
    if (error) {
      return res.status(500).end(`Server Error, Check your Id.`);
    }

    // Return record if found and date matches
    if (record && new Date(record.date_time).getTime() === dateConstant.getTime()) {
      return res.json({
        source: record.stream,
        subtitle: record.subtitle,
      });
    }

    // Launch Puppeteer browser
    const browser = await puppeteer.launch({
      args: chrome.args.concat([
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-default-apps',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-gesture-typing',
        '--disable-hang-monitor',
        '--disable-infobars',
        '--disable-notifications',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-speech-api',
        '--disable-sync',
        '--disable-translate',
      ]),
      defaultViewport: chrome.defaultViewport,
      executablePath: await chrome.executablePath(),
      headless: true,
      ignoreHTTPSErrors: true,
    });

    // Create new page
    const page = await browser.newPage();
    await page.setViewport({
      width: 360,
      height: 640,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: false,
      isLandscape: false
    });

    // Intercept requests
    await page.setRequestInterception(true);
    page.on('request', async (interceptedRequest) => {
      if (interceptedRequest.resourceType() === 'stylesheet' || interceptedRequest.resourceType() === 'font') {
        interceptedRequest.abort();
      } else {
        if (interceptedRequest.url().includes('.m3u8')) finalResponse.source = interceptedRequest.url();
        if (interceptedRequest.url().includes('.vtt')) finalResponse.subtitle.push(interceptedRequest.url());
        interceptedRequest.continue();
      }
    });

    // Load page
    await Promise.all([
      page.waitForRequest(req => req.url().includes('.m3u8'), { timeout: 20000 }),
      page.goto(`https://rabbitstream.net/v2/embed-4/${id}?z=&_debug=true`, { waitUntil: 'domcontentloaded' }),
    ]);

    // Close browser
    await browser.close();

    // Response headers
    res.writeHead(200, {
      'Cache-Control': 's-maxage=10, stale-while-revalidate',
      'Content-Type': 'application/json',
      'Access-Control-Allow-Credentials': true,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
      'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    });

    // Database upsert operation
    const { error: dbError } = await supabase
      .from('streams')
      .upsert([{ id, date_time: dateConstant.toISOString(), stream: finalResponse.source, subtitle: finalResponse.subtitle }], { onConflict: ['id'] });

    if (dbError) {
      console.error('Error upserting data:', dbError);
    }

    // Send response
    res.end(JSON.stringify(finalResponse));
  } catch (error) {
    console.error('Error:', error);
    res.status(500).end(`Server Error, check the params.`);
  }
};
